"""
SQSキューからURLを受け取りHTMLを取得してBedrockキューに投入する Lambda。
Tavilyがすでに本文を返している場合はHTTPリクエストをスキップする。

取得前に robots.txt を確認し、禁止されているURLは取得しない。
Crawl-delay が指定されていれば、その秒数だけ待ってから取得する。
（ScraperQueue は FIFO で取得元ごとに直列処理されるため、取得前に待てば間隔が守られる）
"""
import json
import os
import time
from urllib import robotparser
from urllib.parse import urlparse

import boto3
import requests
from bs4 import BeautifulSoup

BEDROCK_QUEUE_URL = os.environ["BEDROCK_QUEUE_URL"]

sqs = boto3.client("sqs")

BOT_NAME = "HackathonJPBot"
HEADERS = {"User-Agent": f"{BOT_NAME}/1.0 (personal use)"}

# 利用規約で自動取得が禁止されている、または取得を停止した取得元
BLOCKED_DOMAINS = {"devpost.com", "craftstadium.com"}

_robots_cache: dict[str, robotparser.RobotFileParser | None] = {}


def get_robots(url: str) -> robotparser.RobotFileParser | None:
    """robots.txt を取得してキャッシュする。取得できない場合は None（取得しない扱い）。"""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin in _robots_cache:
        return _robots_cache[origin]

    rp = robotparser.RobotFileParser()
    try:
        resp = requests.get(f"{origin}/robots.txt", headers=HEADERS, timeout=10)
        if resp.status_code in (401, 403):
            rp.disallow_all = True
        elif 400 <= resp.status_code < 500:
            rp.allow_all = True  # robots.txt が無い = 制限なし
        elif resp.ok:
            rp.parse(resp.text.splitlines())
        else:
            rp = None  # サーバーエラーは安全側に倒して取得しない
    except Exception as e:
        print(f"[scraper] robots.txt fetch error {origin}: {e}")
        rp = None

    _robots_cache[origin] = rp
    return rp


def is_blocked(url: str) -> bool:
    domain = urlparse(url).netloc.lower()
    return any(domain == d or domain.endswith("." + d) for d in BLOCKED_DOMAINS)


def handler(event, context):
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            process(body)
        except Exception as e:
            print(f"[scraper] error processing record: {e}")
            raise


def process(body: dict):
    url = body["url"]
    content = body.get("content")

    if is_blocked(url):
        print(f"[scraper] blocked domain, skipping: {url}")
        return

    if not content:
        content = fetch_text(url)
        if not content:
            print(f"[scraper] failed to fetch {url}")
            return

    sqs.send_message(
        QueueUrl=BEDROCK_QUEUE_URL,
        MessageBody=json.dumps({
            "url": url,
            "title": body.get("title", ""),
            "content": content[:8000],
            "discovered_at": body.get("discovered_at", ""),
        }, ensure_ascii=False),
    )


def fetch_text(url: str) -> str | None:
    rp = get_robots(url)
    if rp is None or not rp.can_fetch(BOT_NAME, url):
        print(f"[scraper] disallowed by robots.txt, skipping: {url}")
        return None

    delay = rp.crawl_delay(BOT_NAME)
    if delay:
        time.sleep(float(delay))

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)[:8000]
    except Exception as e:
        print(f"[scraper] fetch error {url}: {e}")
        return None
