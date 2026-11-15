"""
RC9a staging evaluation harness — evidence-card logger.

Preparation / dry-run safe:
  - Default RC9A_HARNESS_DRY_RUN=1 → writes schema sample only, NO Gemini, NO HTTP turns.
  - Live mode requires explicit --live AND RC9A_HARNESS_DRY_RUN=0 AND staging URL.

Never logs API keys. Truncates customer text. Does not send WhatsApp.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
DEFAULT_OUT = ROOT / "docs" / "eval_runs" / "rc9a_staging"


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha16(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def _scrub(text: str, limit: int = 240) -> str:
    t = str(text or "")
    t = re.sub(r"(?i)(api[_-]?key|bearer|sk-|AIza)[^\s\"']+", "[REDACTED]", t)
    return t[:limit]


def evidence_card(
    *,
    case_id: str,
    turn: int,
    lang: str,
    customer_message: str,
    model_id: str | None = None,
    model_reply: str | None = None,
    actions: list | None = None,
    backend_truth: dict | None = None,
    validator: dict | None = None,
    passed: bool | None = None,
    critical_failure: str | None = None,
    notes: str = "",
) -> dict:
    return {
        "schema": "rc9a_turn_evidence_v1",
        "recorded_utc": _utc(),
        "case_id": case_id,
        "turn": turn,
        "lang": lang,
        "customer_message": _scrub(customer_message, 180),
        "prompt_system_excerpt_sha": None,
        "model_id": model_id,
        "model_reply": _scrub(model_reply or "", 400) if model_reply else None,
        "actions": actions or [],
        "backend_truth": backend_truth or {},
        "validator": validator or {},
        "pass": passed,
        "critical_failure": critical_failure,
        "notes": notes,
        "message_sha16": _sha16(customer_message),
    }


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def init_run_dir(base: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run = base / f"prep_{stamp}"
    run.mkdir(parents=True, exist_ok=True)
    (run / "turns.jsonl").write_text("", encoding="utf-8")
    (run / "README.md").write_text(
        "\n".join(
            [
                "# RC9a staging evidence run",
                "",
                f"Created UTC: {_utc()}",
                "Mode: preparation / dry-run sample unless --live was authorized.",
                "Do not place API keys or production customer data in this folder.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return run


def dry_run_sample(run: Path) -> None:
    """Write placeholder cards proving harness wiring — no network."""
    samples = [
        evidence_card(
            case_id="PREP-SCHEMA-01",
            turn=1,
            lang="singlish",
            customer_message="Keratin eka keeyada?",
            model_id=None,
            model_reply=None,
            actions=[],
            backend_truth={"note": "dry_run_no_backend_call"},
            validator={},
            passed=None,
            notes="Schema sample only — evaluation not started",
        ),
        evidence_card(
            case_id="PREP-SCHEMA-02",
            turn=1,
            lang="english",
            customer_message="How much is a butterfly cut?",
            notes="Schema sample only — evaluation not started",
        ),
    ]
    write_jsonl(run / "turns.jsonl", samples)
    summary = {
        "ok": True,
        "mode": "dry_run_preparation",
        "cards_written": len(samples),
        "evaluation_started": False,
        "gemini_calls": 0,
        "whatsapp_messages": 0,
        "created_utc": _utc(),
    }
    (run / "SUMMARY.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="RC9a staging evidence harness")
    ap.add_argument("--live", action="store_true", help="Forbidden unless staging approved + DRY_RUN=0")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    dry = (os.environ.get("RC9A_HARNESS_DRY_RUN") or "1").strip() not in ("0", "false", "no")
    if args.live and dry:
        print(json.dumps({
            "ok": False,
            "error": "Refusing --live while RC9A_HARNESS_DRY_RUN!=0 (preparation mode)",
        }))
        return 2
    if args.live:
        print(json.dumps({
            "ok": False,
            "error": "Live evaluation not authorized in this preparation step. STOP.",
        }))
        return 3

    run = init_run_dir(Path(args.out))
    dry_run_sample(run)
    print(json.dumps({
        "ok": True,
        "mode": "preparation_dry_run",
        "run_dir": str(run),
        "evaluation_started": False,
        "gemini_calls": 0,
        "whatsapp_messages": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
