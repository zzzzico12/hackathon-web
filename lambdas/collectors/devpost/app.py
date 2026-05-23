"""
Devpost API から日本関連ハッカソンを収集する Lambda。
https://devpost.com/api/hackathons.json（非公式エンドポイント）
"""
import json
import os
import re
import boto3
import requests
from datetime import datetime

QUEUE_URL = os.environ.get("DEDUP_QUEUE_URL", "")

sqs = boto3.client("sqs")

DEVPOST_API = "https://devpost.com/api/hackathons.json"
HEADERS = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}

# 日本関連と判断するキーワード（location / title を対象）
JAPAN_KEYWORDS = ["japan", "tokyo", "osaka", "kyoto", "大阪", "東京", "京都", "日本"]

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def handler(event, context):
    items = fetch_hackathons()
    print(f"[devpost] collected: {len(items)}")
    for item in items:
        enqueue(item)
    return {"statusCode": 200, "collected": len(items)}


def fetch_hackathons() -> list:
    results = []
    for query in ["japan", "hackathon japan"]:
        try:
            page = 1
            while page <= 3:
                resp = requests.get(
                    DEVPOST_API,
                    params={
                        "search": query,
                        "status[]": "upcoming",
                        "order_by": "recently-added",
                        "page": page,
                        "per_page": 24,
                    },
                    headers=HEADERS,
                    timeout=30,
                )
                resp.raise_for_status()
                data = resp.json()
                hackathons = data.get("hackathons", [])
                if not hackathons:
                    break
                for h in hackathons:
                    item = parse_hackathon(h)
                    if item:
                        results.append(item)
                # メタ情報でページ数チェック
                meta = data.get("meta", {})
                total_pages = meta.get("total_pages", 1)
                if page >= total_pages:
                    break
                page += 1
        except Exception as e:
            print(f"[devpost] fetch error (query={query}): {e}")

    # source_idで重複排除
    unique = {item["source_id"]: item for item in results}
    return list(unique.values())


def parse_hackathon(h: dict) -> dict | None:
    title = h.get("title", "")
    location = (h.get("displayed_location") or {}).get("location", "") or ""
    url = h.get("url", "")
    event_id = h.get("id")

    if not event_id or not title:
        return None

    # 日本関連フィルタ
    combined = (title + " " + location).lower()
    if not any(k in combined for k in JAPAN_KEYWORDS):
        return None

    start_date, end_date = parse_dates(h.get("submission_period_dates", ""))
    if not start_date:
        return None

    today = datetime.utcnow().strftime("%Y-%m-%d")
    status = "UPCOMING" if start_date >= today else "PAST"

    prize_amount = parse_prize_usd(h.get("prize_amount", ""))
    prize_bucket = classify_prize(prize_amount)

    is_online = not location or "online" in location.lower()
    online_status = "ONLINE" if is_online else "OFFLINE"

    return {
        "source_id": f"devpost#{event_id}",
        "title": title,
        "source_url": url,
        "source_name": "devpost",
        "start_date": start_date,
        "end_date": end_date or "",
        "description": (h.get("tagline") or "")[:300],
        "location": location or None,
        "is_online": is_online,
        "online_status": online_status,
        "prize_amount": prize_amount,
        "prize_bucket": prize_bucket,
        "themes": [],
        "is_beginner_friendly": False,
        "status": status,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }


def parse_dates(date_str: str) -> tuple:
    """'May 01 - Jun 30, 2025' や 'May 01 - 31, 2025' をパース"""
    if not date_str:
        return None, None
    m = re.match(
        r"(\w+)\s+(\d+)\s*[-–]\s*(?:(\w+)\s+)?(\d+),?\s*(\d{4})",
        date_str.strip(),
    )
    if not m:
        return None, None
    start_month_str, start_day, end_month_str, end_day, year = m.groups()
    start_month = MONTHS.get(start_month_str[:3].lower())
    if not start_month:
        return None, None
    end_month = MONTHS.get(end_month_str[:3].lower()) if end_month_str else start_month
    try:
        start = datetime(int(year), start_month, int(start_day)).strftime("%Y-%m-%d")
        end = datetime(int(year), end_month, int(end_day)).strftime("%Y-%m-%d")
        return start, end
    except ValueError:
        return None, None


def parse_prize_usd(prize_str: str) -> int:
    """'$50,000 in prizes' → 円換算（1USD≈150JPY）"""
    if not prize_str:
        return 0
    m = re.search(r"\$([0-9,]+)", prize_str)
    if not m:
        return 0
    try:
        usd = int(m.group(1).replace(",", ""))
        return usd * 150  # 概算JPY
    except ValueError:
        return 0


def classify_prize(prize_jpy: int) -> str:
    if prize_jpy <= 0:
        return "NO_PRIZE"
    if prize_jpy <= 100_000:
        return "SMALL"
    return "LARGE"


def enqueue(item: dict):
    if QUEUE_URL:
        sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps(item, ensure_ascii=False),
        )
    else:
        print(f"[devpost] no queue configured, skipping: {item['source_id']}")
