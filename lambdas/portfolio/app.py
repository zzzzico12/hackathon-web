"""
GET /users/{user_id} — 公開ポートフォリオ
認証不要。DONE済みハッカソン一覧と書いたレポートを返す。
"""
import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

USER_DATA_TABLE = os.environ["USER_DATA_TABLE"]
HACKATHONS_TABLE = os.environ["HACKATHONS_TABLE"]
BOARD_TABLE = os.environ["BOARD_TABLE"]
AVATAR_BUCKET = os.environ["AVATAR_BUCKET"]
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")

dynamodb = boto3.resource("dynamodb")
user_table = dynamodb.Table(USER_DATA_TABLE)
hackathon_table = dynamodb.Table(HACKATHONS_TABLE)
board_table = dynamodb.Table(BOARD_TABLE)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def _decimal(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def resp(status, body):
    return {
        "statusCode": status,
        "headers": CORS,
        "body": json.dumps(body, ensure_ascii=False, default=_decimal),
    }


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return resp(200, {})

    user_id = (event.get("pathParameters") or {}).get("user_id", "").strip()
    if not user_id:
        return resp(400, {"error": "user_id required"})

    # 1. DONE 済みイベントの source_id を取得
    done_result = user_table.query(
        KeyConditionExpression=Key("user_id").eq(user_id)
        & Key("SK").begins_with("DONE#")
    )
    done_ids = [item["SK"][5:] for item in done_result.get("Items", [])]

    if not done_ids:
        return resp(200, {
            "display_name": None,
            "avatar_url": None,
            "hackathons": [],
            "themes": [],
            "report_count": 0,
        })

    # 2. ハッカソン詳細を取得（最大20件）
    hackathons: dict[str, dict] = {}
    for sid in done_ids[:20]:
        r = hackathon_table.query(
            KeyConditionExpression=Key("source_id").eq(sid)
        )
        for h in r.get("Items", []):
            hackathons[h["source_id"]] = h

    # 3. このユーザーが書いた REPORT 投稿を取得（type-date-index から user_id でフィルタ）
    reports_result = board_table.query(
        IndexName="type-date-index",
        KeyConditionExpression=Key("board_type").eq("REPORT"),
        FilterExpression=Attr("user_id").eq(user_id) & Attr("parent_sk").not_exists(),
        ScanIndexForward=False,
    )
    reports_by_hackathon: dict[str, dict] = {}
    display_name: str | None = None
    for r in reports_result.get("Items", []):
        if not display_name and r.get("display_name"):
            display_name = r["display_name"]
        hid = r.get("hackathon_source_id", "")
        if hid:
            reports_by_hackathon[hid] = r

    # 4. ハッカソンリストを構築してテーマ集計
    theme_count: dict[str, int] = {}
    hackathon_list = []
    for sid in done_ids:
        h = hackathons.get(sid)
        if not h:
            continue
        entry: dict = {
            "source_id": sid,
            "title": h.get("title", ""),
            "start_date": h.get("start_date", ""),
            "source_name": h.get("source_name", ""),
            "source_url": h.get("source_url", ""),
            "themes": h.get("themes", []),
            "prize_amount": h.get("prize_amount", 0),
            "is_online": h.get("is_online", False),
        }
        if sid in reports_by_hackathon:
            rp = reports_by_hackathon[sid]
            entry["report"] = {
                "body": rp.get("body", ""),
                "rating": rp.get("rating"),
            }
        for t in h.get("themes", []):
            theme_count[t] = theme_count.get(t, 0) + 1
        hackathon_list.append(entry)

    hackathon_list.sort(key=lambda x: x.get("start_date", ""), reverse=True)
    top_themes = sorted(theme_count, key=lambda t: -theme_count[t])[:5]
    avatar_url = (
        f"https://{AVATAR_BUCKET}.s3.{REGION}.amazonaws.com/avatars/{user_id}/avatar.jpg"
    )

    return resp(200, {
        "display_name": display_name,
        "avatar_url": avatar_url,
        "hackathons": hackathon_list,
        "themes": top_themes,
        "report_count": len(reports_by_hackathon),
    })
