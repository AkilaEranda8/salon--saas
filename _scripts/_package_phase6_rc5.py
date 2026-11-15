"""Package Phase 6 RC5 — Gemini full human-understanding engine. LOCAL ONLY — no deploy."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc5"

FILES = [
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/main.py",
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/booking_flow.py",
    "backend/services/crmHandoffInboundPolicy.js",
    "ai_engine/tests/test_human_understanding_engine.py",
    "ai_engine/tests/test_slot_duration_display.py",
    "ai_engine/tests/test_heya_booking_no_fake_confirm.py",
    "ai_engine/tests/test_ude_time_booking_step.py",
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
        from app.conversation_intelligence import (  # noqa: F401
            classify_intent,
            is_referent_message,
            resolve_referent_topic,
        )
        assert is_referent_message("Eka keeyada?")
        assert resolve_referent_topic("Eka keeyada?", memory={"last_service": "keratin"}) == "keratin"
        c = classify_intent("Ane mata eka baya", memory={"last_service": "keratin"}, prior_topic="keratin")
        assert c["intent"] == "customer_concern"
    except Exception as e:
        errs.append(str(e))

    manifest = {
        "rc_id": "phase6_t28_rc5",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc4",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "gemini_full_human_understanding_engine",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "Brief said prod=RC3; as of package time live T28 already runs phase6_t28_rc4. "
            "This RC5 is a NEW local candidate only — do not deploy without explicit approval."
        ),
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "notes": [
            "Referent resolution: eka / kalina eka / ehema → prior topic",
            "Emotion: fear / hesitation / appreciation + empathise decision",
            "Concern / alternative / advice intents with memory",
            "Gemini prompt: human understanding engine + pronoun rules",
            "Pricing cue: keeyada; booking/price authority unchanged",
            "DO NOT DEPLOY / restart / WhatsApp without separate approval",
        ],
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (RC / "DEPLOY_ORDER.txt").write_text(
        "PHASE 6 RC5 CANDIDATE — Gemini full human-understanding engine\n"
        "Parent: phase6_t28_rc4 (leave prod untouched until approval)\n"
        "Status: HOLD — do not deploy without explicit approval\n\n"
        "Deploy order (when approved):\n"
        "1. ai_engine/app/conversation_intelligence.py\n"
        "2. ai_engine/app/main.py\n"
        "3. ai_engine/app/pricing_resolver.py\n"
        "4. ai_engine/app/booking_flow.py\n"
        "5. backend/services/crmHandoffInboundPolicy.js + worker mirror\n"
        "6. Restart ai_engine, ai_crm_worker, backend\n\n"
        "Do NOT send WhatsApp until separately approved.\n"
        "Do NOT overwrite phase6_t28_rc3 / phase6_t28_rc4 folders.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errs, "rc": str(RC), "errors": errs}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    raise SystemExit(main())
