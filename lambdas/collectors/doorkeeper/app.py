"""
Doorkeeper API からハッカソンイベントを収集する Lambda。
https://www.doorkeeper.jp/developer/api
"""
import json
import os
import sys
import boto3
import requests
from datetime import datetime, timedelta

sys.path.insert(0, "/opt/python")

TABLE_NAME = os.environ["DYNAMODB_TABLE"]
QUEUE_URL = os.environ.get("DEDUP_QUEUE_URL", "")

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")
table = dynamodb.Table(TABLE_NAME)

DOORKEEPER_API = "https://api.doorkeeper.jp/events"
KEYWORDS = ["ハッカソン", "hackathon"]


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
        resp.raise_for_status()
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

    return results


def parse_event(e: dict) -> dict | None:
    starts_at = (e.get("starts_at") or "")[:10]
    ends_at = (e.get("ends_at") or "")[:10]

    if not starts_at:
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
        "title": e.get("title", ""),
        "source_url": e.get("public_url", ""),
        "source_name": "doorkeeper",
        "start_date": starts_at,
        "end_date": ends_at,
        "description": (e.get("description") or "")[:500],
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
            Key={"source_id": item["source_id"]},
            UpdateExpression="SET updated_at = :ua",
            ExpressionAttributeValues={":ua": item["updated_at"]},
        )
