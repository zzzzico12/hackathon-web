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
    q            = (qs.get("q") or "").strip()            # キーワード検索
    sort         = qs.get("sort", "date_asc")             # date_asc / prize_desc
    limit        = min(int(qs.get("limit", "20")), 100)
    next_token   = qs.get("next_token")

    exclusive_start = decode_token(next_token) if next_token else None

    # 賞金降順ソートはスキャン+メモリソートで処理（小規模データ向け）
    if sort == "prize_desc":
        return list_by_prize_desc(status, online, prize, beginner, theme, q, limit)

    filter_expr = _build_filter(beginner, theme, q)

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


def list_by_prize_desc(status, online, prize, beginner, theme, q, limit):
    """賞金降順: 全件取得 → メモリソート → 上位limit件返却（ページング非対応）"""
    filter_parts = []

    if status and status != "ALL":
        filter_parts.append(Attr("status").eq(status))
    if online == "true":
        filter_parts.append(Attr("online_status").eq("ONLINE"))
    elif online == "false":
        filter_parts.append(Attr("online_status").eq("OFFLINE"))
    if prize:
        filter_parts.append(Attr("prize_bucket").eq(prize))

    extra = _build_filter(beginner, theme, q)
    if extra:
        filter_parts.append(extra)

    filter_expr = None
    for part in filter_parts:
        filter_expr = filter_expr & part if filter_expr else part

    kwargs = {}
    if filter_expr:
        kwargs["FilterExpression"] = filter_expr

    # ページネーションしながら全件取得
    all_items = []
    last_key = None
    while True:
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        result = table.scan(**kwargs)
        all_items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key or len(all_items) > 500:  # 上限500件
            break

    # 賞金降順 → 開始日昇順でソート
    all_items.sort(key=lambda x: (-int(x.get("prize_amount") or 0), x.get("start_date", "")))
    items = all_items[:limit]

    return resp(200, {
        "items": items,
        "count": len(items),
        "next_token": None,
    })


def _build_filter(beginner, theme, q):
    filter_expr = None
    if beginner == "true":
        filter_expr = Attr("is_beginner_friendly").eq(True)
    if theme:
        cond = Attr("themes").contains(theme)
        filter_expr = filter_expr & cond if filter_expr else cond
    if q:
        cond = Attr("title").contains(q) | Attr("description").contains(q)
        filter_expr = filter_expr & cond if filter_expr else cond
    return filter_expr


def query_index(index: str, key_cond, filter_expr, limit: int, exclusive_start):
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


def encode_token(key) -> str | None:
    if not key:
        return None
    import base64
    return base64.urlsafe_b64encode(
        json.dumps(key, default=str).encode()
    ).decode()


def decode_token(token: str):
    try:
        import base64
        return json.loads(base64.urlsafe_b64decode(token).decode())
    except Exception:
        return None
