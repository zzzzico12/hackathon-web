# パーソナライズ機能 追加計画（認証 + DynamoDB）

## Context

ハッカソン一覧ページの基本機能は整っているが、ユーザーが繰り返し訪れる理由（リテンション）が不足している。localStorage はブラウザ削除で消えるため、**Google Sign-In（Cognito）+ DynamoDB** でお気に入りをサーバー側に永続化する。合わせて締め切りカウントダウンとカレンダー追加機能も追加する。

## 機能区分

### 認証不要（誰でも利用可）
- ハッカソン一覧・絞り込み・検索
- ハッカソン詳細閲覧
- 締め切りカウントダウン表示
- カレンダー追加（.ics ダウンロード）

### 認証必須（ユーザー登録を促す機能）
| # | 機能 | 概要 | 訴求ポイント |
|---|------|------|------------|
| 1 | **Google ログイン** | Cognito + Google OAuth | 1クリック登録 |
| 2 | **お気に入り** | ❤ ブックマーク、全デバイス同期 | 「消えない」安心感 |
| 3 | **参加予定** | 📅 参加するハッカソンを登録 | スケジュール管理 |
| 4 | **応募済みマーク** | ✅ 応募完了した記録 | 参加履歴管理 |
| 5 | **個人メモ** | 📝 ハッカソンごとのメモ | チームメモ・アイデア管理 |
| 6 | **締め切りメールリマインダー** | 締め切り前日にメール通知 | 見逃し防止 |
| 7 | **マイページ** | 📊 登録数・参加予定数・履歴 | 活動の可視化 |

## アーキテクチャ

```
[ブラウザ]
  ↓ signInWithRedirect()（Amplify v6）
[Cognito Hosted UI] ← Google OAuth2 フェデレーション
  ↓ Authorization Code → ID Token / Access Token
[フロントエンド] ← JWT を Authorization: Bearer で付与
  ↓
[API Gateway /favorites] ← Cognito JWT Authorizer
  ↓ claims["sub"] = user_id
[FavoritesLambda] ↔ [DynamoDB: hackathon-user-favorites]
```

## 事前準備（手動）

Google Cloud Console での OAuth アプリ作成が必要（SAM では自動化不可）:
1. `console.cloud.google.com` → 新しい OAuth 2.0 クライアント作成
2. 承認済みリダイレクト URI: `https://hackathon-zzzzico.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`
3. 取得した `client_id` / `client_secret` を SSM に保存:
   - `/hackathon/google_client_id`
   - `/hackathon/google_client_secret`

## DynamoDB スキーマ（ユーザーデータ）

シングルテーブル設計：複数アクションを1テーブルで管理

```
Table: hackathon-user-data
PK: user_id (HASH)   = Cognito sub
SK: {TYPE}#{source_id} (RANGE)
  TYPE: FAV（お気に入り）| PLAN（参加予定）| APPLIED（応募済み）| NOTE（メモ）

追加 attribute:
  body: string        # NOTE の場合のみ（メモ本文）
  created_at: string  # ISO8601
  
Email reminders 用:
  user_email: user_id GSI は不要。SES 送信時は Cognito Admin API で email を取得。
```

## AWS リソース（追加分）

### template.yaml に追加

```yaml
# Parameters
GoogleClientId:
  Type: AWS::SSM::Parameter::Value<String>
  Default: /hackathon/google_client_id
GoogleClientSecret:
  Type: AWS::SSM::Parameter::Value<String>
  Default: /hackathon/google_client_secret

# Cognito
UserPool / UserPoolGoogleIdP / UserPoolClient / UserPoolDomain

# DynamoDB（シングルテーブル）
UserDataTable:
  TableName: hackathon-user-data
  KeySchema: [{user_id: HASH}, {SK: RANGE}]
  BillingMode: PAY_PER_REQUEST

# Lambda（ユーザーデータ CRUD）
UserDataFunction:
  FunctionName: hackathon-user-data
  Timeout: 10, MemorySize: 128
  Events:
    GetAll:   GET  /user/data           ← 全アクション取得（FAV/PLAN/APPLIED/NOTE）
    PostAct:  POST /user/data           ← アクション追加（body: {type, source_id, body?}）
    DeleteAct: DELETE /user/data/{sk}   ← アクション削除（SK = TYPE#source_id）
    GetMyPage: GET /user/me             ← 統計取得（件数カウント）
    すべて Cognito Authorizer 必須

# Lambda（メールリマインダー）
ReminderFunction:
  FunctionName: hackathon-reminder
  Schedule: cron(0 0 * * ? *)  # 毎日 JST 09:00
  Role: ReminderRole（SES:SendEmail + DynamoDB:Scan + Cognito:AdminGetUser）
```

### HackathonApi の変更

```yaml
Cors:
  AllowMethods: "'GET,POST,DELETE,OPTIONS'"
  AllowHeaders: "'Content-Type,Authorization'"
Auth:
  Authorizers:
    CognitoAuthorizer:
      UserPoolArn: !GetAtt UserPool.Arn
  DefaultAuthorizer: NONE   # 既存の公開 API は認証不要のまま
```

## バックエンド実装

### lambdas/user_data/app.py（新規）

