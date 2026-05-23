"""
Google Alerts の RSS フィードをポーリングして新着URLをスクレイパーキューに投入する Lambda。
毎日実行。

Google Alerts RSS URL の設定方法:
  1. https://www.google.com/alerts でアラートを作成
  2. 「配信先」→「RSSフィード」を選択
  3. 表示されたRSSのURLをSSM Parameter Storeに保存
     /hackathon/google_alerts_feeds (JSON配列)
"""
import json
import os
import hashlib
import boto3
import feedparser
import requests
from datetime import datetime, timedelta, timezone

SCRAPER_QUEUE_URL = os.environ["SCRAPER_QUEUE_URL"]
SSM_FEEDS_KEY = os.environ.get("SSM_FEEDS_KEY", "/hackathon/google_alerts_feeds")
SEEN_TABLE = os.environ["DYNAMODB_TABLE"]

sqs = boto3.client("sqs")
ssm = boto3.client("ssm")
dynamodb = boto3.resource("dynamodb")
seen_table = dynamodb.Table(SEEN_TABLE)

SKIP_DOMAINS = {"connpass.com", "doorkeeper.jp", "devpost.com"}


def handler(event, context):
    feed_urls = get_feed_urls()
    if not feed_urls:
        print("[google_alerts] no RSS feeds configured")
        return {"statusCode": 200, "message": "no feeds configured"}

    total = 0
    for feed_url in feed_urls:
        count = process_feed(feed_url)
        total += count
        print(f"[google_alerts] feed={feed_url[:60]}... new={count}")

    return {"statusCode": 200, "enqueued": total}


def get_feed_urls() -> list[str]:
    try:
        resp = ssm.get_parameter(Name=SSM_FEEDS_KEY)
        return json.loads(resp["Parameter"]["Value"])
    except ssm.exceptions.ParameterNotFound:
        print(f"[google_alerts] SSM key {SSM_FEEDS_KEY} not found")
        return []


def process_feed(feed_url: str) -> int:
    feed = feedparser.parse(feed_url)
    cutoff = datetime.now(timezone.utc) - timedelta(days=2)
    count = 0

    for entry in feed.entries:
        published = entry.get("published_parsed")
        if published:
            pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
            if pub_dt < cutoff:
                continue

        link = entry.get("link", "")
        if not link:
            continue

        domain = link.split("/")[2] if link.startswith("http") else ""
        if any(skip in domain for skip in SKIP_DOMAINS):
            continue

        url_hash = hashlib.md5(link.encode()).hexdigest()
        if is_seen(url_hash):
            continue

        sqs.send_message(
            QueueUrl=SCRAPER_QUEUE_URL,
            MessageBody=json.dumps({
                "url": link,
                "content": None,
                "discovered_at": datetime.utcnow().isoformat(),
            }, ensure_ascii=False),
            MessageDeduplicationId=url_hash,
            MessageGroupId="google_alerts",
        )
        mark_seen(url_hash)
        count += 1

    return count


def is_seen(url_hash: str) -> bool:
    resp = seen_table.get_item(Key={"source_id": f"seen#{url_hash}"})
    return "Item" in resp


def mark_seen(url_hash: str):
    seen_table.put_item(Item={
        "source_id": f"seen#{url_hash}",
        "ttl": int((datetime.utcnow() + timedelta(days=30)).timestamp()),
    })
