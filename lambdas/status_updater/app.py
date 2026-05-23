"""
UPCOMING のイベントのうち start_date が過去になったものを PAST に更新する Lambda。
毎日実行。
"""
import os
import boto3
from datetime import datetime, timezone

TABLE_NAME = os.environ["DYNAMODB_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def handler(event, context):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    updated = 0
    last_key = None

    while True:
        kwargs = {
            "IndexName": "status-start_date-index",
            "KeyConditionExpression": (
                boto3.dynamodb.conditions.Key("status").eq("UPCOMING")
                & boto3.dynamodb.conditions.Key("start_date").lt(today)
            ),
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key

        result = table.query(**kwargs)
        items = result.get("Items", [])

        for item in items:
            table.update_item(
                Key={"source_id": item["source_id"], "start_date": item["start_date"]},
                UpdateExpression="SET #st = :past, updated_at = :ua",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={
                    ":past": "PAST",
                    ":ua": datetime.now(timezone.utc).isoformat(),
                },
            )
            updated += 1

        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

    print(f"[status_updater] updated {updated} events to PAST (today={today})")
    return {"statusCode": 200, "updated": updated}