```python
def get_user_id(event) -> str:
    return event["requestContext"]["authorizer"]["claims"]["sub"]

# GET /user/data?type=FAV  → SKがFAV#で始まるアイテムを返す
# GET /user/data           → 全アクションを返す

# POST /user/data  body: {"type": "FAV", "source_id": "connpass#123", "body": "..."}
# → PutItem: {user_id: sub, SK: "FAV#connpass#123", created_at: now, body?: "..."}

# DELETE /user/data/{sk}   sk = "FAV#connpass%23123"（URL エンコード）
# → DeleteItem: {user_id: sub, SK: unquote(sk)}

# GET /user/me → Query counts per TYPE prefix (FAV/PLAN/APPLIED/NOTE)
```

### lambdas/reminder/app.py（新規）

```python
# 毎日実行
# 1. UserDataTable scan: SK begins_with("PLAN#")
# 2. 対応する hackathon の entry_deadline を HackathonsTable から取得
# 3. entry_deadline == tomorrow の場合:
#    - Cognito AdminGetUser でメールアドレス取得
#    - SES でリマインダーメール送信
```

## フロントエンド実装

### 新規インストール

```bash
npm install aws-amplify
```

### 環境変数（.env.local + Amplify コンソール）

```
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-northeast-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=hackathon-zzzzico.auth.ap-northeast-1.amazoncognito.com
```

### 新規ファイル

```
frontend/
  lib/
    amplify.ts              # Amplify.configure()
    useAuth.ts              # "use client" — user, signIn, signOut
    useUserData.ts          # "use client" — GET /user/data キャッシュ + CRUD
  components/
    AuthButton.tsx          # "use client" — ログイン/アカウントメニュー
    ActionButton.tsx        # "use client" — FAV/PLAN/APPLIED/NOTE の汎用トグルボタン
    DeadlineCountdown.tsx   # "use client" — 締め切りN日バッジ
    AddToCalendarButton.tsx # "use client" — .ics 生成ダウンロード
    NoteModal.tsx           # "use client" — メモ入力モーダル
  app/
    auth/callback/page.tsx  # Amplify handleAuthRedirect
    mypage/page.tsx         # "use client" — 統計 + FAV/PLAN/APPLIED 一覧
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `frontend/app/layout.tsx` | Amplify 初期化 + `AuthButton` をヘッダーに追加 |
| `frontend/components/HackathonCard.tsx` | `ActionButton`（FAV）+ `DeadlineCountdown` を注入 |
| `frontend/app/hackathons/[id]/page.tsx` | FAV/PLAN/APPLIED ボタン + `AddToCalendarButton` + `NoteModal` |
| `frontend/components/FilterBar.tsx` | `/mypage` ナビリンク追加 |

### useUserData.ts 設計

```typescript
// "use client"
// - マウント時: GET /user/data (JWT付き) → {FAV: Set<string>, PLAN: Set<string>, ...} を state にキャッシュ
// - toggle(type, source_id): 楽観的更新 → POST or DELETE → エラー時ロールバック
// - 未ログイン時: login促進モーダルを表示
// - note(source_id, text): POST type=NOTE

interface UserDataState {
  FAV: Set<string>
  PLAN: Set<string>
  APPLIED: Set<string>
  NOTES: Map<string, string>  // source_id → 本文
}
```

### /mypage（マイページ）

```
📊 マイページ
  お気に入り: 12件  参加予定: 3件  応募済み: 7件

📅 参加予定のハッカソン
  [カード一覧]

❤ お気に入り
  [カード一覧]

✅ 応募済み
  [カード一覧]
```

### 詳細ページのアクションバー

```
[❤ お気に入り] [📅 参加予定] [✅ 応募済み] [📝 メモ] [📆 カレンダー追加]
未ログイン → クリックで "Googleでログインしてお気に入り登録" モーダル
```

### DeadlineCountdown.tsx（認証不要・全ユーザー向け）

- `daysLeft = Math.ceil((new Date(entryDeadline) - Date.now()) / 86_400_000)`
- `≤0` 非表示、`≤3日`=赤、`≤7日`=オレンジ、それ以降=灰色

### AddToCalendarButton.tsx（認証不要・全ユーザー向け）

iCal（RFC 5545）を Blob で生成 → `<a>.click()` でダウンロード:
```
DTSTART;VALUE=DATE:YYYYMMDD
DTEND;VALUE=DATE:YYYYMMDD+1  # end_date の翌日
SUMMARY / DESCRIPTION / LOCATION / URL
```

## 実装順序

1. **Phase 1 — AWS インフラ**: Cognito + UserDataTable + UserDataFunction + ReminderFunction を SAM デプロイ
2. **Phase 2 — 認証フロー**: Amplify 設定、`useAuth`、`AuthButton`、`/auth/callback`
3. **Phase 3 — 認証不要機能**: `DeadlineCountdown`（カード）+ `AddToCalendarButton`（詳細）
4. **Phase 4 — ユーザーデータ CRUD**: `useUserData`、`ActionButton`（FAV/PLAN/APPLIED）
5. **Phase 5 — マイページ**: `/mypage` 統計 + 一覧
6. **Phase 6 — メモ**: `NoteModal` + 詳細ページ統合
7. **Phase 7 — メールリマインダー**: Reminder Lambda + SES 設定

## 検証方法

1. Googleでログイン → Cognito Hosted UI → `/auth/callback` → ホームへ戻る
2. ハートをクリック → DynamoDB `hackathon-user-data` に `{user_id, SK: "FAV#..."}`
3. 別デバイスでログイン → お気に入りが同期されている
4. 参加予定に登録 → `/mypage` の参加予定一覧に表示
5. 締め切り翌日にリマインダーメール受信
6. メモを保存 → ページリロード後も表示
7. カレンダー追加 → `.ics` ダウンロード、Google Calendar へインポート
8. `npm run build` でエラーなし

---

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
