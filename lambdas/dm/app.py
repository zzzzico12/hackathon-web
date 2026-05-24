import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["DM_TABLE"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS = {
    "Access-Control-Allow-Origin": "https://hackathon.zzzzico.click",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def _decimal(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, default=_decimal)}


def get_user_id(event):
    return event["requestContext"]["authorizer"]["claims"]["sub"]


def handler(event, _ctx):
    method = event["httpMethod"]
    path = event["path"]

    if method == "OPTIONS":
        return resp(200, {})

    if path == "/dm/inbox" and method == "GET":
        return get_inbox(event)
    if path == "/dm/messages" and method == "GET":
        return get_messages(event)
    if path == "/dm/send" and method == "POST":
        return send_message(event)
    if path == "/dm/read" and method == "POST":
        return mark_read(event)

    return resp(404, {"error": "not found"})


def get_inbox(event):
    """CONV# アイテム一覧（会話リスト）を返す。updated_at 降順。"""
    user_id = get_user_id(event)
    result = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id) & Key("SK").begins_with("CONV#")
    )
    convs = result.get("Items", [])
    convs.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return resp(200, {"conversations": convs})


def get_messages(event):
    """指定ユーザーとのメッセージ一覧を返し、未読を0にリセット。"""
    user_id = get_user_id(event)
    qs = event.get("queryStringParameters") or {}
    other_user_id = qs.get("with", "").strip()
    if not other_user_id:
        return resp(400, {"error": "with parameter required"})

    result = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id) & Key("SK").begins_with(f"MSG#{other_user_id}#"),
        ScanIndexForward=True,
    )
    messages = result.get("Items", [])

    # 既読リセット
    try:
        table.update_item(
            Key={"user_id": user_id, "SK": f"CONV#{other_user_id}"},
            UpdateExpression="SET unread_count = :zero",
            ConditionExpression="attribute_exists(SK)",
            ExpressionAttributeValues={":zero": 0},
        )
    except Exception:
        pass  # CONV アイテムがまだない場合はスキップ

    return resp(200, {"messages": messages})


def send_message(event):
    """メッセージ送信。送受信双方の MSG と CONV を更新。"""
    sender_id = get_user_id(event)
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "invalid JSON"})

    to_user_id = body.get("to_user_id", "").strip()
    to_display_name = body.get("to_display_name", "").strip()[:100] or "匿名"
    sender_display_name = body.get("sender_display_name", "").strip()[:100] or "匿名"
    message_body = body.get("body", "").strip()

    if not to_user_id or not message_body:
        return resp(400, {"error": "to_user_id and body are required"})
    if len(message_body) > 5000:
        return resp(400, {"error": "body too long (max 5000 chars)"})
    if sender_id == to_user_id:
        return resp(400, {"error": "cannot send DM to yourself"})

    now = datetime.now(timezone.utc).isoformat()
    msg_suffix = f"{now}#{uuid.uuid4().hex[:8]}"

    # 送信者の MSG
    table.put_item(Item={
        "user_id": sender_id,
        "SK": f"MSG#{to_user_id}#{msg_suffix}",
        "sender_id": sender_id,
        "sender_display_name": sender_display_name,
        "body": message_body,
        "created_at": now,
    })

    # 受信者の MSG
    table.put_item(Item={
        "user_id": to_user_id,
        "SK": f"MSG#{sender_id}#{msg_suffix}",
        "sender_id": sender_id,
        "sender_display_name": sender_display_name,
        "body": message_body,
        "created_at": now,
    })

    last_body = message_body[:50]

    # 送信者の CONV（unread=0）
    table.put_item(Item={
        "user_id": sender_id,
        "SK": f"CONV#{to_user_id}",
        "other_user_id": to_user_id,
        "other_display_name": to_display_name,
        "last_message_body": last_body,
        "last_sender_id": sender_id,
        "unread_count": 0,
        "updated_at": now,
    })

    # 受信者の CONV（unread_count を +1）
    table.update_item(
        Key={"user_id": to_user_id, "SK": f"CONV#{sender_id}"},
        UpdateExpression=(
            "SET other_user_id = :ou, other_display_name = :od, "
            "last_message_body = :lm, last_sender_id = :ls, updated_at = :ua "
            "ADD unread_count :inc"
        ),
        ExpressionAttributeValues={
            ":ou": sender_id,
            ":od": sender_display_name,
            ":lm": last_body,
            ":ls": sender_id,
            ":ua": now,
            ":inc": 1,
        },
    )

    return resp(201, {"created_at": now})


def mark_read(event):
    """指定ユーザーとの会話の未読数を0にリセット。"""
    user_id = get_user_id(event)
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "invalid JSON"})

    other_user_id = body.get("other_user_id", "").strip()
    if not other_user_id:
        return resp(400, {"error": "other_user_id required"})

    try:
        table.update_item(
            Key={"user_id": user_id, "SK": f"CONV#{other_user_id}"},
            UpdateExpression="SET unread_count = :zero",
            ConditionExpression="attribute_exists(SK)",
            ExpressionAttributeValues={":zero": 0},
        )
    except Exception:
        pass

    return resp(200, {"ok": True})
