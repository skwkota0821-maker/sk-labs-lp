#!/usr/bin/env python3
"""SK LABS Character Consistency Lab v1.1 - Kaggle/Colab bootstrap."""
from __future__ import annotations
import shutil
import subprocess
from pathlib import Path

ROOT = Path.cwd()
COMFY = ROOT / "ComfyUI"
CUSTOM = COMFY / "custom_nodes"
REPOS = [
    ("https://github.com/comfyanonymous/ComfyUI.git", COMFY),
    ("https://github.com/ltdrdata/ComfyUI-Manager.git", CUSTOM / "ComfyUI-Manager"),
    ("https://github.com/cubiq/ComfyUI_IPAdapter_plus.git", CUSTOM / "ComfyUI_IPAdapter_plus"),
    ("https://github.com/ltdrdata/ComfyUI-Impact-Pack.git", CUSTOM / "ComfyUI-Impact-Pack"),
]

def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, check=True)

def clone(url: str, target: Path) -> None:
    if target.exists():
        print(f"SKIP existing: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    run("git", "clone", "--depth", "1", url, str(target))

def main() -> None:
    if shutil.which("nvidia-smi") is None:
        raise SystemExit("GPU未認識: KaggleのAcceleratorをGPUに設定してください。")
    run("nvidia-smi")
    for url, target in REPOS:
        clone(url, target)
    run("python", "-m", "pip", "install", "-r", str(COMFY / "requirements.txt"))
    for _, target in REPOS[1:]:
        req = target / "requirements.txt"
        if req.exists():
            run("python", "-m", "pip", "install", "-r", str(req))
    print("BOOTSTRAP_OK")
    print("次: Checkpoint / LoRA / IPAdapterモデル配置 -> ComfyUI起動 -> 1枚生成ゲート")

if __name__ == "__main__":
    main()
