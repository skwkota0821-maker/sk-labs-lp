# Seedance 2.5 Adapter仕様

## 目的
SK LABSの正本人物・キャラクター資産をBytePlus Dreamina-Seedance-2.5へ安全に渡し、非同期動画生成ジョブとして扱うProvider境界を定義する。

## 対象
- model: `dreamina-seedance-2-5-260628`
- region: `ap-southeast-1`
- auth: `Authorization: Bearer $MODELARK_API_KEY`
- APIキーはGitHubへ保存せずSecret管理する。

## API
- 生成開始: `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`
- 状態取得: `GET https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{id}`

## Canonical Reference Pack必須権利情報
```json
{
  "reference_pack_id": "...",
  "subject_id": "...",
  "reference_images": [],
  "reference_videos": [],
  "reference_audio": [],
  "rights_status": "self_owned",
  "consent_status": "not_applicable",
  "contains_personal_data": false,
  "provider_export_allowed": true,
  "voice_rights_status": "self_owned",
  "portrait_rights_status": "self_owned"
}
```

## 送信前ゲート
以下を1つでも満たさない素材はProviderへ送信しない。
- `provider_export_allowed == true`
- `rights_status` が `self_owned` または `licensed`
- `consent_status` が `not_applicable` または `obtained`
- `contains_personal_data == false`
- 顔・声利用時は対応する権利状態が許可済み

## SK LABS Generation Jobへの正規化
- `generation_id`: SK LABS側で発番
- `provider`: `byteplus`
- `model`: `dreamina-seedance-2-5-260628`
- `provider_task_id`: BytePlus task ID
- `status`: Provider状態を内部状態へ正規化
- `usage`: Provider応答を保存
- `cost`: 正式Billing単価確定後に計算
- `started_at`
- `completed_at`
- `error`
- `correlation_id`

## QA
生成完了後、動画を正本QAへ渡す。
1. 先頭・中間・末尾フレーム抽出
2. Canonical Reference PackとのIdentity Score測定
3. 顔崩れ・衣装崩れ・キャラクター逸脱をHard Fail判定
4. Generation Time記録
5. usageと正式料金表からCost記録

A/B-1完了前は既存Character Consistency LabのKPIを変更しない。

## 初回実証
- SK LABS所有または完全権利管理された非実在人物
- 個人情報なし
- 参照画像1枚
- 短尺1本のみ
- 16:9
- 720p
- seed固定可能な場合は固定

## 未解決ゲート
- ModelArk実アカウントでSeedance 2.5有効化
- APIキー発行
- 最新正式料金確定
- 実生成1本
- 出力取得
- Identity QA
- コスト実測

全ゲート通過まで正本Providerへ昇格しない。
