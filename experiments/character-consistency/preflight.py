#!/usr/bin/env python3
"""Fail-fast gate for Character Consistency Lab one-shot generation."""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path.cwd()
COMFY = ROOT / "ComfyUI"
BASE = Path(__file__).resolve().parent
MANIFEST = BASE / "model_manifest.json"

LOCATIONS = {
    "checkpoint": COMFY / "models" / "checkpoints",
    "character_lora": COMFY / "models" / "loras",
    "ipadapter": COMFY / "models" / "ipadapter",
    "master_image": COMFY / "input",
}
CUSTOM_NODES = [
    COMFY / "custom_nodes" / "ComfyUI_IPAdapter_plus",
    COMFY / "custom_nodes" / "ComfyUI-Impact-Pack",
]

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    raise SystemExit(2)

def main() -> None:
    if not MANIFEST.exists():
        fail("model_manifest.json がありません。exampleをコピーし実ファイル名/sha256を設定してください。")
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not (COMFY / "main.py").exists():
        fail("ComfyUI未配置。先に kaggle_bootstrap.py を実行してください。")
    for node in CUSTOM_NODES:
        if not node.exists():
            fail(f"Custom Node未配置: {node.name}")
    for key, folder in LOCATIONS.items():
        item = data[key]
        filename = item.get("filename", "")
        expected = item.get("sha256", "").lower()
        if not filename or filename.startswith("REPLACE_"):
            fail(f"{key} の実ファイル名が未確定")
        path = folder / filename
        if not path.is_file():
            fail(f"{key} が見つかりません: {path}")
        if not expected or expected.startswith("replace_"):
            fail(f"{key} のsha256が未確定")
        actual = sha256(path)
        if actual != expected:
            fail(f"{key} sha256不一致: expected={expected} actual={actual}")
        print(f"OK: {key}: {filename}")
    print("PREFLIGHT_OK")

if __name__ == "__main__":
    main()
