"""Package Phase 6 RC3 candidate locally (no deploy)."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc3"

FILES = [
    "ai_engine/app/catalogue_quality.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/main.py",
    "ai_engine/app/customer_respect.py",
    "backend/services/crmHandoffInboundPolicy.js",
    "backend/services/crmInboundTurnService.js",
    "ai_engine/tests/test_phase6_conversation_quality.py",
    "ai_engine/tests/test_customer_respect_sir_madam.py",
    "backend/tests/test_handoff_inbound_policy.js",
]
MIRRORS = {
    "backend/services/crmHandoffInboundPolicy.js": "worker/services/crmHandoffInboundPolicy.js",
    "backend/services/crmInboundTurnService.js": "worker/services/crmInboundTurnService.js",
}


def main() -> int:
    if RC.exists():
        shutil.rmtree(RC)
    RC.mkdir(parents=True)

    manifest_files: dict = {}
    sums: list[str] = []
    for rel in FILES:
        src = ROOT / rel
        dst = RC / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        data = src.read_bytes()
        dst.write_bytes(data)
        h = hashlib.sha256(data).hexdigest()
        deploy = not ("/tests/" in rel.replace("\\", "/"))
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
    errs: list[str] = []
    try:
        from app import catalogue_quality, booking_flow, pricing_resolver, customer_respect  # noqa: F401
        from app.catalogue_quality import resolve_haircut_styles  # noqa: F401
    except Exception as e:
        errs.append(str(e))

    manifest = {
        "rc_id": "phase6_t28_rc3",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase4c_t28_rc5 + silent-still hotfixes (local tree)",
        "phase4c_immutable": [
            "phase4c_t28_rc2",
            "phase4c_t28_rc3",
            "phase4c_t28_rc4",
            "phase4c_t28_rc5",
        ],
        "tenant": 28,
        "scope": "phase6_conversation_quality",
        "production_status": "NOT_DEPLOYED",
        "changed_files": [f for f, meta in manifest_files.items() if meta.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "notes": [
            "Hair Cut multi-style resolution (Layer missing / Butterfly id 278 Rs 4500)",
            "Facial near-duplicates kept distinct with display names + ids",
            "Verified branch formatting + maps; no invented hours",
            "Handoff wording = request (not false delivered claim)",
            "Multi-question structured answers",
            "DO NOT DEPLOY without separate approval",
        ],
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    (RC / "DEPLOY_ORDER.txt").write_text(
        "PHASE 6 RC3 CANDIDATE — conversation quality\n"
        "Parent: current local tree after phase4c_t28_rc5 + hotfixes\n"
        "Status: HOLD — do not deploy without explicit approval\n"
        "Immutable: do NOT overwrite phase4c_t28_rc2..rc5 folders\n\n"
        "Deploy order (when approved):\n"
        "1. ai_engine/app/catalogue_quality.py (CREATE)\n"
        "2. ai_engine/app/pricing_resolver.py\n"
        "3. ai_engine/app/booking_flow.py\n"
        "4. ai_engine/app/customer_respect.py\n"
        "5. ai_engine/app/main.py\n"
        "6. backend/services/crmHandoffInboundPolicy.js + worker mirror\n"
        "7. backend/services/crmInboundTurnService.js + worker mirror\n"
        "8. Restart ai_engine, ai_crm_worker, backend\n\n"
        "Do NOT send WhatsApp until separately approved.\n"
        "Do NOT mutate customer data.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": not errs, "rc": str(RC), "errors": errs, "files": len(manifest_files)}, indent=2))
    return 0 if not errs else 1


if __name__ == "__main__":
    raise SystemExit(main())
