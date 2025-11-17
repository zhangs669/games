"""Pydantic Schema 定义。"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl, field_validator


class FeedBase(BaseModel):
    url: HttpUrl


class FeedCreate(FeedBase):
    auto_refresh: bool = True


class FeedUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None


class Episode(BaseModel):
    id: int
    feed_id: int
    guid: str
    title: Optional[str]
    link: Optional[str]
    summary: Optional[str]
    audio_url: Optional[str]
    duration: Optional[str]
    published: Optional[datetime]

    class Config:
        orm_mode = True


class Feed(BaseModel):
    id: int
    url: str
    title: Optional[str]
    description: Optional[str]
    link: Optional[str]
    language: Optional[str]
    last_checked: Optional[datetime]
    last_published: Optional[datetime]

    class Config:
        orm_mode = True


class FeedDetail(Feed):
    episodes: list[Episode] = Field(default_factory=list)


class FeedRefreshResult(BaseModel):
    feed_id: int
    new_items: int
    skipped_items: int
    last_checked: datetime


class EpisodeQuery(BaseModel):
    feed_id: Optional[int] = None
    limit: int = 50

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, value: int) -> int:
        if not 1 <= value <= 200:
            raise ValueError("limit 需在 1-200 之间")
        return value

