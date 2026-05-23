.PHONY: build deploy local-connpass local-doorkeeper setup-ssm

PROFILE = --profile otsuka
PYENV   = PYENV_VERSION=3.11.11

build:
	$(PYENV) sam build

deploy: build
	$(PYENV) sam deploy

# ローカルテスト（SQS未使用、DynamoDBに直接書き込み）
local-connpass:
	$(PYENV) sam local invoke ConnpassCollector \
	  --env-vars local-env.json \
	  --event events/empty.json

local-doorkeeper:
	$(PYENV) sam local invoke DoorkeeperCollector \
	  --env-vars local-env.json \
	  --event events/empty.json

# SSM にAPIキーを登録（初回のみ）
setup-ssm:
	@echo "Tavily APIキーを入力してください:"; \
	read key; \
	aws ssm put-parameter $(PROFILE) \
	  --name /hackathon/tavily_api_key \
	  --value "$$key" \
	  --type SecureString \
	  --overwrite
	aws ssm put-parameter $(PROFILE) \
	  --name /hackathon/google_alerts_feeds \
	  --value '[]' \
	  --type String \
	  --overwrite

# Lambda手動実行（デプロイ後の動作確認）
invoke-connpass:
	aws lambda invoke $(PROFILE) \
	  --function-name hackathon-connpass-collector \
	  --payload '{}' \
	  /tmp/connpass-out.json && cat /tmp/connpass-out.json

invoke-doorkeeper:
	aws lambda invoke $(PROFILE) \
	  --function-name hackathon-doorkeeper-collector \
	  --payload '{}' \
	  /tmp/doorkeeper-out.json && cat /tmp/doorkeeper-out.json

# DynamoDBのデータ確認
scan-db:
	aws dynamodb scan $(PROFILE) \
	  --table-name hackathons \
	  --max-items 5 \
	  --query 'Items[].{id:source_id.S,title:title.S,date:start_date.S}'

# ログ確認
logs-connpass:
	aws logs tail $(PROFILE) /aws/lambda/hackathon-connpass-collector --follow

logs-doorkeeper:
	aws logs tail $(PROFILE) /aws/lambda/hackathon-doorkeeper-collector --follow

logs-bedrock:
	aws logs tail $(PROFILE) /aws/lambda/hackathon-bedrock-structurer --follow

logs-api:
	aws logs tail $(PROFILE) /aws/lambda/hackathon-api --follow
