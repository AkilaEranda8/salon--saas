"""Package Phase 6 RC4 candidate (multi-question completeness) — no deploy."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc4"

FILES = [
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/main.py",
    "ai_engine/app/booking_flow.py",
    "backend/services/crmHandoffInboundPolicy.js",
    "ai_engine/tests/test_multi_question_price_completeness.py",
    "ai_engine/tests/test_price_rejection_and_correction.py",
    "ai_engine/tests/test_heya_booking_no_fake_confirm.py",
    "ai_engine/tests/test_ude_time_booking_step.py",
    "ai_engine/tests/test_slot_duration_display.py",
    "backend/tests/test_handoff_inbound_policy.js",
]
MIRRORS = {
    "backend/services/crmHandoffInboundPolicy.js": "worker/services/crmHandoffInboundPolicy.js",
}


def main() -> int:
    if RC.exists():
        shutil.rmtree(RC)
    RC.mkdir(parents=True)
    manifest_files = {}
    sums = []
    for rel in FILES:
        src = ROOT / rel
        dst = RC / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        data = src.read_bytes()
        dst.write_bytes(data)
        h = hashlib.sha256(data).hexdigest()
        deploy = "/tests/" not in rel.replace("\\", "/")
        manifest_files[rel] = {
            "sha256": h,
            "sha16": h[:16],
            "bytes": len(data),
            "deploy": deploy,
            "note": None if deploy else "audit only",
        }
        sums.append(f"{h}  {rel}")
        if rel in MIRRORS:
            mrel = MIRRORS[rel]
            mdst = RC / mrel
            mdst.parent.mkdir(parents=True, exist_ok=True)
            mdst.write_bytes(data)
            manifest_files[mrel] = {
                "sha256": h,
                "sha16": h[:16],
                "bytes": len(data),
                "deploy": True,
                "mirrored_from": rel,
            }
            sums.append(f"{h}  {mrel}")

    sys.path.insert(0, str(ROOT / "ai_engine"))
    errs = []
    try:
        from app.pricing_resolver import resolve_price, resolve_multi_price_ask, is_price_rejection  # noqa: F401
        assert is_price_rejection("mama keewe time aka price aka newei")
    except Exception as e:
        errs.append(str(e))

    manifest = {
        "rc_id": "phase6_t28_rc4",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc3",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "multi_question_completeness_plus_price_rejection_plus_heya_fake_confirm_hotfix",
        "production_status": "NOT_DEPLOYED",
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "notes": [
            "Multi-question: resolve_multi_price_ask assembles all verified parts",
            "Screenshot bug: 'price aka newei' no longer hard-gates into which-service-price",
            "Queued: Check history + booking asks AI-assist (not soft-bump only)",
            "Heya/8.30an typos + Ok/Book resume; hard-block Gemini fake lock-in",
            "DO NOT DEPLOY without separate approval; do not overwrite phase6_t28_rc3",
        ],
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (RC / "DEPLOY_ORDER.txt").write_text(
        "PHASE 6 RC4 CANDIDATE — multi-question + price-rejection intent\n"
        "Parent: phase6_t28_rc3 (immutable on prod until this replaces it)\n"
        "Status: HOLD — do not deploy without explicit approval\n\n"
        "Deploy order (when approved):\n"
        "1. ai_engine/app/pricing_resolver.py\n"
        "2. ai_engine/app/booking_flow.py\n"
        "3. ai_engine/app/main.py\n"
        "4. backend/services/crmHandoffInboundPolicy.js + worker mirror\n"
        "5. Restart ai_engine, ai_crm_worker, backend\n\n"
        "Do NOT send WhatsApp until separately approved.\n"
        "Do NOT overwrite phase6_t28_rc3 / phase4c folders.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errs, "rc": str(RC), "errors": errs}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    raise SystemExit(main())
