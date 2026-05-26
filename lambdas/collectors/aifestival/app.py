"""
aifestival.jp/hackathon からハッカソンのラウンドページURLを収集してスクレイパーキューに投入する Lambda。
"""
import hashlib
import json
import os
import re
from datetime import datetime
from html.parser import HTMLParser

import boto3
import requests

SCRAPER_QUEUE_URL = os.environ["SCRAPER_QUEUE_URL"]

sqs = boto3.client("sqs")

BASE_URL = "https://www.aifestival.jp"
LIST_URL = f"{BASE_URL}/hackathon"

# /hackathon/<slug> 形式のみ（/hackathon 自体はリストページなのでスキップ）
_EVENT_PATH_RE = re.compile(r"^/hackathon/[^/?#]+$")

# Wix SPA のため静的HTMLにはリンクが少ない。既知ラウンドURLを補完
_YEAR = datetime.utcnow().year
SEED_URLS = [f"{BASE_URL}/hackathon/entry-{_YEAR}-{i}" for i in range(1, 7)]


class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for name, val in attrs:
            if name == "href" and val:
                self.links.append(val)


def extract_event_urls(html: str) -> list[str]:
    parser = _LinkParser()
    parser.feed(html)

    seen: set[str] = set()
    urls: list[str] = []
    for href in parser.links:
        if href.startswith("http"):
            if not href.startswith(BASE_URL):
                continue
            path = href[len(BASE_URL):]
        else:
            path = href.split("?")[0].split("#")[0]

        if _EVENT_PATH_RE.match(path):
            full_url = f"{BASE_URL}{path}"
            if full_url not in seen:
                seen.add(full_url)
                urls.append(full_url)

    return urls


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
        MessageGroupId="aifestival",
    )


def handler(event, context):
    try:
        resp = requests.get(LIST_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        dynamic_urls = extract_event_urls(resp.text)
    except Exception as e:
        print(f"[aifestival] fetch failed: {e}")
        dynamic_urls = []

    # 静的HTMLで見つかったURLと既知のシードURLをマージ
    all_urls = list(dict.fromkeys(SEED_URLS + dynamic_urls))
    print(f"[aifestival] enqueuing {len(all_urls)} URLs (seed={len(SEED_URLS)}, dynamic={len(dynamic_urls)})")

    for url in all_urls:
        enqueue(url)
        print(f"[aifestival] enqueued: {url}")

    return {"statusCode": 200, "enqueued": len(all_urls)}
