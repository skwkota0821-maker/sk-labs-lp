# 🟡【AI基盤】SK LABS Adult Generation Gateway MVP仕様｜2026年8月22日

## 1. 目的
SK LABS Harness CoreとGPU画像生成Workerを分離し、モデル・GPU事業者を交換可能な画像生成基盤を構築する。

## 2. 境界
Harness Core -> Adult Generation Gateway -> Queue -> ComfyUI Worker -> Private Storage

ブラウザからComfyUIへ直接接続しない。

## 3. API
### POST /v1/generations
入力:
- member_id
- model_id
- workflow_id
- prompt
- negative_prompt
- width / height
- steps
- seed(optional)

処理順:
1. Harness Coreで会員状態を照合
2. age_verified=true を要求
3. adult_access=true を要求
4. 禁止入力ゲート
5. Model Registryでapprovedモデルか照合
6. Job作成
7. Queue投入
8. Workerへ配送

戻り値: job_id / status=queued

### GET /v1/generations/{job_id}
member_id所有権を確認して状態のみ返す。

### GET /v1/models
approvedかつ当該会員権限で利用可能なモデルのみ返す。

## 4. Model Registry
model_id
name
version
model_type (checkpoint|lora|vae|controlnet)
source
source_url
license_name
commercial_use (allowed|forbidden|unknown)
adult_use (allowed|forbidden|unknown)
derivative_use (allowed|forbidden|unknown)
redistribution (allowed|forbidden|unknown)
license_checked_at
license_evidence
sha256
storage_key
status (pending|approved|blocked|retired)

原則: unknownは本番利用不可。

## 5. Generation Job
job_id
member_id
model_id
workflow_id
provider_id
prompt_hash
parameters_json
status (queued|running|succeeded|failed|blocked)
output_storage_key
created_at
started_at
completed_at
policy_reason

生プロンプトの長期保存は最小化し、監査用途にはハッシュ・必要最小限のイベントを残す。

## 6. 禁止ゲート
以下は生成前にblockする。
- 未成年者または未成年に見える人物の性的表現
- 実在人物の同意のない性的表現・性的ディープフェイク
- 性的暴力・非同意表現
- 違法コンテンツ
- 権利侵害が確認された素材
- 年齢・権利・同意状態を確認できない実在人物入力

## 7. Provider Adapter
GatewayはComfyUI固有APIを外へ露出しない。

interface GenerationProvider:
- submit(job)
- getStatus(providerJobId)
- cancel(providerJobId)
- health()

初期実装:
- comfyui-local

将来:
- approved-cloud-provider

## 8. Worker
- Linux
- Docker
- NVIDIA Container Toolkit
- ComfyUI
- Gatewayからのみ到達可能
- 外部公開UIなし
- モデルはread-onlyマウントを基本
- 出力はPrivate Storageへ転送後、Workerローカルから削除可能にする

## 9. Secret
以下はGitへ保存しない。
- GPUホスト認証情報
- Storage credential
- Harness署名鍵
- Gateway API secret
- Provider API key

## 10. MVP完成条件
- Harness権限照合
- POST /v1/generations
- GET /v1/generations/{id}
- Model Registry
- 禁止ゲート
- Queue
- comfyui-local Adapter
- Private Storage
- Audit Event
- provider/model差し替え可能

## 11. 非目標
MVPでは以下を実施しない。
- mainへの直接実装
- 一般公開ComfyUI
- 無審査モデル自動導入
- 未確認クラウドGPUへの本番送信
- 自動販売・自動公開

## 12. 次工程
1. D1/Postgres向けschema作成
2. GatewayのTypeScript interface作成
3. ComfyUI workflow JSON adapter作成
4. Harness Core署名方式決定
5. テスト用非成人画像でE2E疎通
6. 規約・モデルライセンス審査完了後に成人向け本番を解禁