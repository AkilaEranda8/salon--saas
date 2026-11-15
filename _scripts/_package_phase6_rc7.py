"""Package Phase 6 RC7 — Advanced Autonomous Intelligence. LOCAL ONLY. No deploy."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc7"

FILES = [
    "ai_engine/app/conversation_truth.py",
    "ai_engine/app/turn_planner.py",
    "ai_engine/app/turn_trace.py",
    "ai_engine/app/response_quality.py",
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/main.py",
    "ai_engine/app/pricing_resolver.py",
    "backend/services/crmHandoffInboundPolicy.js",
    "backend/services/crmAiMemoryService.js",
    "ai_engine/tests/test_rc7_autonomous_intelligence.py",
    "ai_engine/tests/test_rc7_conversation_truth_booking.py",
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
        if not src.exists():
            print(json.dumps({"ok": False, "missing": rel}))
            return 1
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
        from datetime import date
        from app.turn_planner import build_turn_plan
        from app.turn_trace import new_trace_id
        from app.response_quality import validate_customer_reply
        from app.conversation_intelligence import build_conversation_context
        from app.conversation_truth import parse_relative_date
        from app.booking_flow import _parse_date, _pick_by_index_or_name

        assert new_trace_id().startswith("t28-")
        now = date(2026, 11, 15)
        assert parse_relative_date("labana mase 1laweni sathiye", now=now)["date"] == "2026-12-05"
        assert _parse_date("labana mase 1laweni sathiye", now=now) == "2026-12-05"
        assert _pick_by_index_or_name("11 kiy nne me masene", [{"id": i} for i in range(1, 20)]) is None
        ctx = build_conversation_context(
            message="Butterfly kiyada? Branch eka koheda?",
            tenant_id=28,
            memory={"last_service": "haircut"},
        )
        plan = build_turn_plan(message="Butterfly kiyada? Branch eka koheda?", ctx=ctx)
        assert len(plan.steps) == 9
        bad = validate_customer_reply(
            "Butterfly kiyada? Branch eka koheda?",
            "Branch is in Kandy.",
            has_media=False,
        )
        assert bad.ok is False
    except Exception as e:
        errs.append(str(e))

    manifest = {
        "rc_id": "phase6_t28_rc7",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc6",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "conversation_truth_booking_consistency_plus_autonomous_intelligence",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "Preserve live RC4/RC6. RC7 LOCAL ONLY — conversation truth + relative dates + "
            "duration/service retention. No deploy / restart / WhatsApp / commit without approval."
        ),
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "database_changes": [],
        "notes": [
            "conversation_truth: structured booking fields + merge rules (NEW)",
            "Relative dates Asia/Colombo: labana mase 1laweni sathiye → first Sat next month",
            "Numeric short msgs: never map '11 kiy nne me masene' to catalogue index",
            "Service retention + recall; duration from catalogue before availability",
            "turn_planner / turn_trace / response_quality / CI retained from prior RC7 work",
            "DO NOT DEPLOY without separate approval",
        ],
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (RC / "DEPLOY_ORDER.txt").write_text(
        "PHASE 6 RC7 CANDIDATE — Advanced Autonomous Intelligence\n"
        "Parent: phase6_t28_rc6 (immutable)\n"
        "Status: HOLD — do not deploy without explicit approval\n\n"
        "Deploy order (when approved):\n"
        "1. ai_engine/app/turn_trace.py (NEW)\n"
        "2. ai_engine/app/turn_planner.py (NEW)\n"
        "3. ai_engine/app/response_quality.py\n"
        "4. ai_engine/app/conversation_intelligence.py\n"
        "5. ai_engine/app/booking_flow.py\n"
        "6. ai_engine/app/main.py\n"
        "7. ai_engine/app/pricing_resolver.py\n"
        "8. backend/services/crmAiMemoryService.js\n"
        "9. backend + worker crmHandoffInboundPolicy.js\n"
        "10. Restart ai_engine, ai_crm_worker, backend\n\n"
        "Rollback: restore prior docker snapshot under /root/xanesalon/_rollback/\n"
        "Do NOT send WhatsApp until separately approved.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errs, "rc": str(RC), "errors": errs}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    raise SystemExit(main())
