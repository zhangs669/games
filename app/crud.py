"""业务逻辑：订阅、刷新、查询等操作。"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import models


def create_feed(db: Session, url: str) -> models.Feed:
    feed = models.Feed(url=url, last_checked=None, last_published=None)
    db.add(feed)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("该订阅已存在") from exc
    db.refresh(feed)
    return feed


def list_feeds(db: Session) -> list[models.Feed]:
    statement: Select[tuple[models.Feed]] = (
        select(models.Feed)
        .options(selectinload(models.Feed.episodes))
        .order_by(models.Feed.id.desc())
    )
    return list(db.scalars(statement))


def get_feed(db: Session, feed_id: int) -> models.Feed | None:
    return db.get(models.Feed, feed_id)


def get_feed_with_episodes(db: Session, feed_id: int) -> models.Feed | None:
    statement: Select[tuple[models.Feed]] = (
        select(models.Feed)
        .options(selectinload(models.Feed.episodes))
        .where(models.Feed.id == feed_id)
    )
    return db.scalar(statement)


def delete_feed(db: Session, feed: models.Feed) -> None:
    db.delete(feed)
    db.commit()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def upsert_episode(db: Session, feed: models.Feed, payload: dict) -> tuple[bool, models.Episode]:
    guid = payload["guid"]
    if not guid:
        return False, None  # type: ignore[return-value]

    statement = select(models.Episode).where(
        models.Episode.feed_id == feed.id, models.Episode.guid == guid
    )
    existing = db.scalar(statement)
    if existing:
        return False, existing

    episode = models.Episode(
        feed_id=feed.id,
        guid=guid,
        title=payload.get("title"),
        link=payload.get("link"),
        summary=payload.get("summary"),
        audio_url=payload.get("audio_url"),
        duration=payload.get("duration"),
        published=payload.get("published"),
    )
    db.add(episode)
    return True, episode


def apply_feed_metadata(feed: models.Feed, payload: dict) -> None:
    feed.title = payload.get("title") or feed.title
    feed.description = payload.get("description") or feed.description
    feed.link = payload.get("link") or feed.link
    feed.language = payload.get("language") or feed.language
    feed.last_published = payload.get("published") or feed.last_published


def refresh_feed(
    db: Session, feed: models.Feed, fetch_result: dict
) -> dict[str, int | datetime]:
    if fetch_result.get("not_modified"):
        feed.last_checked = _now()
        db.commit()
        return {"new": 0, "skipped": 0, "last_checked": feed.last_checked}

    apply_feed_metadata(feed, fetch_result["feed"])
    feed.etag = fetch_result.get("etag") or feed.etag
    feed.modified = fetch_result.get("modified") or feed.modified
    feed.last_checked = _now()

    new_items = 0
    skipped_items = 0
    for entry in fetch_result["entries"]:
        created, _ = upsert_episode(db, feed, entry)
        if created:
            new_items += 1
        else:
            skipped_items += 1

    db.commit()
    db.refresh(feed)
    return {"new": new_items, "skipped": skipped_items, "last_checked": feed.last_checked}


def list_episodes(db: Session, feed_id: int | None, limit: int) -> list[models.Episode]:
    statement = select(models.Episode).order_by(models.Episode.published.desc().nullslast())
    if feed_id:
        statement = statement.where(models.Episode.feed_id == feed_id)
    statement = statement.limit(limit)
    return list(db.scalars(statement))

