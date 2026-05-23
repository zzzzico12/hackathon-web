"""
Tavily API でWeb検索してconnpass/Doorkeeper未掲載ハッカソンのURLを発見する Lambda。
週1回実行。発見したURLはスクレイパーキューに投入する。
"""
import json
import os
import boto3
import requests
from datetime import datetime

TAVILY_API_KEY_SSM_NAME = os.environ["TAVILY_API_KEY_SSM_NAME"]
SCRAPER_QUEUE_URL = os.environ["SCRAPER_QUEUE_URL"]

sqs = boto3.client("sqs")
ssm = boto3.client("ssm")

# コールドスタート時にSSMから取得（SecureStringはWithDecryption=True必須）
_tavily_api_key: str | None = None

def get_tavily_api_key() -> str:
    global _tavily_api_key
    if _tavily_api_key is None:
        resp = ssm.get_parameter(Name=TAVILY_API_KEY_SSM_NAME, WithDecryption=True)
        _tavily_api_key = resp["Parameter"]["Value"]
    return _tavily_api_key

TAVILY_API = "https://api.tavily.com/search"

def _queries() -> list[str]:
    year = datetime.utcnow().year
    return [
        f"ハッカソン 参加募集 {year}",
        f"hackathon japan {year}",
        f"ハッカソン 賞金 {year}",
    ]

# connpass/Doorkeeper/Devpostは別途APIで取得するのでスキップ
SKIP_DOMAINS = {"connpass.com", "doorkeeper.jp", "devpost.com"}


def handler(event, context):
    discovered_urls = set()

    for query in _queries():
        urls = search(query)
        discovered_urls.update(urls)
        print(f"[tavily] query='{query}' found={len(urls)} URLs")

    print(f"[tavily] total unique URLs: {len(discovered_urls)}")

    for url in discovered_urls:
        enqueue_for_scraping(url)

    return {"statusCode": 200, "discovered": len(discovered_urls)}


def search(query: str) -> list[str]:
    try:
        resp = requests.post(
            TAVILY_API,
            json={
                "api_key": get_tavily_api_key(),
                "query": query,
                "search_depth": "advanced",
                "include_raw_content": True,
                "max_results": 10,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])

        urls = []
        for r in results:
            url = r.get("url", "")
            domain = url.split("/")[2] if url.startswith("http") else ""
            if domain and not any(skip in domain for skip in SKIP_DOMAINS):
                urls.append(url)

                # Tavilyが本文を返してくれる場合はそのままキューに入れる
                raw_content = r.get("raw_content") or r.get("content", "")
                if raw_content and len(raw_content) > 200:
                    enqueue_with_content(url, raw_content, r.get("title", ""))

        return urls

    except Exception as e:
        print(f"[tavily] search failed for '{query}': {e}")
        return []


def enqueue_for_scraping(url: str):
    sqs.send_message(
        QueueUrl=SCRAPER_QUEUE_URL,
        MessageBody=json.dumps({
            "url": url,
            "content": None,
            "discovered_at": datetime.utcnow().isoformat(),
        }, ensure_ascii=False),
        MessageDeduplicationId=_url_hash(url),
        MessageGroupId="tavily",
    )


def enqueue_with_content(url: str, content: str, title: str):
    """本文がある場合はスクレイピング不要でBedrockへ直接渡す"""
    sqs.send_message(
        QueueUrl=SCRAPER_QUEUE_URL,
        MessageBody=json.dumps({
            "url": url,
            "content": content[:8000],   # Bedrockのトークン制限に配慮
            "title": title,
            "discovered_at": datetime.utcnow().isoformat(),
        }, ensure_ascii=False),
        MessageDeduplicationId=_url_hash(url),
        MessageGroupId="tavily",
    )


def _url_hash(url: str) -> str:
    import hashlib
    return hashlib.md5(url.encode()).hexdigest()
