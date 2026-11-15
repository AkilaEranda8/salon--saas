"""Build phase4c_t28_rc2 from workspace (RC1 left untouched)."""
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
RC1 = ROOT / "_release" / "phase4c_t28_rc1"
RC2 = ROOT / "_release" / "phase4c_t28_rc2"

FILES = [
    "ai_engine/app/main.py",
    "ai_engine/app/pricing_resolver.py",
    "ai_engine/app/conversation_intelligence.py",
    "ai_engine/app/booking_flow.py",
    "backend/services/crmInboundTurnService.js",
    "backend/services/crmAiMemoryService.js",
]


def sha256(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    if not RC1.exists():
        raise SystemExit("RC1 missing — abort")
    if RC2.exists():
        shutil.rmtree(RC2)
    RC2.mkdir(parents=True)

    manifest_files: dict[str, dict] = {}
    changed_from_rc1: list[str] = []

    for rel in FILES:
        src = ROOT / rel
        if not src.exists():
            raise SystemExit(f"Missing workspace file: {rel}")
        dest = RC2 / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        h = sha256(dest)
        rc1p = RC1 / rel
        rc1_h = sha256(rc1p) if rc1p.exists() else None
        if rc1_h != h:
            changed_from_rc1.append(rel)
        manifest_files[rel] = {
            "sha256": h,
            "sha16": h[:16],
            "bytes": dest.stat().st_size,
            "changed_from_rc1": rc1_h != h,
            "rc1_sha16": (rc1_h[:16] if rc1_h else None),
        }

    # Worker copies mirror backend (same as RC1 packaging)
    for name in ("crmInboundTurnService.js", "crmAiMemoryService.js"):
        src = ROOT / "backend" / "services" / name
        for prefix in ("worker/services",):
            rel = f"{prefix}/{name}"
            dest = RC2 / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            h = sha256(dest)
            rc1p = RC1 / rel
            rc1_h = sha256(rc1p) if rc1p.exists() else None
            if rc1_h != h:
                changed_from_rc1.append(rel)
            manifest_files[rel] = {
                "sha256": h,
                "sha16": h[:16],
                "bytes": dest.stat().st_size,
                "changed_from_rc1": rc1_h != h,
                "rc1_sha16": (rc1_h[:16] if rc1_h else None),
                "mirrored_from": f"backend/services/{name}",
            }

    # Preserve RC1 deploy order text with RC2 note
    deploy = (RC1 / "DEPLOY_ORDER.txt").read_text(encoding="utf-8")
    (RC2 / "DEPLOY_ORDER.txt").write_text(
        "Phase 4C T28 RC2 — DEPLOY ORDER (do not execute without approval)\n"
        "RC1 (_release/phase4c_t28_rc1) is IMMUTABLE and was not modified.\n"
        "Rollback: redeploy RC1 files if RC2 misbehaves.\n\n"
        + deploy,
        encoding="utf-8",
    )

    # Import smoke
    import_ok = True
    import_errors: list[str] = []
    try:
        import sys
        sys.path.insert(0, str(RC2 / "ai_engine"))
        import importlib
        for mod in ("app.pricing_resolver", "app.conversation_intelligence", "app.booking_flow", "app.main"):
            try:
                # Clear if previously loaded from workspace
                if mod in sys.modules:
                    del sys.modules[mod]
                if mod.startswith("app.") and "app" in sys.modules:
                    # keep package; reload children
                    pass
                importlib.import_module(mod)
            except Exception as exc:
                import_ok = False
                import_errors.append(f"{mod}: {type(exc).__name__}: {exc}")
    except Exception as exc:
        import_ok = False
        import_errors.append(str(exc))

    manifest = {
        "rc_id": "phase4c_t28_rc2",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "parent_rc": "phase4c_t28_rc1",
        "parent_immutable": True,
        "tenant": 28,
        "changed_from_rc1": sorted(set(changed_from_rc1)),
        "files": manifest_files,
        "import_smoke": {"ok": import_ok, "errors": import_errors},
        "notes": [
            "Pricing hard-gate + Gemini price-output block",
            "Keratin shoulder official Rs 25,000 enforced",
            "RC1 checksums preserved; do not overwrite RC1",
        ],
    }
    (RC2 / "MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Standalone checksums file
    lines = [f"{meta['sha256']}  {rel}" for rel, meta in sorted(manifest_files.items())]
    (RC2 / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "rc2": str(RC2),
        "changed_from_rc1": sorted(set(changed_from_rc1)),
        "import_ok": import_ok,
        "import_errors": import_errors,
        "file_count": len(manifest_files),
    }, indent=2))


if __name__ == "__main__":
    main()
