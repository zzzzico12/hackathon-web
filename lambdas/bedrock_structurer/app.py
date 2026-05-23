"""
SQSキューからページ本文を受け取り、Bedrock (Claude Haiku) で構造化してDynamoDBに書き込む Lambda。
"""
import json
import os
import re
import boto3
from datetime import datetime

TABLE_NAME = os.environ["DYNAMODB_TABLE"]
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "ap-northeast-1")
MODEL_ID = "jp.anthropic.claude-sonnet-4-5-20250929-v1:0"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)

SYSTEM_PROMPT = """あなたはハッカソン情報を抽出するAIです。
与えられたWebページのテキストから、ハッカソンイベントの情報を抽出してください。
ハッカソンの情報が見つからない場合は {"is_hackathon": false} のみ返してください。"""

EXTRACT_PROMPT = """以下のWebページ本文からハッカソン情報をJSON形式で抽出してください。

必ず以下のJSON形式で回答してください（コードブロック不要）:
{{
  "is_hackathon": true,
  "title": "イベント名",
  "start_date": "YYYY-MM-DD または null",
  "end_date": "YYYY-MM-DD または null",
  "entry_deadline": "YYYY-MM-DD または null",
  "is_online": true または false,
  "location": "開催地（オンラインの場合はnull）",
  "prize_amount": 賞金総額（円、数値のみ、不明な場合は0）,
  "themes": ["テーマ1", "テーマ2"],
  "is_beginner_friendly": true または false,
  "description": "200字以内の日本語要約"
}}

URL: {url}
ページタイトル: {title}

---ページ本文---
{content}
"""


def handler(event, context):
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            process(body)
        except Exception as e:
            print(f"[bedrock_structurer] error: {e}")
            raise


def process(body: dict):
    url = body["url"]
    content = body.get("content", "")
    title = body.get("title", "")

    if not content:
        return

    extracted = extract_with_bedrock(url, title, content)
    if not extracted or not extracted.get("is_hackathon"):
        print(f"[bedrock_structurer] not a hackathon: {url}")
        return

    item = build_item(extracted, url)
    write_to_dynamo(item)
    print(f"[bedrock_structurer] saved: {item['source_id']} - {item['title']}")


def extract_with_bedrock(url: str, title: str, content: str) -> dict | None:
    prompt = EXTRACT_PROMPT.format(url=url, title=title, content=content)
    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            }),
        )
        result = json.loads(resp["body"].read())
        text = result["content"][0]["text"].strip()
        if not text:
            return None
        # コードブロックを除去して最初のJSONオブジェクトを抽出
        text = text.strip("```json").strip("```").strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            return None
        return json.loads(text[start:end])
    except Exception as e:
        print(f"[bedrock_structurer] bedrock error for {url}: {e}")
        return None


def build_item(extracted: dict, url: str) -> dict:
    import hashlib
    source_id = f"web#{hashlib.md5(url.encode()).hexdigest()[:12]}"

    prize = extracted.get("prize_amount") or 0
    if prize <= 0:
        prize_bucket = "NO_PRIZE"
    elif prize <= 100_000:
        prize_bucket = "SMALL"
    else:
        prize_bucket = "LARGE"

    is_online = extracted.get("is_online", False)
    online_status = "ONLINE" if is_online else "OFFLINE"

    start_date = extracted.get("start_date") or ""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    status = "UPCOMING" if start_date >= today else "PAST"

    now = datetime.utcnow().isoformat()
    return {
        "source_id": source_id,
        "title": extracted.get("title", ""),
        "source_url": url,
        "source_name": "web",
        "start_date": start_date,
        "end_date": extracted.get("end_date") or "",
        "entry_deadline": extracted.get("entry_deadline"),
        "description": extracted.get("description", ""),
        "location": extracted.get("location"),
        "is_online": is_online,
        "online_status": online_status,
        "prize_amount": prize,
        "prize_bucket": prize_bucket,
        "themes": extracted.get("themes") or [],
        "is_beginner_friendly": extracted.get("is_beginner_friendly", False),
        "status": status,
        "created_at": now,
        "updated_at": now,
    }


def write_to_dynamo(item: dict):
    if not item.get("start_date"):
        print(f"[bedrock_structurer] skipping item with no start_date: {item.get('title')}")
        return
    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(source_id)",
        )
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        table.update_item(
            Key={"source_id": item["source_id"], "start_date": item["start_date"]},
            UpdateExpression="SET updated_at = :ua, title = :t",
            ExpressionAttributeValues={
                ":ua": item["updated_at"],
                ":t": item["title"],
            },
        )
