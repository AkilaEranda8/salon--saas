"""Package Phase 6 RC8 — Gemini $20 cost control + smart router. LOCAL ONLY. No deploy."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc8"

FILES = [
    "ai_engine/app/cost_router.py",
    "ai_engine/app/budget_ledger.py",
    "ai_engine/app/main.py",
    "backend/services/geminiBudgetReport.js",
    "backend/services/aiUsageCost.js",
    "backend/services/ensureAiCrmSchema.js",
    "backend/controllers/crmAnalyticsController.js",
    "backend/routes/crm.js",
    "frontend/src/pages/crm/CrmAiCostPage.jsx",
    "ai_engine/tests/test_rc8_cost_router_budget.py",
]


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

    sys.path.insert(0, str(ROOT / "ai_engine"))
    errs = []
    try:
        import os

        os.environ["GEMINI_BUDGET_FORCE_MEMORY"] = "1"
        os.environ["GEMINI_MONTHLY_HARD_CAP"] = "0.05"
        from app.cost_router import (
            MODEL_ARGON,
            MODEL_FLASH,
            MODEL_FLASH_LITE,
            MODEL_HYDROGEN,
            MONTHLY_HARD_CAP,
            MONTHLY_PLANNED,
            estimate_cost_usd,
            select_model,
        )
        from app.budget_ledger import budget_exhausted_safe_reply, reserve

        assert MONTHLY_HARD_CAP == 20.0 and MONTHLY_PLANNED == 16.0
        d = select_model("hi")
        assert d.model == MODEL_FLASH_LITE and d.model != MODEL_ARGON
        d2 = select_model(
            "compare keratin vs botox recommend",
            ask_units=3,
            emotion="fear",
            monthly_spent=MONTHLY_PLANNED,
        )
        assert d2.model == MODEL_FLASH
        assert abs(estimate_cost_usd(MODEL_HYDROGEN, completion_tokens=1_000_000) - 7.5) < 1e-6
        r = reserve(28088, 0.02)
        assert r.ok is True
        msg = budget_exhausted_safe_reply("singlish")
        assert "auto-confirm karanne naha" in msg
    except Exception as e:
        errs.append(str(e))

    pytest_ok = False
    pytest_out = ""
    try:
        env = dict(**{k: v for k, v in __import__("os").environ.items()})
        env["GEMINI_BUDGET_FORCE_MEMORY"] = "1"
        p = subprocess.run(
            [sys.executable, "-m", "pytest", "tests/test_rc8_cost_router_budget.py", "-q", "--tb=line"],
            cwd=str(ROOT / "ai_engine"),
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )
        pytest_ok = p.returncode == 0
        pytest_out = (p.stdout or "") + (p.stderr or "")
    except Exception as e:
        pytest_out = str(e)

    manifest = {
        "rc_id": "phase6_t28_rc8",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc7",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "gemini_20_usd_monthly_cost_control_smart_model_router",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "Preserve live RC7 production model config. RC8 LOCAL ONLY — cost router + "
            "atomic budget ledger + dashboard. No deploy / restart / WhatsApp / commit "
            "without separate approval. GEMINI_COST_ROUTER defaults on in code but prod "
            "unchanged until this package is deployed."
        ),
        "policy": {
            "monthly_hard_cap_usd": 20,
            "monthly_planned_usd": 16,
            "safety_reserve_usd": 4,
            "target_avg_conversation_usd": 0.016,
            "warn_conversation_usd": 0.02,
            "hard_conversation_cap_usd": 0.03,
            "daily_planned_usd": 0.53,
            "models": {
                "simple": "gemini-3.1-flash-lite",
                "normal": "gemini-3.8-flash",
                "complex": "gemini-4-hydrogen",
                "blocked": "gemini-4-argon",
            },
            "pricing_source": "https://ai.google.dev/gemini-api/docs/pricing (2026-11-15)",
        },
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "import_smoke": {"ok": not errs, "errors": errs},
        "pytest": {"ok": pytest_ok, "output": pytest_out[-2000:]},
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": not errs and pytest_ok,
        "rc": str(RC),
        "files": len(manifest_files),
        "import_smoke_ok": not errs,
        "pytest_ok": pytest_ok,
        "production_status": "NOT_DEPLOYED",
    }, indent=2))
    return 0 if not errs and pytest_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
