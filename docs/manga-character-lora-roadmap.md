# SK LABS マンガ Character LoRA ロードマップ

## 目的

Creator Studio の Character ID を、単なる参照画像ではなく再利用可能なキャラクター資産へ拡張する。

最優先KPIは「同一キャラクター維持率」。LoRA 単体の品質ではなく、Master Character + Character DNA + LoRA + QA + Auto Repair の総合パイプラインで評価する。

## 導入条件

現行 v3 系の実測で次のいずれかを満たした場合に LoRA を導入する。

- 4〜8コマ連続生成で Identity Score 95 未満が頻発する
- 自動再生成が平均 1 回を超える
- Character Drift が継続上昇する
- 参照画像方式だけでは顔・髪・年齢・体格の固定率が商品基準に届かない

## Dataset Gate

枚数より品質を優先する。

- 最低: 15〜20枚
- 推奨: 20〜40枚
- 商用品質候補: 40〜80枚

### 必須バリエーション

- 正面
- 左右斜め
- 横顔
- 上半身
- 全身
- 立ち / 座り
- 真顔 / 笑顔 / 怒りなど

### 除外

- 別人に見える画像
- 年齢感が違う画像
- 顔が隠れている画像
- 低解像度
- 手足や顔の破綻
- 強いフィルター
- 複数人物が主役として写る画像

### 衣装

キャラと衣装の過剰結合を避ける。複数衣装を含めるか、衣装タグを明示して分離する。

## Character ID

全キャプションに同一の固有トリガーを入れる。

例: `rei001`

内部データモデル:

```json
{
  "character_id": "rei001",
  "master_images": [],
  "character_dna": {},
  "lora_model": null,
  "face_embedding": null,
  "speech_dna": {},
  "aura_dna": {},
  "behavior_dna": {},
  "qa_history": []
}
```

## Training Policy

固定 epoch を製品仕様にはしない。画像枚数、repeats、batch size、総 step 数を見て調整する。

初期探索値:

- rank: 32
- alpha: 16〜32
- learning rate: 1e-4 前後を初期候補
- epoch: 10〜15から開始

必ず checkpoint ごとに評価し、過学習と学習不足を判定する。

## 失敗判定

### Overfitting

- 元画像の構図に引っ張られすぎる
- ポーズ変更ができない
- 衣装が固定されすぎる

対策: epoch / step を減らす、Dataset を増やす・多様化する。

### Underfitting

- 顔が似ない
- 特徴が消える
- Character ID の効果が弱い

対策: step を増やし、Dataset 品質を再点検する。

### Dataset Contamination

- 顔や髪型が毎回違う
- 年齢感が揺れる

対策: QA で不良画像を学習前に除外する。

## 推奨構成

学習と推論は分ける。

- 学習: Kohya_ss / AI-Toolkit 等を候補
- 推論・ワークフロー: ComfyUI
- 本番アプリ: Character ID → LoRA 選択 → 生成 → QA → Auto Repair

ComfyUI 自体を LoRA 学習の唯一の中核とせず、ワークフロー / 推論オーケストレーションの役割として扱う。

## QA Integration

LoRA導入後も QA は必須。

- Face Similarity
- Hair Similarity
- Body Similarity
- Age Similarity
- Costume Consistency
- Soul / Aura / Speech Drift

LoRA を「合格保証」ではなく「初回生成の成功率を上げる層」と位置付ける。

## Milestones

1. 現行 v3 系で4〜8コマ実測
2. Dataset Gate を通る Master 画像群を自動生成・選別
3. Character LoRA PoC
4. LoRA有無の A/B 比較
5. Identity Score 95+ の安定率を計測
6. Face Embedding 追加
7. QA + Auto Repair 統合
8. Speech / Aura / Behavior DNA 追加
9. Character ID 資産として再利用可能にする

## Success Criteria

- 連続8コマで別人化 0
- 平均 Identity Score 95+
- Hard Fail 0
- 平均 Repair 回数 1 以下
- キャラ変更なしでシーン・ポーズ・背景を自由に変えられる
- 同じ Character ID を別作品でも再利用できる
