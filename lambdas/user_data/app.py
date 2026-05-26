import json
import os
from datetime import datetime, timezone
from urllib.parse import unquote

import boto3
import botocore.config
from boto3.dynamodb.conditions import Attr, Key

TABLE_NAME = os.environ["USER_DATA_TABLE"]
HACKATHONS_TABLE_NAME = os.environ.get("HACKATHONS_TABLE", "")
AVATAR_BUCKET = os.environ.get("AVATAR_BUCKET", "")
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
hackathon_table = dynamodb.Table(HACKATHONS_TABLE_NAME) if HACKATHONS_TABLE_NAME else None
# endpoint_url forces presigned URLs to use the regional endpoint.
# Without it, boto3 generates s3.amazonaws.com (global) which returns
# no CORS headers for buckets outside us-east-1.
s3 = boto3.client(
    "s3",
    region_name=REGION,
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=botocore.config.Config(signature_version="s3v4"),
)

VALID_TYPES = {"FAV", "DONE", "APPLIED", "NOTE"}
CORS = {
    "Access-Control-Allow-Origin": "https://hackathon.zzzzico.click",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}


def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def get_user_id(event):
    return event["requestContext"]["authorizer"]["claims"]["sub"]


def handler(event, _ctx):
    method = event["httpMethod"]
    path = event["path"]

    if method == "OPTIONS":
        return resp(200, {})

    if path == "/user/me":
        return get_me(event)
    if path == "/user/recommendations":
        if method == "GET":
            return get_recommendations(event)
    if path == "/user/avatar/presign":
        if method == "POST":
            return presign_avatar(event)
    if path == "/user/data":
        if method == "GET":
            return get_all(event)
        if method == "POST":
            return post_action(event)
    if path.startswith("/user/data/"):
        if method == "DELETE":
            return delete_action(event)

    return resp(404, {"error": "not found"})


def get_all(event):
    user_id = get_user_id(event)
    qs = event.get("queryStringParameters") or {}
    type_filter = qs.get("type")

    kwargs = {"KeyConditionExpression": Key("user_id").eq(user_id)}
    if type_filter and type_filter in VALID_TYPES:
        kwargs["KeyConditionExpression"] &= Key("SK").begins_with(f"{type_filter}#")

    items = []
    result = table.query(**kwargs)
    items.extend(result.get("Items", []))
    while "LastEvaluatedKey" in result:
        result = table.query(**kwargs, ExclusiveStartKey=result["LastEvaluatedKey"])
        items.extend(result.get("Items", []))

    return resp(200, {"items": items})


def post_action(event):
    user_id = get_user_id(event)
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "invalid JSON"})

    action_type = body.get("type", "").upper()
    source_id = body.get("source_id", "").strip()
    if action_type not in VALID_TYPES or not source_id:
        return resp(400, {"error": "type and source_id are required"})
    if len(source_id) > 300:
        return resp(400, {"error": "source_id too long"})

    sk = f"{action_type}#{source_id}"
    item = {
        "user_id": user_id,
        "SK": sk,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if action_type == "NOTE":
        note_body = body.get("body", "")
        if len(note_body) > 2000:
            return resp(400, {"error": "note too long (max 2000 chars)"})
        item["body"] = note_body
    elif action_type == "DONE" or action_type == "APPLIED":
        pass  # no extra fields

    table.put_item(Item=item)
    return resp(200, {"SK": sk})


def delete_action(event):
    user_id = get_user_id(event)
    raw_sk = event["pathParameters"].get("sk", "")
    sk = unquote(raw_sk)

    # Verify ownership: SK must belong to this user
    result = table.get_item(Key={"user_id": user_id, "SK": sk})
    if "Item" not in result:
        return resp(404, {"error": "not found"})

    table.delete_item(Key={"user_id": user_id, "SK": sk})
    return resp(200, {"deleted": sk})


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

def presign_avatar(event):
    user_id = get_user_id(event)
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        body = {}
    content_type = body.get("content_type", "image/jpeg").strip()
    if content_type not in ALLOWED_IMAGE_TYPES:
        return resp(400, {"error": "unsupported image type"})

    key = f"avatars/{user_id}/avatar.jpg"
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": AVATAR_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    avatar_url = f"https://{AVATAR_BUCKET}.s3.{REGION}.amazonaws.com/{key}"
    return resp(200, {"upload_url": upload_url, "avatar_url": avatar_url})


def get_me(event):
    user_id = get_user_id(event)
    result = table.query(KeyConditionExpression=Key("user_id").eq(user_id))
    items = result.get("Items", [])

    counts = {"FAV": 0, "DONE": 0, "APPLIED": 0, "NOTE": 0}
    for item in items:
        sk = item.get("SK", "")
        for t in counts:
            if sk.startswith(f"{t}#"):
                counts[t] += 1
    return resp(200, counts)


def get_recommendations(event):
    """FAV/DONE済みハッカソンのテーマからおすすめUPCOMINGイベントを返す。"""
    if not hackathon_table:
        return resp(200, {"items": [], "themes": []})

    user_id = get_user_id(event)

    # 1. ユーザーの全アクションを取得
    result = table.query(KeyConditionExpression=Key("user_id").eq(user_id))
    user_items = result.get("Items", [])

    liked_ids = []   # テーマ抽出対象（FAV/DONE）
    excluded_ids = set()  # おすすめから除外（FAV/DONE/APPLIED）
    for item in user_items:
        sk = item.get("SK", "")
        if sk.startswith("FAV#"):
            sid = sk[4:]
            liked_ids.append(sid)
            excluded_ids.add(sid)
        elif sk.startswith("DONE#"):
            sid = sk[5:]
            liked_ids.append(sid)
            excluded_ids.add(sid)
        elif sk.startswith("APPLIED#"):
            excluded_ids.add(sk[8:])

    if not liked_ids:
        return resp(200, {"items": [], "themes": []})

    # 2. liked ハッカソンのテーマを集計（最大10件を参照）
    theme_count: dict[str, int] = {}
    for sid in liked_ids[:10]:
        r = hackathon_table.query(
            KeyConditionExpression=Key("source_id").eq(sid),
            ProjectionExpression="themes",
        )
        for h in r.get("Items", []):
            for t in h.get("themes", []):
                theme_count[t] = theme_count.get(t, 0) + 1

    if not theme_count:
        return resp(200, {"items": [], "themes": []})

    top_themes = sorted(theme_count, key=lambda t: -theme_count[t])[:3]

    # 3. UPCOMING かつ top_themes に一致するハッカソンを取得
    filter_expr = None
    for t in top_themes:
        cond = Attr("themes").contains(t)
        filter_expr = cond if filter_expr is None else (filter_expr | cond)

    r = hackathon_table.query(
        IndexName="status-start_date-index",
        KeyConditionExpression=Key("status").eq("UPCOMING"),
        FilterExpression=filter_expr,
        ScanIndexForward=True,
        Limit=60,
    )

    # 4. 除外リストを引いてtop 5を返す
    candidates = [h for h in r.get("Items", []) if h.get("source_id") not in excluded_ids]
    return resp(200, {"items": candidates[:5], "themes": top_themes})
