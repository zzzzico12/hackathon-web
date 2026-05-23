"""
API Gateway Lambda ハンドラー。
GET /hackathons        - 一覧（フィルタ・ページング対応）
GET /hackathons/{id}   - 詳細
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr

TABLE_NAME = os.environ["DYNAMODB_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/hackathons")

    if method == "OPTIONS":
        return resp(200, {})

    path_params = event.get("pathParameters") or {}
    source_id = path_params.get("source_id")

    if source_id:
        return get_hackathon(source_id)
    else:
        qs = event.get("queryStringParameters") or {}
        return list_hackathons(qs)


# ─── 一覧 ─────────────────────────────────────────────────────────

def list_hackathons(qs: dict) -> dict:
    status       = qs.get("status", "UPCOMING")          # UPCOMING / PAST / ALL
    online       = qs.get("online")                       # true / false
    prize        = qs.get("prize")                        # NO_PRIZE / SMALL / LARGE
    beginner     = qs.get("beginner")                     # true / false
    theme        = qs.get("theme")                        # テーマ文字列
    limit        = min(int(qs.get("limit", "20")), 100)
    next_token   = qs.get("next_token")

    exclusive_start = decode_token(next_token) if next_token else None

    filter_expr = None
    if beginner == "true":
        filter_expr = Attr("is_beginner_friendly").eq(True)
    if theme:
        cond = Attr("themes").contains(theme)
        filter_expr = filter_expr & cond if filter_expr else cond

    items = []
    last_key = None

    if online in ("true", "false"):
        online_status = "ONLINE" if online == "true" else "OFFLINE"
        items, last_key = query_index(
            "online_status-start_date-index",
            Key("online_status").eq(online_status),
            filter_expr, limit, exclusive_start,
        )
    elif prize in ("NO_PRIZE", "SMALL", "LARGE"):
        items, last_key = query_index(
            "prize_bucket-start_date-index",
            Key("prize_bucket").eq(prize),
            filter_expr, limit, exclusive_start,
        )
    elif status == "ALL":
        # Scan（全件）- データ量が少ないうちのみ許容
        kwargs = {"Limit": limit}
        if filter_expr:
            kwargs["FilterExpression"] = filter_expr
        if exclusive_start:
            kwargs["ExclusiveStartKey"] = exclusive_start
        result = table.scan(**kwargs)
        items = result.get("Items", [])
        last_key = result.get("LastEvaluatedKey")
    else:
        items, last_key = query_index(
            "status-start_date-index",
            Key("status").eq(status),
            filter_expr, limit, exclusive_start,
        )

    return resp(200, {
        "items": items,
        "count": len(items),
        "next_token": encode_token(last_key) if last_key else None,
    })


def query_index(index: str, key_cond, filter_expr, limit: int, exclusive_start: dict | None):
    kwargs = {
        "IndexName": index,
        "KeyConditionExpression": key_cond,
        "Limit": limit,
        "ScanIndexForward": True,
    }
    if filter_expr:
        kwargs["FilterExpression"] = filter_expr
    if exclusive_start:
        kwargs["ExclusiveStartKey"] = exclusive_start

    result = table.query(**kwargs)
    return result.get("Items", []), result.get("LastEvaluatedKey")


# ─── 詳細 ─────────────────────────────────────────────────────────

def get_hackathon(source_id: str) -> dict:
    from urllib.parse import unquote
    source_id = unquote(source_id)

    # source_idはHASHキーなのでQueryで取得できる（SKは不要）
    result = table.query(
        KeyConditionExpression=Key("source_id").eq(source_id),
        Limit=1,
    )
    items = result.get("Items", [])

    if not items:
        return resp(404, {"error": "not found"})

    return resp(200, items[0])


# ─── ユーティリティ ────────────────────────────────────────────────

def resp(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def encode_token(key: dict | None) -> str | None:
    if not key:
        return None
    import base64
    return base64.urlsafe_b64encode(
        json.dumps(key, default=str).encode()
    ).decode()


def decode_token(token: str) -> dict | None:
    try:
        import base64
        return json.loads(base64.urlsafe_b64decode(token).decode())
    except Exception:
        return None
