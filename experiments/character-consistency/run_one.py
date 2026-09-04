#!/usr/bin/env python3
"""Submit exactly one import-ready ComfyUI API workflow and record generation time."""
from __future__ import annotations
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
WORKFLOW = BASE / "workflow_one_api.json"
RESULTS = BASE / "results"
SERVER = "http://127.0.0.1:8188"

def request_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def main() -> None:
    if not WORKFLOW.exists():
        raise SystemExit("workflow_one_api.json 未確定。ComfyUIで実ノード確認後、API formatで保存してください。")
    workflow = json.loads(WORKFLOW.read_text(encoding="utf-8"))
    request_json(f"{SERVER}/system_stats")
    start_wall = datetime.now(timezone.utc).isoformat()
    start = time.perf_counter()
    queued = request_json(f"{SERVER}/prompt", {"prompt": workflow})
    prompt_id = queued["prompt_id"]
    while True:
        history = request_json(f"{SERVER}/history/{prompt_id}")
        if prompt_id in history:
            break
        time.sleep(1)
    seconds = time.perf_counter() - start
    record = {
        "prompt_id": prompt_id,
        "started_at_utc": start_wall,
        "generation_time_seconds": round(seconds, 3),
        "history": history[prompt_id],
    }
    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"one-shot-{prompt_id}.json"
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"ONE_SHOT_OK prompt_id={prompt_id} generation_time_seconds={seconds:.3f}")
    print(out)

if __name__ == "__main__":
    main()
