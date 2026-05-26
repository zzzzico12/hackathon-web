"""
techplay.jp/event/tag/hackathon からハッカソンイベントURLを収集して
スクレイパーキューに投入する Lambda。

techplay.jp は Inertia.js を使用しており、HTML の data-page 属性に
JSON 形式でイベントデータが埋め込まれているため、APIなしで取得可能。
ページネーションは meta.next_page_url で制御。
"""
import hashlib
import json
import os
import re
from datetime import datetime

import boto3
import requests

SCRAPER_QUEUE_URL = os.environ["SCRAPER_QUEUE_URL"]

sqs = boto3.client("sqs")

TAG_URL = "https://techplay.jp/event/tag/hackathon"
BASE_URL = "https://techplay.jp"
MAX_PAGES = 10  # 無限ループ防止


def extract_inertia_data(html: str) -> dict | None:
    """data-page 属性から Inertia.js のページデータを取得する。"""
    m = re.search(r'data-page=["\']({.*?})["\']', html, re.DOTALL)
    if not m:
        return None
    try:
        raw = m.group(1).replace("&quot;", '"').replace("&#39;", "'")
        return json.loads(raw)
    except Exception:
        return None


def fetch_page(url: str) -> tuple[list[dict], str | None]:
    """指定ページのイベント一覧と次ページURLを返す。"""
    resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()

    data = extract_inertia_data(resp.text)
    if not data:
        return [], None

    events_block = data.get("props", {}).get("events", {})
    events = events_block.get("data", [])
    next_url = events_block.get("meta", {}).get("next_page_url")

    return events, next_url


def enqueue(url: str):
    uid = hashlib.md5(url.encode()).hexdigest()
    sqs.send_message(
        QueueUrl=SCRAPER_QUEUE_URL,
        MessageBody=json.dumps({
            "url": url,
            "content": None,
            "discovered_at": datetime.utcnow().isoformat(),
        }, ensure_ascii=False),
        MessageDeduplicationId=uid,
        MessageGroupId="techplay",
    )


def handler(event, context):
    all_events: list[dict] = []
    next_url: str | None = TAG_URL

    for _ in range(MAX_PAGES):
        if not next_url:
            break
        events, next_url = fetch_page(next_url)
        all_events.extend(events)
        print(f"[techplay] fetched {len(events)} events, next={next_url}")
        if not next_url:
            break

    print(f"[techplay] total {len(all_events)} events")

    for e in all_events:
        url = f"{BASE_URL}/event/{e['id']}"
        enqueue(url)
        print(f"[techplay] enqueued: {url} ({e.get('title', '')})")

    return {"statusCode": 200, "enqueued": len(all_events)}
