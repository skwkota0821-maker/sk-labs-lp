#!/usr/bin/env python3
"""Record manual QA for exactly one Character Consistency Lab generation."""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
RESULTS = BASE / "results"
ALLOWED_TAGS = {"eye_shape", "hair_volume", "age_younger", "jawline", "body", "aura", "other"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--prompt-id", required=True)
    p.add_argument("--character-id", required=True)
    p.add_argument("--identity-score", type=float, required=True)
    p.add_argument("--consistency-rate", type=float, required=True)
    p.add_argument("--first-pass", choices=["yes", "no"], required=True)
    p.add_argument("--repair-count", type=int, default=0)
    p.add_argument("--hard-fail", choices=["yes", "no"], required=True)
    p.add_argument("--failure-tags", default="")
    p.add_argument("--notes", default="")
    return p.parse_args()


def main() -> None:
    a = parse_args()
    if not 0 <= a.identity_score <= 100:
        raise SystemExit("identity-score must be 0..100")
    if not 0 <= a.consistency_rate <= 100:
        raise SystemExit("consistency-rate must be 0..100")
    tags = [x.strip() for x in a.failure_tags.split(",") if x.strip()]
    unknown = sorted(set(tags) - ALLOWED_TAGS)
    if unknown:
        raise SystemExit(f"unknown failure tags: {unknown}")
    run_log = RESULTS / f"one-shot-{a.prompt_id}.json"
    if not run_log.exists():
        raise SystemExit(f"generation log not found: {run_log}")
    generation = json.loads(run_log.read_text(encoding="utf-8"))
    qa = {
        "prompt_id": a.prompt_id,
        "character_id": a.character_id,
        "workflow_version": "v1.1-one-shot",
        "identity_score": a.identity_score,
        "character_consistency_rate": a.consistency_rate,
        "first_pass": a.first_pass == "yes",
        "repair_count": a.repair_count,
        "hard_fail": a.hard_fail == "yes",
        "generation_time_seconds": generation["generation_time_seconds"],
        "failure_tags": tags,
        "notes": a.notes,
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    out = RESULTS / f"qa-one-shot-{a.prompt_id}.json"
    out.write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"QA_RECORDED {out}")


if __name__ == "__main__":
    main()
