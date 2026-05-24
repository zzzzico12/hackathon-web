import json
import os
from datetime import datetime, timezone
from urllib.parse import unquote

import boto3
from boto3.dynamodb.conditions import Attr, Key

TABLE_NAME = os.environ["BOARD_TABLE"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

CORS = {
    "Access-Control-Allow-Origin": "https://hackathon.zzzzico.click",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

VALID_TYPES = {"REPORT", "TEAM"}


def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, ensure_ascii=False)}


def get_user_id(event):
    return event["requestContext"]["authorizer"]["claims"]["sub"]


def handler(event, _ctx):
    method = event["httpMethod"]
    path = event["path"]

    if method == "OPTIONS":
        return resp(200, {})

    # GET /board
    if path == "/board":
        if method == "GET":
            return get_global(event)

    # /hackathons/{id}/board  or  /hackathons/{id}/board/{sk}
    if path.startswith("/hackathons/") and "/board" in path:
        after_prefix = path[len("/hackathons/"):]
        if after_prefix.endswith("/board"):
            hackathon_id = unquote(after_prefix[: -len("/board")])
            if method == "GET":
                return get_by_hackathon(event, hackathon_id)
            if method == "POST":
                return post_item(event, hackathon_id)
        elif "/board/" in after_prefix:
            parts = after_prefix.split("/board/", 1)
            hackathon_id = unquote(parts[0])
            sk = unquote(parts[1])
            if method == "DELETE":
                return delete_item(event, hackathon_id, sk)

    return resp(404, {"error": "not found"})


def get_global(event):
    qs = event.get("queryStringParameters") or {}
    tab = qs.get("tab", "reports")
    board_type = "REPORT" if tab == "reports" else "TEAM"
    q = qs.get("q", "").strip().lower()
    limit = min(int(qs.get("limit", 20)), 50)
    last_key_raw = qs.get("last_key")

    kwargs = {
        "IndexName": "type-date-index",
        "KeyConditionExpression": Key("board_type").eq(board_type),
        "ScanIndexForward": False,
        "Limit": limit,
    }
    if q:
        kwargs["FilterExpression"] = (
            Attr("body").contains(q) | Attr("hackathon_title").contains(q)
        )
    if last_key_raw:
        try:
            kwargs["ExclusiveStartKey"] = json.loads(unquote(last_key_raw))
        except Exception:
            pass

    result = table.query(**kwargs)
    last_key = result.get("LastEvaluatedKey")
    return resp(200, {
        "items": result.get("Items", []),
        "last_key": json.dumps(last_key, default=str) if last_key else None,
    })


def get_by_hackathon(event, hackathon_id):
    qs = event.get("queryStringParameters") or {}
    tab = qs.get("tab", "team")
    board_type = "REPORT" if tab == "reports" else "TEAM"

    result = table.query(
        KeyConditionExpression=(
            Key("hackathon_source_id").eq(hackathon_id)
            & Key("SK").begins_with(f"{board_type}#")
        ),
        ScanIndexForward=True,  # ascending: top-level posts before replies
    )
    return resp(200, {"items": result.get("Items", [])})


def post_item(event, hackathon_id):
    user_id = get_user_id(event)
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "invalid JSON"})

    board_type = body.get("type", "").upper()
    if board_type not in VALID_TYPES:
        return resp(400, {"error": "type must be REPORT or TEAM"})

    content = body.get("body", "").strip()
    if not content:
        return resp(400, {"error": "body is required"})

    parent_sk = body.get("parent_sk", "").strip()
    now = datetime.now(timezone.utc).isoformat()

    if parent_sk:
        # Reply: SK starts with board_type prefix so begins_with query includes it
        sk = f"{board_type}#REPLY#{now}#{user_id}"
        item_board_type = "REPLY"
    else:
        sk = f"{board_type}#{now}#{user_id}"
        item_board_type = board_type

    item = {
        "hackathon_source_id": hackathon_id,
        "SK": sk,
        "board_type": item_board_type,
        "user_id": user_id,
        "display_name": body.get("display_name", ""),
        "hackathon_title": body.get("hackathon_title", ""),
        "body": content,
        "created_at": now,
    }
    if parent_sk:
        item["parent_sk"] = parent_sk
    if board_type == "REPORT" and not parent_sk and body.get("rating") is not None:
        item["rating"] = max(1, min(5, int(body["rating"])))
    if board_type == "TEAM" and not parent_sk:
        item["skills"] = body.get("skills", [])
        item["wants"] = body.get("wants", [])
        item["contact"] = body.get("contact", "")

    table.put_item(Item=item)
    return resp(201, {"SK": sk})


def delete_item(event, hackathon_id, sk):
    user_id = get_user_id(event)
    if not sk.endswith(f"#{user_id}"):
        return resp(403, {"error": "forbidden"})

    result = table.get_item(Key={"hackathon_source_id": hackathon_id, "SK": sk})
    if "Item" not in result:
        return resp(404, {"error": "not found"})

    table.delete_item(Key={"hackathon_source_id": hackathon_id, "SK": sk})
    return resp(200, {"deleted": sk})
