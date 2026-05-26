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


MAX_PAGES = 10


def fetch_all_urls() -> list[str]:
    """一覧ページを ?page=N でたどり、全イベントURLを収集する。
    ページが存在しない場合や前ページと同一URLセットが返った場合は終了。"""
    all_seen: set[str] = set()
    all_urls: list[str] = []

    for page in range(1, MAX_PAGES + 1):
        page_url = LIST_URL if page == 1 else f"{LIST_URL}?page={page}"
        try:
            resp = requests.get(page_url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        except Exception as e:
            print(f"[craftstadium] fetch failed (page={page}): {e}")
            break

        page_urls = extract_event_urls(resp.text)
        new_urls = [u for u in page_urls if u not in all_seen]

        if not new_urls:
            # 新URLゼロ = ページが存在しないか1ページ目にリダイレクトされた
            break

        for u in new_urls:
            all_seen.add(u)
            all_urls.append(u)

        print(f"[craftstadium] page={page} new={len(new_urls)}")

        if len(page_urls) == 0:
            break

    return all_urls


def handler(event, context):
    urls = fetch_all_urls()
    print(f"[craftstadium] total {len(urls)} event URLs")

    for url in urls:
        enqueue(url)
        print(f"[craftstadium] enqueued: {url}")

    return {"statusCode": 200, "enqueued": len(urls)}
