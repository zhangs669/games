"""SQLAlchemy 数据模型。"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Feed(Base):
    """RSS/播客源。"""

    __tablename__ = "feeds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    url: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(250))
    description: Mapped[str | None] = mapped_column(Text())
    link: Mapped[str | None] = mapped_column(String(500))
    language: Mapped[str | None] = mapped_column(String(32))
    etag: Mapped[str | None] = mapped_column(String(128))
    modified: Mapped[str | None] = mapped_column(String(128))
    last_checked: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_published: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    episodes: Mapped[list["Episode"]] = relationship(
        "Episode",
        back_populates="feed",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(Episode.published)",
    )


class Episode(Base):
    """播客/文章条目。"""

    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("feed_id", "guid", name="uq_episode_feed_guid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    feed_id: Mapped[int] = mapped_column(
        ForeignKey("feeds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guid: Mapped[str] = mapped_column(String(512), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500))
    link: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text())
    audio_url: Mapped[str | None] = mapped_column(String(500))
    duration: Mapped[str | None] = mapped_column(String(64))
    published: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    feed: Mapped["Feed"] = relationship("Feed", back_populates="episodes")

