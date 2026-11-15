"""Package Phase 6 RC9a — RC9 + audit hotfixes. LOCAL ONLY. Does not overwrite RC8/RC9."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
RC = ROOT / "_release" / "phase6_t28_rc9a"
RC8 = ROOT / "_release" / "phase6_t28_rc8"
RC9 = ROOT / "_release" / "phase6_t28_rc9"

FILES = [
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/conversation_truth.py",
    "ai_engine/app/response_quality.py",
    "ai_engine/app/booking_flow.py",
    "ai_engine/app/main.py",
    "backend/services/crmAiMemoryService.js",
    "backend/services/crmAiMemoryMerge.js",
    "ai_engine/tests/test_rc9_conversation_memory_replay.py",
    "ai_engine/tests/test_rc9_audit_memory_safety.py",
    "ai_engine/tests/test_rc9a_redis_loss_booking_recovery.py",
    "backend/services/__tests__/crmAiMemoryRc9.test.js",
    "backend/services/__tests__/crmAiMemoryRc9Audit.test.js",
]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def snapshot_hashes(folder: Path) -> dict[str, str]:
    out = {}
    if not folder.exists():
        return out
    man = folder / "MANIFEST.json"
    if man.exists():
        data = json.loads(man.read_text(encoding="utf-8"))
        for rel, meta in (data.get("files") or {}).items():
            if isinstance(meta, dict) and meta.get("sha256"):
                out[rel.replace("\\", "/")] = meta["sha256"]
    return out


def main() -> int:
    # Refuse to touch frozen parents
    for frozen in (RC8, RC9):
        if not frozen.exists():
            print(json.dumps({"ok": False, "missing_frozen": str(frozen)}))
            return 1

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

    # Compare vs frozen RC8 / RC9 (same relative paths only)
    rc8_h = snapshot_hashes(RC8)
    rc9_h = snapshot_hashes(RC9)
    vs_rc9 = {}
    vs_rc8 = {}
    for rel, meta in manifest_files.items():
        if rel in rc9_h:
            vs_rc9[rel] = {
                "unchanged": rc9_h[rel] == meta["sha256"],
                "rc9_sha16": rc9_h[rel][:16],
                "rc9a_sha16": meta["sha16"],
            }
        if rel in rc8_h:
            vs_rc8[rel] = {
                "unchanged": rc8_h[rel] == meta["sha256"],
                "rc8_sha16": rc8_h[rel][:16],
                "rc9a_sha16": meta["sha16"],
            }

    # Prove frozen snapshots were not mutated by packaging
    rc8_man_before = sha256_file(RC8 / "MANIFEST.json")
    rc9_man_before = sha256_file(RC9 / "MANIFEST.json")

    env = dict(**{k: v for k, v in __import__("os").environ.items()})
    env["GEMINI_BUDGET_FORCE_MEMORY"] = "1"
    py = subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "tests/test_rc9_conversation_memory_replay.py",
            "tests/test_rc9_audit_memory_safety.py",
            "tests/test_rc9a_redis_loss_booking_recovery.py",
            "tests/test_human_understanding_engine.py",
            "tests/test_response_quality_validator.py",
            "tests/test_rc7_conversation_truth_booking.py",
            "tests/test_rc8_cost_router_budget.py",
            "-q", "--tb=line",
        ],
        cwd=str(ROOT / "ai_engine"),
        capture_output=True,
        text=True,
        timeout=120,
        env=env,
    )
    node = subprocess.run(
        [
            "node", "--test",
            "backend/services/__tests__/crmAiMemoryRc9.test.js",
            "backend/services/__tests__/crmAiMemoryRc9Audit.test.js",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=60,
    )

    rc8_man_after = sha256_file(RC8 / "MANIFEST.json")
    rc9_man_after = sha256_file(RC9 / "MANIFEST.json")
    frozen_ok = rc8_man_before == rc8_man_after and rc9_man_before == rc9_man_after

    changed_vs_rc9 = [r for r, d in vs_rc9.items() if not d["unchanged"]]
    new_vs_rc9 = [r for r in manifest_files if r not in rc9_h]

    manifest = {
        "rc_id": "phase6_t28_rc9a",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase6_t28_rc9",
        "parent_immutable": True,
        "also_preserves": ["phase6_t28_rc8"],
        "tenant": 28,
        "scope": "rc9_plus_audit_hotfixes_redis_loss_recovery",
        "production_status": "NOT_DEPLOYED",
        "note_prod_reality": (
            "RC9a LOCAL ONLY. Includes RC9 answer/memory fixes plus audit hotfixes "
            "(stale service_id clear, Q&A dedupe, tenant patch guard) and Redis-loss "
            "recovery tests. Does NOT overwrite RC8/RC9. No deploy without approval."
        ),
        "audit_hotfixes": [
            "stale_service_id_cleared_on_correction",
            "qa_history_dedupe_no_echo",
            "assert_patch_tenant",
            "redis_loss_multiturn_booking_recovery_test",
        ],
        "changed_files": [f for f, m in manifest_files.items() if m.get("deploy")],
        "files": manifest_files,
        "compare_to_rc9": {
            "changed": changed_vs_rc9,
            "new_in_rc9a": new_vs_rc9,
            "details": vs_rc9,
        },
        "compare_to_rc8": {
            "overlapping_paths": list(vs_rc8.keys()),
            "details": vs_rc8,
        },
        "frozen_snapshots_untouched": {
            "ok": frozen_ok,
            "rc8_manifest_sha256": rc8_man_after,
            "rc9_manifest_sha256": rc9_man_after,
        },
        "pytest": {
            "ok": py.returncode == 0,
            "output": ((py.stdout or "") + (py.stderr or ""))[-3000:],
        },
        "node_test": {
            "ok": node.returncode == 0,
            "output": ((node.stdout or "") + (node.stderr or ""))[-2000:],
        },
    }
    (RC / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (RC / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")

    ok = py.returncode == 0 and node.returncode == 0 and frozen_ok
    print(json.dumps({
        "ok": ok,
        "rc": str(RC),
        "pytest_ok": py.returncode == 0,
        "node_ok": node.returncode == 0,
        "frozen_ok": frozen_ok,
        "changed_vs_rc9": changed_vs_rc9,
        "new_vs_rc9": new_vs_rc9,
        "production_status": "NOT_DEPLOYED",
    }, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
