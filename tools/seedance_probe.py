#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

MODEL = "dreamina-seedance-2-5-260628"
BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
ALLOWED_RIGHTS = {"self_owned", "licensed"}
ALLOWED_CONSENT = {"not_applicable", "obtained"}


def validate_reference_pack(pack):
    errors = []
    if pack.get("provider_export_allowed") is not True:
        errors.append("provider_export_allowed must be true")
    if pack.get("rights_status") not in ALLOWED_RIGHTS:
        errors.append("rights_status must be self_owned or licensed")
    if pack.get("consent_status") not in ALLOWED_CONSENT:
        errors.append("consent_status must be not_applicable or obtained")
    if pack.get("contains_personal_data") is not False:
        errors.append("contains_personal_data must be false")
    if pack.get("reference_audio") and pack.get("voice_rights_status") not in ALLOWED_RIGHTS:
        errors.append("voice_rights_status is not allowed")
    if pack.get("reference_images") and pack.get("portrait_rights_status") not in ALLOWED_RIGHTS:
        errors.append("portrait_rights_status is not allowed")
    return errors


def build_payload(pack, prompt, duration=5, ratio="16:9"):
    images = pack.get("reference_images") or []
    if not images:
        raise ValueError("reference_images requires at least one image URL")
    content = [{"type": "text", "text": prompt}]
    for url in images[:30]:
        content.append({"type": "image_url", "image_url": {"url": url}, "role": "reference_image"})
    return {
        "model": MODEL,
        "content": content,
        "ratio": ratio,
        "duration": duration,
        "watermark": False,
    }


def request_json(method, url, api_key, payload=None, timeout=60):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def submit(api_key, payload):
    return request_json("POST", BASE_URL, api_key, payload)


def get_task(api_key, task_id):
    return request_json("GET", f"{BASE_URL}/{task_id}", api_key)


def main():
    parser = argparse.ArgumentParser(description="SK LABS Seedance 2.5 probe")
    parser.add_argument("--reference-pack", required=True)
    parser.add_argument("--prompt", default="Natural five-second performance. Preserve identity, hairstyle and outfit from the reference image.")
    parser.add_argument("--execute", action="store_true", help="Actually call ModelArk. Default is dry-run.")
    parser.add_argument("--poll", action="store_true", help="Poll task until terminal status.")
    args = parser.parse_args()

    with open(args.reference_pack, "r", encoding="utf-8") as fh:
        pack = json.load(fh)

    errors = validate_reference_pack(pack)
    if errors:
        print(json.dumps({"ok": False, "gate_errors": errors}, ensure_ascii=False, indent=2))
        return 2

    payload = build_payload(pack, args.prompt)
    if not args.execute:
        print(json.dumps({"ok": True, "mode": "dry-run", "payload": payload}, ensure_ascii=False, indent=2))
        return 0

    api_key = os.environ.get("MODELARK_API_KEY")
    if not api_key:
        print("MODELARK_API_KEY is required for --execute", file=sys.stderr)
        return 3

    result = submit(api_key, payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not args.poll:
        return 0

    task_id = result.get("id") or result.get("task_id")
    if not task_id:
        print("No task id returned; cannot poll", file=sys.stderr)
        return 4

    terminal = {"succeeded", "failed", "cancelled", "expired"}
    while True:
        task = get_task(api_key, task_id)
        print(json.dumps(task, ensure_ascii=False, indent=2))
        status = task.get("status")
        if status in terminal:
            return 0 if status == "succeeded" else 5
        time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())
