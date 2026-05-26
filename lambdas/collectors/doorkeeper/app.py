"""
Doorkeeper API からハッカソンイベントを収集する Lambda。
https://www.doorkeeper.jp/developer/api
"""
import json
import os
import time
import boto3
import requests
from datetime import datetime, timedelta
from html.parser import HTMLParser

TABLE_NAME = os.environ["DYNAMODB_TABLE"]
QUEUE_URL = os.environ.get("DEDUP_QUEUE_URL", "")

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")
table = dynamodb.Table(TABLE_NAME)

DOORKEEPER_API = "https://api.doorkeeper.jp/events"
KEYWORDS = ["ハッカソン", "hackathon"]
HACKATHON_KEYWORDS = ["ハッカソン", "hackathon", "hack"]


class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts = []

    def handle_data(self, data):
        self._parts.append(data)

    def get_text(self, max_len=300):
        text = " ".join(p.strip() for p in self._parts if p.strip())
        return text[:max_len]


def strip_html(html: str, max_len: int = 300) -> str:
    if not html:
        return ""
    s = _Stripper()
    s.feed(html)
    return s.get_text(max_len)


def is_hackathon(title: str) -> bool:
    t = title.lower()
    return any(k.lower() in t for k in HACKATHON_KEYWORDS)


def handler(event, context):
    collected = []
    for keyword in KEYWORDS:
        items = fetch_events(keyword)
        collected.extend(items)
        print(f"[doorkeeper] keyword={keyword} fetched={len(items)}")

    unique = {item["source_id"]: item for item in collected}
    print(f"[doorkeeper] total unique events: {len(unique)}")

    for item in unique.values():
        enqueue(item)

    return {"statusCode": 200, "collected": len(unique)}


def fetch_events(keyword: str) -> list:
    results = []
    page = 1
    per_page = 100

    while True:
        for attempt in range(4):
            resp = requests.get(
                DOORKEEPER_API,
                params={
                    "q": keyword,
                    "page": page,
                    "per_page": per_page,
                    "locale": "ja",
                },
                headers={"Accept": "application/json"},
                timeout=30,
            )
            if resp.status_code == 429:
                wait = 10 * (2 ** attempt)
                print(f"[doorkeeper] 429 rate limit (attempt {attempt+1}), waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            break
        else:
            print(f"[doorkeeper] gave up after rate limit retries at page={page}")
            break

        data = resp.json()
        if not data:
            break

        for entry in data:
            e = entry.get("event", {})
            item = parse_event(e)
            if item:
                results.append(item)

        if len(data) < per_page:
            break
        page += 1
        time.sleep(1)

    return results


def parse_event(e: dict) -> dict | None:
    starts_at = (e.get("starts_at") or "")[:10]
    ends_at = (e.get("ends_at") or "")[:10]
    title = e.get("title", "")

    if not starts_at:
        return None

    # タイトルにハッカソン関連キーワードがないものは除外
    if not is_hackathon(title):
        return None

    one_year_ago = (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d")
    if starts_at < one_year_ago:
        return None

    venue_name = e.get("venue_name") or ""
    address = e.get("address") or ""
    location = venue_name or address or None
    is_online = not location or "オンライン" in (location or "") or "online" in (location or "").lower()
    online_status = "ONLINE" if is_online else "OFFLINE"

    today = datetime.utcnow().strftime("%Y-%m-%d")
    status = "UPCOMING" if starts_at >= today else "PAST"

    event_id = e.get("id") or e.get("public_url", "").rstrip("/").split("/")[-1]

    return {
        "source_id": f"doorkeeper#{event_id}",
        "title": title,
        "source_url": e.get("public_url", ""),
        "source_name": "doorkeeper",
        "start_date": starts_at,
        "end_date": ends_at,
        "description": strip_html(e.get("description") or ""),
        "location": location,
        "is_online": is_online,
        "online_status": online_status,
        "prize_amount": 0,
        "prize_bucket": "NO_PRIZE",
        "themes": [],
        "is_beginner_friendly": False,
        "status": status,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }


def enqueue(item: dict):
    if QUEUE_URL:
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(item, ensure_ascii=False),
        )
    else:
        write_to_dynamo(item)


def write_to_dynamo(item: dict):
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(source_id)",
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        table.update_item(
            Key={"source_id": item["source_id"], "start_date": item["start_date"]},
            UpdateExpression="SET updated_at = :ua",
            ExpressionAttributeValues={":ua": item["updated_at"]},
        )
