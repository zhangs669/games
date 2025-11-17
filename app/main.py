"""FastAPI 入口：RSS/播客订阅服务。"""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from app import crud, rss, schemas
from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import Feed as FeedModel

settings = get_settings()
app = FastAPI(title="RSS & Podcast Subscription API", version="1.0.0")

if settings.allow_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.allow_origin] if settings.allow_origin != "*" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/feeds", response_model=list[schemas.Feed], tags=["feeds"])
def list_feeds(db=Depends(get_db)):
    return crud.list_feeds(db)


@app.post(
    "/feeds",
    response_model=schemas.FeedDetail,
    status_code=status.HTTP_201_CREATED,
    tags=["feeds"],
)
async def subscribe_feed(payload: schemas.FeedCreate, db=Depends(get_db)):
    try:
        feed = crud.create_feed(db, payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.auto_refresh:
        fetch_result = await rss.fetch_feed(feed.url)
        crud.refresh_feed(db, feed, fetch_result)

    db.refresh(feed)
    return feed


@app.get("/feeds/{feed_id}", response_model=schemas.FeedDetail, tags=["feeds"])
def get_feed(feed_id: int, db=Depends(get_db)):
    feed = crud.get_feed(db, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="订阅不存在")
    return feed


@app.delete("/feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["feeds"])
def remove_feed(feed_id: int, db=Depends(get_db)):
    feed = crud.get_feed(db, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="订阅不存在")
    crud.delete_feed(db, feed)


@app.post(
    "/feeds/{feed_id}/refresh",
    response_model=schemas.FeedRefreshResult,
    tags=["feeds"],
)
async def refresh_feed(feed_id: int, db=Depends(get_db)):
    feed = crud.get_feed(db, feed_id)
    if not feed:
        raise HTTPException(status_code=404, detail="订阅不存在")

    try:
        fetch_result = await rss.fetch_feed(feed.url, feed.etag, feed.modified)
    except rss.FeedFetchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    stats = crud.refresh_feed(db, feed, fetch_result)
    return {
        "feed_id": feed.id,
        "new_items": stats["new"],
        "skipped_items": stats["skipped"],
        "last_checked": stats["last_checked"],
    }


@app.get("/episodes", response_model=list[schemas.Episode], tags=["episodes"])
def list_episodes(
    feed_id: int | None = Query(default=None, description="按订阅筛选"),
    limit: int = Query(default=50, ge=1, le=200),
    db=Depends(get_db),
):
    return crud.list_episodes(db, feed_id, limit)

