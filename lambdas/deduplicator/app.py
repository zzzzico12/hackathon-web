"""
DeduplicatorQueue からイベントを受け取り、重複排除してDynamoDBに書き込む Lambda。
connpass / Doorkeeper など構造化済みデータを処理する。
"""
import json
import os
import boto3
from datetime import datetime

TABLE_NAME = os.environ["DYNAMODB_TABLE"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def handler(event, context):
    for record in event.get("Records", []):
        try:
            item = json.loads(record["body"])
            write_to_dynamo(item)
        except Exception as e:
            print(f"[deduplicator] error: {e} | body={record.get('body','')[:200]}")
            raise


def write_to_dynamo(item: dict):
    source_id = item.get("source_id", "")
    if not source_id:
        print(f"[deduplicator] skipping item with no source_id")
        return

    item["updated_at"] = datetime.utcnow().isoformat()

    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(source_id)",
        )
        print(f"[deduplicator] inserted: {source_id}")
    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        table.update_item(
            Key={"source_id": source_id, "start_date": item.get("start_date", "")},
            UpdateExpression="SET updated_at = :ua, description = :desc, #st = :status",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":ua": item["updated_at"],
                ":desc": item.get("description", ""),
                ":status": item.get("status", "UPCOMING"),
            },
        )
        print(f"[deduplicator] updated existing: {source_id}")
