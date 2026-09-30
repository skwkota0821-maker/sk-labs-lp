# Seedance 2.5 Adapter仕様

## 目的
SK LABSの正本人物・キャラクター資産をBytePlus LAS Dreamina-Seedance-2.5へ安全に渡し、非同期動画生成ジョブとして扱うProvider境界を定義する。

## 対象
- model: `dreamina-seedance-2-5-260628`
- region: `ap-southeast-1`
- auth: `Authorization: Bearer $LAS_API_KEY`
- APIキーはGitHubへ保存せずSecret管理する。

## API（BytePlus公式LAS）
- 生成開始: `POST https://operator.las.ap-southeast-1.bytepluses.com/api/v1/contents/generations/tasks`
- 状態取得: `GET https://operator.las.ap-southeast-1.bytepluses.com/api/v1/contents/generations/tasks/{id}`
- 成功状態: `succeeded`
- 失敗状態: `failed` / `expired`
- 成功出力: `content.video_url`、必要時 `content.last_frame_url`

## Seedance 2.5主要パラメータ
- `generate_audio`: true/false
- `resolution`: `480p` / `720p`
- `ratio`: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `adaptive`
- `duration`: 4〜30秒
- `seed`: -1〜2^32-1
- `watermark`: true/false
- `return_last_frame`: true/false
- 参照画像: 最大30枚

初回実証は `720p / 16:9 / 5秒 / seed=42 / audio=true / watermark=false / return_last_frame=true` に固定する。

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
  "contains_real_human_face": false,
  "las_asset_library_authorized": false,
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
- 実在人物の顔を含む場合はLAS Asset Libraryの正式アップロード・認可フローを通す

## SK LABS Generation Jobへの正規化
- `generation_id`: SK LABS側で発番
- `provider`: `byteplus_las`
- `model`: `dreamina-seedance-2-5-260628`
- `provider_task_id`: BytePlus task ID
- `status`: Provider状態を内部状態へ正規化
- `usage`: Provider応答を保存
- `cost`: 実課金と照合
- `started_at`
- `completed_at`
- `error`
- `correlation_id`

## 料金基準（公式掲載値・2026-08-23確認）
Seedance 2.5は720pで、音声なし `$0.075/秒`、音声あり `$0.150/秒`。

初回5秒・720p・音声ありの理論原価は `$0.75/本`。
実証後は請求実績と照合し、差異があればBilling側を正とする。

## QA
生成完了後、動画を正本QAへ渡す。
1. 先頭・中間・末尾フレーム抽出
2. Canonical Reference PackとのIdentity Score測定
3. 顔崩れ・衣装崩れ・キャラクター逸脱をHard Fail判定
4. Generation Time記録
5. usageと請求実績からCost記録

A/B-1完了前は既存Character Consistency LabのKPIを変更しない。

## 初回実証
- SK LABS所有または完全権利管理された非実在人物を優先
- 個人情報なし
- 参照画像1枚
- 5秒1本のみ
- 16:9
- 720p
- audio=true
- seed=42

## 未解決ゲート
- BytePlus LAS実アカウントでSeedance 2.5利用可能状態を確認
- `LAS_API_KEY`発行・Secret設定
- 権利確認済みReference PackのURLまたはasset ID準備
- dry-run
- 実生成1本
- 出力取得
- Identity QA
- 実課金照合

全ゲート通過まで正本Providerへ昇格しない。
