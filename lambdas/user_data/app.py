import json
import os
from datetime import datetime, timezone
from urllib.parse import unquote

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ["USER_DATA_TABLE"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

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

    sk = f"{action_type}#{source_id}"
    item = {
        "user_id": user_id,
        "SK": sk,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if action_type == "NOTE":
        item["body"] = body.get("body", "")
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
