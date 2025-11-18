"""RSS/播客抓取与解析工具。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

import feedparser
import html2text
import httpx
from readability.readability import Document as ReadabilityDocument

from app.config import get_settings

settings = get_settings()


class FeedFetchError(RuntimeError):
    """网络或解析错误。"""


_markdown_converter = html2text.HTML2Text()
_markdown_converter.body_width = 0
_markdown_converter.ignore_links = False
_markdown_converter.ignore_images = True
_markdown_converter.ignore_emphasis = False
_markdown_converter.single_line_break = True


def _html_to_markdown(value: str | None) -> str | None:
    if not value:
        return value
    markdown = _markdown_converter.handle(value)
    cleaned = markdown.strip()
    return cleaned or None


def _to_datetime(struct_time: Any | None) -> datetime | None:
    if struct_time is None:
        return None
    return datetime.fromtimestamp(
        datetime(*struct_time[:6], tzinfo=timezone.utc).timestamp(), tz=timezone.utc
    )


def _extract_audio(entry: feedparser.util.FeedParserDict) -> str | None:
    enclosures: Iterable[dict[str, Any]] = entry.get("enclosures", [])
    for enclosure in enclosures:
        enclosure_type = enclosure.get("type", "")
        if "audio" in enclosure_type or enclosure.get("rel") == "enclosure":
            return enclosure.get("href")
    # 回退到 links
    for link in entry.get("links", []):
        if link.get("type", "").startswith("audio"):
            return link.get("href")
    return None


async def fetch_feed(
    url: str, etag: str | None = None, modified: str | None = None
) -> dict[str, Any]:
    """抓取并解析 RSS。

    返回 dict 包含 feed 元数据、entries、etag 等。
    """

    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    }
    if etag:
        headers["If-None-Match"] = etag
    if modified:
        headers["If-Modified-Since"] = modified

    async with httpx.AsyncClient(timeout=settings.feed_http_timeout) as client:
        response = await client.get(url, headers=headers, follow_redirects=True)

    if response.status_code == 304:
        return {"not_modified": True}
    if response.status_code >= 400:
        raise FeedFetchError(f"抓取失败：HTTP {response.status_code}")

    parsed = feedparser.parse(response.content)
    if parsed.bozo and not parsed.get("entries"):
        raise FeedFetchError(f"解析出错：{parsed.bozo_exception!s}")

    entries = []
    for entry in parsed.entries:
        summary = _html_to_markdown(entry.get("summary"))
        entries.append(
            {
                "guid": entry.get("id") or entry.get("guid") or entry.get("link"),
                "title": entry.get("title"),
                "link": entry.get("link"),
                "summary": summary,
                "published": _to_datetime(entry.get("published_parsed")),
                "audio_url": _extract_audio(entry),
                "duration": entry.get("itunes_duration"),
            }
        )

    feed_meta = parsed.feed or {}
    return {
        "not_modified": False,
        "etag": response.headers.get("ETag"),
        "modified": response.headers.get("Last-Modified"),
        "feed": {
            "title": feed_meta.get("title"),
            "description": _html_to_markdown(
                feed_meta.get("subtitle") or feed_meta.get("description")
            ),
            "link": feed_meta.get("link"),
            "language": feed_meta.get("language"),
            "published": _to_datetime(feed_meta.get("published_parsed")),
        },
        "entries": entries,
    }


async def fetch_full_content(url: str) -> str | None:
    """从URL抓取并提取文章全文内容（Markdown格式）。"""
    if not url:
        return None
    
    headers = {
        "User-Agent": settings.user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    
    try:
        async with httpx.AsyncClient(timeout=settings.feed_http_timeout) as client:
            response = await client.get(url, headers=headers, follow_redirects=True)
        
        if response.status_code >= 400:
            return None
        
        html_content = response.text
        
        # 使用 readability 提取正文
        try:
            doc = ReadabilityDocument(html_content)
            article_html = doc.summary()
            
            # 转换为 Markdown
            if article_html:
                markdown = _html_to_markdown(article_html)
                return markdown
        except Exception:
            # 如果 readability 失败，尝试直接转换整个HTML
            pass
        
        # 回退：直接转换HTML为Markdown
        return _html_to_markdown(html_content)
    except Exception:
        return None

