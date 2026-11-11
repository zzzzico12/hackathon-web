# Hackathon Japan

日本で開催されるハッカソン情報を自動収集・整理する**個人用ツール**。自分だけが使う前提で、画面は自分の Mac 上（http://localhost:3100）でのみ動かしている。

> 当初は Web サイト（`https://hackathon.zzzzico.click`）として一般公開していたが、取得元サイトの利用規約を確認した結果、2026年11月に公開を停止し、個人用ツールに切り替えた。

## 利用方針

### 取得元ごとの規約と扱い

| 取得元 | 取得方法 | 規約上のポイント | 扱い |
|--------|----------|------------------|------|
| connpass | 公式 API（API キーを申請して取得） | API は個人利用として申請。集約・公開型サービスとして使う場合は事前承諾が必要 | 個人利用の範囲で継続 |
| Doorkeeper | 公式 API | 競合サービスへの利用は禁止。利用規約・プライバシーポリシーの設置が必要 | 個人利用の範囲で継続 |
| Devpost | 非公式 JSON エンドポイント | 利用規約で自動取得（スクレイピング）が禁止 | **取得を停止**。コレクターと保存済みデータを削除 |
| TECH PLAY | ページを自動取得し、Bedrock で項目を抽出 | 自動取得の禁止条項なし。robots.txt で `Crawl-delay: 5` | 5 秒間隔を守って継続 |
| CraftStadium | ページを自動取得 | 利用規約 1.9 第13号で「ボット等の自動化プログラム」の利用を禁止 | **取得を停止**。コレクターと保存済みデータを削除 |
| AI Festival | ページを自動取得 | 利用規約なし。robots.txt で全体を許可 | 継続 |
| Google アラート | RSS フィード | Google 利用規約は robots.txt に反する自動アクセスを禁止。`/alerts/` は Disallow だが、RSS はフィードリーダー向けの提供形式 | 個人利用の範囲で継続 |
| Tavily | 検索 API | 利用は内部目的に限る。第三者の規約順守は利用者の責任 | 継続。見つけたページは robots.txt を確認してから取得 |

### 自動取得のルール

- User-Agent は `HackathonJPBot/1.0 (personal use)` と名乗る（ブラウザを装わない）
- スクレイパーは取得前に robots.txt を確認し、禁止されている URL は取得しない。`Crawl-delay` があればその秒数待ってから取得する
- 自動取得を禁止している、または取得を停止した取得元（`devpost.com`・`craftstadium.com`）はブロックリストで除外する

### 非公開化のために行ったこと

- Amplify アプリを削除し、`hackathon.zzzzico.click` の DNS レコードも削除した（公開 URL は存在しない）
- 画面は launchd で自分の Mac に常駐させ、`localhost:3100` からのみ使う
- API Gateway は全ルートで API キー必須。キーは `frontend/.env.local` にのみ置く（git 管理外）
- CORS・Cognito のコールバック URL は `http://localhost:3100` のみ許可
- 検索エンジンにインデックスさせない（robots.txt で全拒否、`noindex`、sitemap 削除）

## 機能

### ハッカソン発見
- connpass / Doorkeeper / Web から毎日自動収集
- 賞金・テーマ・オンライン/オフライン・初心者向けでフィルタリング
- キーワード検索・並び順変更（開始日順 / 賞金順）
- 開催予定 / 開催済み切り替え
- リスト表示 / カレンダー表示切り替え
- AI（AWS Bedrock）による賞金額・テーマ・初心者フレンドリー判定の自動補完

### 個人管理（要ログイン）
- お気に入り・応募済み・参加済みのブックマーク
- メモ機能
- マイページでの一括管理
- カレンダー書き出し（.ics）

### コミュニティ（要ログイン）

公開時に作った機能。個人用ツールになったため、現在は自分以外の利用者はいない。

- チーム募集掲示板（スキル提供/求む表示）
- 参加レポート（★評価付き）
- スレッド返信・編集・削除
- ダイレクトメッセージ（DM）

### プロフィール（要ログイン）
- 表示名設定
- アバター画像アップロード（S3）

## アーキテクチャ

