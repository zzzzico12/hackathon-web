"""
craftstadium.com/hackathon からハッカソン一覧ページを取得し、
個別イベントURLをスクレイパーキューに投入する Lambda。
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

BASE_URL = "https://www.craftstadium.com"
LIST_URL = f"{BASE_URL}/hackathon"

# /hackathon/<slug> 形式のみ対象（タグページ /hackathon/tag/... は除外）
_EVENT_PATH_RE = re.compile(r"^/hackathon/(?!tag/|category/)([^/?#]+)$")


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
        # 絶対URL or パスを正規化
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
        MessageGroupId="craftstadium",
    )


def handler(event, context):
    try:
        resp = requests.get(LIST_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
    except Exception as e:
        print(f"[craftstadium] fetch failed: {e}")
        return {"statusCode": 500, "error": str(e)}

    urls = extract_event_urls(resp.text)
    print(f"[craftstadium] found {len(urls)} event URLs")

    for url in urls:
        enqueue(url)
        print(f"[craftstadium] enqueued: {url}")

    return {"statusCode": 200, "enqueued": len(urls)}
