# Hackathon Japan

日本で開催されるハッカソン情報を自動収集・整理するまとめサイト。

**URL**: https://hackathon.zzzzico.click

## 機能

- connpass / Doorkeeper / Web から毎日自動収集
- 賞金・テーマ・オンライン/オフライン・初心者向けでフィルタリング
- AI（AWS Bedrock）による賞金額・テーマ・初心者フレンドリー判定の自動補完

## アーキテクチャ

```
[EventBridge Scheduler] 毎日 JST 06:00
        │
        ├── connpass API ──────────────────┐
        ├── Doorkeeper API ────────────────┤→ [DeduplicatorQueue] → [Lambda: Deduplicator]
        ├── Google Alerts RSS ─────────────┘                               │
        └── Tavily Web検索（週1）──────────→ [ScraperQueue]                │
                                                    │                      ↓
                                           [Lambda: Scraper]         [DynamoDB: hackathons]
                                                    │                      │
                                           [BedrockQueue]                  │
                                                    │                      │
                                    [Lambda: Bedrock Structurer]           │
                                    (Claude Sonnet on Bedrock)             │
                                                    └──────────────────────┘
                                                                           │
                                                              [API Gateway + Lambda: API]
                                                                           │
                                                              [Next.js on AWS Amplify]
```

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | Next.js (App Router), TypeScript, Tailwind CSS |
| ホスティング | AWS Amplify |
| API | API Gateway + AWS Lambda (Python 3.11) |
| データベース | Amazon DynamoDB |
| AI補完 | AWS Bedrock (Claude Sonnet 4.5) |
| IaC | AWS SAM |
| キュー | Amazon SQS |
| スケジューラ | Amazon EventBridge Scheduler |

## ディレクトリ構成

```
.
├── frontend/                  # Next.js フロントエンド
│   ├── app/                   # App Router ページ
│   ├── components/            # UIコンポーネント
│   └── lib/                   # API クライアント・型定義
├── lambdas/
│   ├── api/                   # GET /hackathons API
│   ├── bedrock_structurer/    # Bedrock で情報抽出
│   ├── collectors/
│   │   ├── connpass/          # connpass API v2
│   │   ├── doorkeeper/        # Doorkeeper API
│   │   ├── google_alerts/     # Google Alerts RSS
│   │   └── tavily/            # Tavily Web検索
│   ├── deduplicator/          # 重複排除・DynamoDB書き込み
│   └── scraper/               # HTML取得
├── template.yaml              # AWS SAM テンプレート
├── samconfig.toml             # SAM デプロイ設定
└── amplify.yml                # Amplify ビルド設定
```

## DynamoDB スキーマ

テーブル名: `hackathons`

| 属性 | 型 | 説明 |
|------|----|------|
| source_id | S (PK) | `connpass#12345` など |
| start_date | S (SK) | `2026-06-01` |
| title | S | イベント名 |
| source_url | S | 元URL |
| source_name | S | connpass / doorkeeper / web |
| is_online | BOOL | オンライン開催か |
| online_status | S | ONLINE / OFFLINE |
| prize_amount | N | 賞金総額（円） |
| prize_bucket | S | NO_PRIZE / SMALL / LARGE |
| themes | L | AIなどのテーマリスト |
| is_beginner_friendly | BOOL | 初心者向けか |
| status | S | UPCOMING / PAST |
| description | S | 概要（300字以内） |

GSI: `status-start_date-index` / `online_status-start_date-index` / `prize_bucket-start_date-index`

## セットアップ

### 前提条件

- AWS CLI（SSO設定済み）
- AWS SAM CLI
- Node.js 20+
- Python 3.11+

### SSM パラメータの登録

```bash
# connpass API キー
aws ssm put-parameter --name /hackathon/connpass_api_key \
  --value "<YOUR_KEY>" --type SecureString --profile otsuka

# Tavily API キー
aws ssm put-parameter --name /hackathon/tavily_api_key \
  --value "<YOUR_KEY>" --type SecureString --profile otsuka

# Google Alerts RSS フィード URL（JSON配列）
aws ssm put-parameter --name /hackathon/google_alerts_feeds \
  --value '["https://www.google.com/alerts/feeds/..."]' \
  --type String --profile otsuka
```

### バックエンドデプロイ

```bash
sam build
sam deploy --guided   # 初回のみ
sam deploy            # 2回目以降
```

### フロントエンド（ローカル）

```bash
cd frontend
cp .env.local.example .env.local   # API URLを設定
npm install
npm run dev
```

## データ収集を手動実行

```bash
# connpass
aws lambda invoke --function-name hackathon-connpass-collector \
  --payload '{}' --cli-binary-format raw-in-base64-out /tmp/out.json --profile otsuka

# Doorkeeper
aws lambda invoke --function-name hackathon-doorkeeper-collector \
  --payload '{}' --cli-binary-format raw-in-base64-out /tmp/out.json --profile otsuka

# Tavily（週次）
aws lambda invoke --function-name hackathon-tavily-collector \
  --payload '{}' --cli-binary-format raw-in-base64-out /tmp/out.json --profile otsuka
```

## セキュリティ

- IAM ロールを役割別に分離（Collector / Processor / Api）
- API は DynamoDB 読み取り専用
- SQS キューは SSE 暗号化済み
- API Gateway スロットリング: 20 req/s、バースト 50
- CORS: `https://hackathon.zzzzico.click` のみ許可
- API キーは SSM Parameter Store（SecureString）で管理
