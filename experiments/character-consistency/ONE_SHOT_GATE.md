# Character Consistency Lab v1.1 — Kaggle 1枚生成ゲート

## スコープ
この手順は Issue #17 の A/B-1 前ゲート専用。1枚生成、QA、Generation Time取得まで。A/B-1の200生成、有料GPU、main統合は実施しない。

## 現在必要な実体
1. Checkpoint 1個
2. Character LoRA 1個
3. IPAdapter model 1個
4. Master Image 1枚

大容量バイナリはGitHubへコミットしない。`model_manifest.json` に filename / sha256 を記録する。

## Kaggle最小実行順
```bash
git clone -b feat/character-consistency-free-gpu https://github.com/skwkota0821-maker/sk-labs-lp.git
cd sk-labs-lp
python experiments/character-consistency/kaggle_bootstrap.py
```

モデルを次へ配置する。
- Checkpoint: `ComfyUI/models/checkpoints/`
- Character LoRA: `ComfyUI/models/loras/`
- IPAdapter: `ComfyUI/models/ipadapter/`
- Master Image: `ComfyUI/input/`

```bash
cp experiments/character-consistency/model_manifest.example.json experiments/character-consistency/model_manifest.json
# 実ファイル名と sha256 を記入
python experiments/character-consistency/preflight.py
```

`PREFLIGHT_OK` 後のみComfyUIを起動する。

```bash
cd ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

ComfyUIで以下の実ノード・実ファイル名を確認する。
- Load Checkpoint
- Character LoRA
- IPAdapter Plus
- Impact Pack / FaceDetailer
- Master Image

正本仕様の開始値を使用する。
- LoRA: 0.8
- IPAdapter Weight: 0.8
- FaceDetailer: Denoise 0.2 / CFG 5 / Steps 15

1枚だけ通るWorkflowを **API format** で `workflow_one_api.json` として保存する。新機能・新KPI・A/B条件変更は禁止。

別セル/terminalから:
```bash
python experiments/character-consistency/run_one.py
```

## 合格条件
- ComfyUI起動成功
- 必須Custom Node認識
- Checkpoint認識
- Character LoRA認識
- IPAdapter認識
- FaceDetailer / Impact Pack認識
- Workflow API実行成功
- 画像1枚生成成功
- `results/one-shot-*.json` に Generation Time 記録
- 目視QAを実施し、本人一致度 / キャラクター一貫率 / 初回合格 / 修復回数 / 重大失敗 / 失敗タグを記録可能な状態

## 停止条件
上記のどれかが失敗したらA/B-1へ進まない。モデル名・hash・ノード名を推測で補完しない。有料GPUへ切り替えない。
