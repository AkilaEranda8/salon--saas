"""Package Phase 6 RC6 — Advanced Intelligent Receptionist Engine. LOCAL ONLY."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc6"

FILES = [
    "ai_engine/app/response_quality.py",
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/main.py",
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/booking_flow.py",
    "backend/services/crmHandoffInboundPolicy.js",
    "ai_engine/tests/test_response_quality_validator.py",
    "ai_engine/tests/test_human_understanding_engine.py",
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
        from app.response_quality import validate_customer_reply, decompose_customer_asks
        u = decompose_customer_asks(
            "Butterfly kiyada? Layer thiyenawada? Kandy branch eka koheda?"
        )
        assert len(u) >= 2
        bad = validate_customer_reply(
            "Butterfly kiyada? Kandy branch eka koheda?",
            "Branch is in Kandy.",
        )
        assert bad.ok is False
    except Exception as e:
        errs.append(str(e))

    manifest = {
        "rc_id": "phase6_t28_rc6",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc5",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "advanced_intelligent_receptionist_engine",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "Brief said prod=RC3; live T28 runs phase6_t28_rc4. "
            "RC5/RC6 are local candidates only until explicit deploy approval."
        ),
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "database_changes": [],
        "notes": [
            "response_quality: multi-intent decompose + pre-send completeness validator",
            "Bounded Gemini repair when secondary questions dropped",
            "Memory correction replaces conflicting last_service",
            "NLU: eka hodada / cheaper alternative / ehema nam epa",
            "Pricing/booking authority unchanged",
            "DO NOT DEPLOY without separate approval",
        ],
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (RC / "DEPLOY_ORDER.txt").write_text(
        "PHASE 6 RC6 CANDIDATE — Advanced Intelligent Receptionist Engine\n"
        "Parent: phase6_t28_rc5\n"
        "Status: HOLD — do not deploy without explicit approval\n\n"
        "Deploy order (when approved):\n"
        "1. ai_engine/app/response_quality.py (NEW)\n"
        "2. ai_engine/app/conversation_intelligence.py\n"
        "3. ai_engine/app/main.py\n"
        "4. ai_engine/app/pricing_resolver.py\n"
        "5. ai_engine/app/booking_flow.py\n"
        "6. backend + worker crmHandoffInboundPolicy.js\n"
        "7. Restart ai_engine, ai_crm_worker, backend\n\n"
        "Rollback: restore prior docker snapshot under /root/xanesalon/_rollback/\n"
        "Do NOT send WhatsApp until separately approved.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errs, "rc": str(RC), "errors": errs}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    raise SystemExit(main())
