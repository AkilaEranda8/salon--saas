"""Package Phase 6 RC9 — Direct answer + persistent conversation memory. LOCAL ONLY."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc9"

FILES = [
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/conversation_truth.py",
    "ai_engine/app/response_quality.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/main.py",
    "backend/services/crmAiMemoryService.js",
    "ai_engine/tests/test_rc9_conversation_memory_replay.py",
    "backend/services/__tests__/crmAiMemoryRc9.test.js",
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
        deploy = "/tests/" not in rel.replace("\\", "/") and "/__tests__/" not in rel.replace("\\", "/")
        manifest_files[rel] = {
            "sha256": h,
            "sha16": h[:16],
            "bytes": len(data),
            "deploy": deploy,
            "note": None if deploy else "audit only",
        }
        sums.append(f"{h}  {rel}")

    env = dict(**{k: v for k, v in __import__("os").environ.items()})
    p = subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "tests/test_rc9_conversation_memory_replay.py",
            "tests/test_human_understanding_engine.py",
            "tests/test_response_quality_validator.py",
            "-q", "--tb=line",
        ],
        cwd=str(ROOT / "ai_engine"),
        capture_output=True,
        text=True,
        timeout=90,
        env=env,
    )
    pytest_ok = p.returncode == 0
    pytest_out = ((p.stdout or "") + (p.stderr or ""))[-2500:]

    node = subprocess.run(
        [sys.executable and "node", "--test", "backend/services/__tests__/crmAiMemoryRc9.test.js"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )
    node_ok = node.returncode == 0

    manifest = {
        "rc_id": "phase6_t28_rc9",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc8",
        "parent_immutable": True,
        "tenant": 28,
        "scope": "direct_answer_accuracy_persistent_conversation_memory",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "Preserve live production. RC9 LOCAL ONLY — answer accuracy + CRM memory "
            "round-trip. No deploy / restart / WhatsApp / commit without approval."
        ),
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "pytest": {"ok": pytest_ok, "output": pytest_out},
        "node_test": {"ok": node_ok, "output": ((node.stdout or "") + (node.stderr or ""))[-1500:]},
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": pytest_ok and node_ok,
        "rc": str(RC),
        "pytest_ok": pytest_ok,
        "node_ok": node_ok,
        "production_status": "NOT_DEPLOYED",
    }, indent=2))
    return 0 if pytest_ok and node_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