```
[EventBridge Scheduler] 毎日 JST 06:00〜07:00
        │
        ├── ConnpassCollector (06:00)   ──────────┐
        ├── DoorkeeperCollector (06:05) ──────────┤→ [SQS: DeduplicatorQueue]
        ├── GoogleAlertsCollector (06:10) ────────┘         │
        │                                          [Lambda: Deduplicator]
        ├── TavilyCollector (07:00) ───────────┐
        ├── AiFestivalCollector (07:20) ───────┤
        └── TechPlayCollector (07:25) ─────────┴──────────→ [SQS: ScraperQueue]
                                                                      │
                                                           [Lambda: Scraper]
                                                                      │
                                                           [SQS: BedrockQueue]
                                                                      │
                                                  [Lambda: BedrockStructurer]
                                                  (Claude Sonnet on Bedrock)
                                                                      │
                                                       [DynamoDB: hackathons]
                                                                      │
                                                  [Lambda: StatusUpdater] (06:30)
                                                  UPCOMING / PAST 自動更新

[API Gateway + API キー必須 + Cognito Authorizer]
    ├── GET  /hackathons, /hackathons/{id}     → ApiFunction       (API キーのみ)
    ├── GET,POST,PATCH,DELETE /hackathons/{id}/board → BoardFunction (認証必須)
    ├── GET,POST,DELETE /user/*                → UserDataFunction  (認証必須)
    └── GET,POST /dm/*                         → DmFunction        (認証必須)

[Amazon Cognito] Google Sign-In
[Amazon S3]      アバター画像（avatars/{user_id}/avatar.jpg）
[Next.js]        自分の Mac で launchd 常駐、localhost:3100（公開ホスティングなし）
```

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| ホスティング | なし（自分の Mac で launchd 常駐） |
| 認証 | Amazon Cognito (Google Sign-In) + Amplify v6 |
| API | API Gateway + AWS Lambda (Python 3.13) |
| データベース | Amazon DynamoDB |
| ストレージ | Amazon S3 (アバター画像) |
| AI補完 | AWS Bedrock (Claude Sonnet) |
| IaC | AWS SAM |
| キュー | Amazon SQS (FIFO / Standard) |
| スケジューラ | Amazon EventBridge Scheduler |

## ディレクトリ構成

```
.
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # ハッカソン一覧（リスト/カレンダー）
│   │   ├── hackathons/[id]/      # 詳細・掲示板
│   │   ├── dm/                   # ダイレクトメッセージ
│   │   └── mypage/               # マイページ・プロフィール
│   ├── components/
│   │   ├── HackathonCard.tsx
│   │   ├── HackathonCalendar.tsx
│   │   ├── HackathonBoard.tsx
│   │   ├── AuthButton.tsx
│   │   ├── FilterBar.tsx
│   │   └── ...
│   └── lib/
│       ├── api.ts                # APIクライアント
│       ├── types.ts
│       └── useAuth.ts
├── lambdas/
│   ├── api/                      # GET /hackathons
│   ├── board/                    # 掲示板 CRUD
│   ├── dm/                       # ダイレクトメッセージ
│   ├── user_data/                # ブックマーク・メモ・アバター
│   ├── status_updater/           # UPCOMING/PAST 自動更新
│   ├── bedrock_structurer/       # Bedrock で情報抽出
│   ├── deduplicator/             # 重複排除・DynamoDB書き込み
│   ├── scraper/                  # HTML取得
│   └── collectors/
│       ├── connpass/
│       ├── doorkeeper/
│       ├── google_alerts/
│       ├── tavily/
│       ├── techplay/
│       └── aifestival/
├── template.yaml                 # AWS SAM テンプレート
├── samconfig.toml                # SAM デプロイ設定（.gitignore対象）
└── amplify.yml                   # 公開時の Amplify ビルド設定（現在は未使用）
```

## DynamoDB スキーマ

### hackathons

| 属性 | 型 | 説明 |
|------|----|------|
| source_id | S (PK) | `connpass#12345` / `web#<hash>` |
| start_date | S (SK) | `2026-06-01` |
| title | S | イベント名 |
| source_url | S | 元URL |
| source_name | S | connpass / doorkeeper / web |
| is_online | BOOL | オンライン開催か |
| online_status | S | ONLINE / OFFLINE / HYBRID |
| prize_amount | N | 賞金総額（円） |
| prize_bucket | S | NO_PRIZE / SMALL / LARGE |
| themes | L | テーマリスト |
| is_beginner_friendly | BOOL | 初心者向けか |
| status | S | UPCOMING / PAST |
| description | S | 概要（300字以内） |

GSI: `status-start_date-index` / `online_status-start_date-index` / `prize_bucket-start_date-index`

### hackathon-board

| 属性 | 型 | 説明 |
|------|----|------|
| hackathon_source_id | S (PK) | ハッカソンID |
| SK | S | `TEAM#{timestamp}#{user_id}` / `REPORT#...` / `TEAM#REPLY#...` |
| board_type | S | TEAM / REPORT / REPLY |
| user_id | S | 投稿者 Cognito sub |
| body | S | 本文（最大5000字） |
| rating | N | 評価1〜5（REPORTのみ） |
| skills / wants | L | スキル（TEAMのみ） |

### hackathon-dm

| 属性 | 型 | 説明 |
|------|----|------|
| user_id | S (PK) | Cognito sub |
| SK | S | `CONV#{other_user_id}` / `MSG#{other_user_id}#{ts}#{uuid}` |
| unread_count | N | 未読件数（CONVのみ） |
| body | S | 本文（最大5000字） |

### hackathon-user-data

| 属性 | 型 | 説明 |
|------|----|------|
| user_id | S (PK) | Cognito sub |
| SK | S | `FAV#{source_id}` / `DONE#...` / `APPLIED#...` / `NOTE#...` |
| body | S | メモ本文（最大2000字、NOTEのみ） |

