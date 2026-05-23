"""
connpass API からハッカソンイベントを収集する Lambda。
https://connpass.com/about/api/
"""
import json
import os
import boto3
import requests
from datetime import datetime, timedelta

TABLE_NAME = os.environ["DYNAMODB_TABLE"]
QUEUE_URL = os.environ.get("DEDUP_QUEUE_URL", "")
CONNPASS_API_KEY_SSM = os.environ.get("CONNPASS_API_KEY_SSM_NAME", "/hackathon/connpass_api_key")

dynamodb = boto3.resource("dynamodb")
sqs = boto3.client("sqs")
ssm = boto3.client("ssm")
table = dynamodb.Table(TABLE_NAME)

CONNPASS_API = "https://connpass.com/api/v2/events/"
KEYWORDS = ["ハッカソン", "hackathon"]

_api_key: str | None = None


def get_api_key() -> str:
    global _api_key
    if _api_key is None:
        resp = ssm.get_parameter(Name=CONNPASS_API_KEY_SSM, WithDecryption=True)
        _api_key = resp["Parameter"]["Value"]
    return _api_key


def handler(event, context):
    collected = []
    for keyword in KEYWORDS:
        items = fetch_events(keyword)
        collected.extend(items)
        print(f"[connpass] keyword={keyword} fetched={len(items)}")

    unique = {item["source_id"]: item for item in collected}
    print(f"[connpass] total unique events: {len(unique)}")

    for item in unique.values():
        enqueue(item)

    return {"statusCode": 200, "collected": len(unique)}


def fetch_events(keyword: str) -> list:
    results = []
    start = 1
    count = 100
    headers = {"X-Api-Key": get_api_key()}

    while True:
        resp = requests.get(
            CONNPASS_API,
            params={
                "keyword": keyword,
                "count": count,
                "start": start,
                "order": 2,   # 開催日順
            },
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        events = data.get("events", [])
        if not events:
            break

        for e in events:
            item = parse_event(e)
            if item:
                results.append(item)

        if len(events) < count:
            break
        start += count

    return results


def parse_event(e: dict) -> dict | None:
    started_at = (e.get("started_at") or "")[:10]
    ended_at = (e.get("ended_at") or "")[:10]

    if not started_at:
        return None

    one_year_ago = (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d")
    if started_at < one_year_ago:
        return None

    place = e.get("place") or ""
    is_online = "オンライン" in place or "online" in place.lower() or not place
    online_status = "ONLINE" if is_online else "OFFLINE"

    today = datetime.utcnow().strftime("%Y-%m-%d")
    status = "UPCOMING" if started_at >= today else "PAST"

    return {
        "source_id": f"connpass#{e['id']}",
        "title": e.get("title", ""),
        "source_url": e.get("url", ""),
        "source_name": "connpass",
        "start_date": started_at,
        "end_date": ended_at,
        "description": (e.get("description") or "")[:500],
        "location": place or None,
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
