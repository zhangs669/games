# RSS & 播客订阅服务

基于 **FastAPI + SQLite** 的后端程序，可用于订阅 RSS/播客源、刷新内容并提供查询接口。

## 功能概览

- 订阅管理：创建、查看、删除订阅
- RSS/播客抓取：支持 ETag / Last-Modified 条件请求，减少带宽
- 条目存储：自动保存新节目或文章，避免重复
- 查询接口：分页获取最新条目，或按订阅筛选

## 快速开始

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

运行后可通过 `http://localhost:8000/docs` 访问交互式接口。

## 主要接口

- `POST /feeds`：传入 `{"url": "https://example.com/feed.xml"}` 订阅，并默认立即刷新
- `GET /feeds`：列出所有订阅
- `GET /feeds/{id}`：查看单个订阅及其条目
- `POST /feeds/{id}/refresh`：手动刷新并返回新增条目数量
- `GET /episodes?limit=50&feed_id=1`：查询条目

## 配置

通过 `.env` 覆盖:

- `DATABASE_URL`：默认 `sqlite:///rss.sqlite3`
- `FEED_HTTP_TIMEOUT`
- `USER_AGENT`
- `ALLOW_ORIGIN`

## 后续扩展建议

- 集成 Celery/APS 等定时刷新
- 增加用户分组或多租户支持
- 提供通知（Webhook/邮件）以推送新节目