## セキュリティ

| 項目 | 内容 |
|------|------|
| 公開範囲 | 公開 URL なし。画面は localhost:3100 のみ、API は全ルートで API キー必須 |
| 認証 | Cognito JWT (Google Sign-In)。書き込み系 API は全て Authorizer 必須 |
| IAM | 役割別に最小権限（Collector / Processor / Api / Board / DM / UserData） |
| CORS | Lambda・S3 ともに `http://localhost:3100` のみ |
| API 公開範囲 | 全ルートで API キー必須（UsagePlan `hackathon-personal`） |
| S3 公開範囲 | `avatars/*` パスのみ GetObject 許可。ルートは非公開 |
| スロットリング | API Gateway: 20 req/s・バースト 50 |
| 入力バリデーション | メッセージ本文 5000字・メモ 2000字・表示名 100字の上限をバックエンドで強制 |
| 外部サービスの API キー | SSM Parameter Store (SecureString) 管理。コードに埋め込まない |
| 所有権確認 | 削除・編集は SK 末尾の user_id 一致を確認 |

## セットアップ

### 前提条件

- AWS CLI（プロファイル設定済み）
- AWS SAM CLI
- Node.js 20+
- Python 3.13+（Lambda ランタイムも python3.13。python3.11 は AWS 側で更新不可になったため移行済み）

### SSM パラメータの登録

```bash
aws ssm put-parameter --name /hackathon/connpass_api_key \
  --value "<YOUR_KEY>" --type SecureString

aws ssm put-parameter --name /hackathon/tavily_api_key \
  --value "<YOUR_KEY>" --type SecureString

aws ssm put-parameter --name /hackathon/google_alerts_feeds \
  --value '["https://www.google.com/alerts/feeds/..."]' --type String

aws ssm put-parameter --name /hackathon/google_client_id \
  --value "<CLIENT_ID>" --type SecureString

aws ssm put-parameter --name /hackathon/google_client_secret \
  --value "<CLIENT_SECRET>" --type SecureString
```

### バックエンドデプロイ

```bash
sam build
sam deploy --guided   # 初回のみ
sam deploy            # 2回目以降
```

### フロントエンド（常駐: launchd）

`~/Library/LaunchAgents/com.otsuka.hackathon-web.plist` で `next start -p 3100` を常駐させている（ログイン時に自動起動、ログは `/tmp/hackathon-web.log`）。

```bash
# コードや .env.local を変更したら、ビルドして再起動
cd frontend && npm run build
launchctl kickstart -k gui/$(id -u)/com.otsuka.hackathon-web

# 常駐をやめる
launchctl bootout gui/$(id -u)/com.otsuka.hackathon-web
```

### フロントエンド（ローカル開発）

launchd の常駐と同じ 3100 番を使うため、先に常駐を止めてから起動する。

```bash
launchctl bootout gui/$(id -u)/com.otsuka.hackathon-web
cd frontend
npm install
npm run dev   # http://localhost:3100

# 開発が終わったら常駐を再開
npm run build
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.otsuka.hackathon-web.plist
```

### 環境変数（.env.local）

```
NEXT_PUBLIC_API_URL=https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/v1
NEXT_PUBLIC_API_KEY=<API キーの値>
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_COGNITO_DOMAIN=your-domain.auth.ap-northeast-1.amazoncognito.com
NEXT_PUBLIC_AVATAR_BASE_URL=https://hackathon-avatars-<account-id>.s3.ap-northeast-1.amazonaws.com
```

API キーの値は、`sam deploy` の Outputs にある `ApiKeyId` から取得する。

```bash
aws apigateway get-api-key --api-key <ApiKeyId> --include-value --query value --output text
```

## データ収集スケジュール

| コレクター | 実行時刻（JST） | 対象 |
|-----------|----------------|------|
| Connpass | 毎日 06:00 | connpass.com API |
| Doorkeeper | 毎日 06:05 | doorkeeper.jp API |
| Google Alerts | 毎日 06:10 | Google Alerts RSS |
| StatusUpdater | 毎日 06:30 | UPCOMING/PAST 自動更新 |
| Tavily Web検索 | 毎日 07:00 | 上記以外の Web サイト |
| AI Festival | 毎日 07:20 | aifestival.jp |
| TECH PLAY | 毎日 07:25 | techplay.jp |

収集は AWS 上で動くため、Mac の電源や画面の常駐とは関係なく毎日続く。Devpost と CraftStadium は 2026年11月に取得を停止した。

## データ収集を手動実行

```bash
# connpass
aws lambda invoke --function-name hackathon-connpass-collector \
  --region ap-northeast-1 /tmp/out.json

# Tavily
aws lambda invoke --function-name hackathon-tavily-collector \
  --region ap-northeast-1 /tmp/out.json

# ステータス更新
aws lambda invoke --function-name hackathon-status-updater \
  --region ap-northeast-1 /tmp/out.json
```
