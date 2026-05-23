"""
SQSキューからURLを受け取りHTMLを取得してBedrockキューに投入する Lambda。
Tavilyがすでに本文を返している場合はHTTPリクエストをスキップする。
"""
import json
import os
import boto3
import requests
from bs4 import BeautifulSoup

BEDROCK_QUEUE_URL = os.environ["BEDROCK_QUEUE_URL"]

sqs = boto3.client("sqs")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; HackathonBot/1.0; "
        "+https://hackathon-finder.example.com/bot)"
    )
}


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
