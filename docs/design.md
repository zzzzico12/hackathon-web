# 日本ハッカソンまとめサイト - 情報収集設計

## Context

connpassのハッカソン版として、日本で開催されるハッカソン情報を自動収集・整理するサイトを構築する。
connpassに載っていないハッカソンも拾いたいため、複数の情報源を組み合わせたバッチ収集パイプラインが必要。
AWSフルマネージドで無料枠を最大限活用。DBはDynamoDBを最初から使う（RDS12ヶ月問題を回避）。

---

## 情報収集パイプライン全体像

```
[EventBridge Scheduler] 毎日 AM 6:00 JST
        ↓
[Lambda: Orchestrator]
    ├── connpass API ──────────────────┐
    ├── Doorkeeper API ────────────────┤ 構造化済みデータ
    ├── Devpost API (Japan絞り) ───────┤
    ├── Google Alerts RSS (ポーリング)──┤ URL + snippet
    └── SerpAPI (週1回) ──────────────┘ 新規サイト発見
        ↓
[Lambda: Scraper] ← 未構造化URLのHTML取得
        ↓
[Lambda: Bedrock Structurer] ← Claude Haiku で情報抽出
        ↓
[Lambda: Deduplicator + Writer] ← 重複排除してDynamoDB書き込み
        ↓
[DynamoDB: hackathons table]
```

---

## データソース詳細

### Tier 1: 公式API（毎日）
| ソース | 方法 | クエリ例 |
|--------|------|---------|
| connpass | REST API | `keyword=ハッカソン&count=100` |
| Doorkeeper | REST API | `q=hackathon` |
| Devpost | REST API | `themes[]=hackathon&search=japan` |

### Tier 2: Google Alerts RSS（毎日）
設定するAlertキーワード（5〜10個）:
- `ハッカソン 参加募集`
- `hackathon japan 2025`
- `ハッカソン 賞金`
- `ハッカソン 初心者`
- etc.

RSS エンドポイント: `https://www.google.com/alerts/feeds/<id>/<token>`
→ Lambda から定期ポーリング、新着URLを抽出してスクレイピングキューへ

### Tier 3: Tavily API（週1〜2回）
- SerpAPIより使いやすく、**無料枠1000回/月**（SerpAPIの10倍）
- LLM向けに設計されており、検索結果がそのまま構造化されて返ってくる
- HTMLスクレイピング不要なケースも多い（Tavilyが本文を返してくれる）
- クエリ例: `ハッカソン 参加募集 2025`, `hackathon japan prize`
- `search_depth="advanced"` + `include_raw_content=True` でHTML本文も取得可能

---

## Bedrock構造化抽出

### モデル選定
- **Claude Haiku on Bedrock**（安い・速い）
- コスト目安: 1イベント約 $0.001 → 月500イベントで $0.5 程度

### プロンプト構造
```
以下のHTMLからハッカソン情報をJSON形式で抽出してください。
{
  "title": "",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "entry_deadline": "YYYY-MM-DD or null",
  "is_online": true/false,
  "location": "都市名 or null",
  "prize_amount": 数値(円) or null,
  "themes": ["AI", "Web3", ...],
  "is_beginner_friendly": true/false,
  "description": "200字以内の要約"
}
---
[HTML]
```

---

## DynamoDBスキーマ（シングルテーブル設計）

### テーブル: `hackathons`

| 属性 | 型 | 説明 |
|------|----|------|
| PK | S | `HACKATHON#<ulid>` |
| SK | S | `HACKATHON#<ulid>` |
| source_id | S | `connpass#12345`（重複排除キー） |
| title | S | タイトル |
| start_date | S | `2025-06-01` |
| end_date | S | |
| entry_deadline | S | |
| is_online | BOOL | |
| location | S | |
| prize_amount | N | 円（0=賞金なし） |
| themes | SS | タグセット |
| is_beginner_friendly | BOOL | |
| source_url | S | 元URL |
| source_name | S | connpass/doorkeeper/etc |
| created_at | S | ISO8601 |

### GSI設計（フィルタ対応）

| GSI名 | PK | SK | 用途 |
|-------|----|----|------|
| GSI1 | `status` (UPCOMING/PAST) | `start_date` | 開催予定一覧（デフォルト） |
| GSI2 | `is_online` | `start_date` | オンライン/オフライン絞り込み |
| GSI3 | `prize_bucket` (0/1〜10万/10万〜) | `start_date` | 賞金帯絞り込み |

> ※ themesやis_beginner_friendlyはデータ量が少ないためFilterExpressionで対応

---

## AWS構成と無料枠

| サービス | 用途 | 無料枠 |
|---------|------|--------|
| EventBridge Scheduler | 日次・週次トリガー | 14万イベント/月 |
| Lambda | 各処理 | 100万リクエスト/月 |
| DynamoDB | データ保存 | 25GB / 25WCU / 25RCU |
| SQS | スクレイピングキュー | 100万メッセージ/月 |
| Bedrock (Haiku) | 構造化抽出 | 従量課金（月数百円） |
| Tavily API | 新規発見・Web検索 | 1000回/月 無料 |
| Secrets Manager | APIキー管理 | 30日無料・以降$0.40/シークレット |

---

## 実装フェーズ

### Phase 1: データ収集基盤（最初に作る）
1. DynamoDBテーブル・GSI作成
2. Lambda: connpass / Doorkeeper API収集
3. EventBridge Schedulerで日次実行

### Phase 2: Google Alerts + SerpAPI
4. Google Alerts RSS設定 + Lambda ポーリング
5. Tavily API週次Lambda
6. SQSキューでスクレイピングをキューイング

### Phase 3: Bedrock構造化
7. Lambda: Scraper（HTML取得）
8. Lambda: Bedrock Structurer（Claude Haiku）
9. Lambda: Deduplicator（source_idで重複排除）

### Phase 4: API + フロントエンド
10. API Gateway + Lambda: 検索・フィルタAPI
11. Next.js フロントエンド（Amplify or S3+CloudFront）

---

## 重複排除ロジック

```python
# source_idをDynamoDBのGSIまたはConditionExpressionで管理
source_id = f"{source_name}#{external_id}"

# 書き込み時
table.put_item(
    Item={...},
    ConditionExpression="attribute_not_exists(source_id)"
)
# ConditionalCheckFailedExceptionが出たらスキップ
```

---

## 検証方法

1. Lambda単体テスト: connpass APIから取得 → DynamoDBに書き込まれるか確認
2. Bedrock: サンプルHTMLを入力し、JSONが正しく抽出されるか確認
3. 重複排除: 同じイベントを2回投入し、レコードが1件のみであることを確認
4. GSIクエリ: `is_online=true` で絞り込み、正しいレコードが返るか確認
