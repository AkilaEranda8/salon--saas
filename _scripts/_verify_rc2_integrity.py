"""Verify RC2 MANIFEST SHA-256 and RC1 immutability (read-only)."""
from __future__ import annotations

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
RC1 = ROOT / "_release" / "phase4c_t28_rc1"
RC2 = ROOT / "_release" / "phase4c_t28_rc2"


def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    m2 = json.loads((RC2 / "MANIFEST.json").read_text(encoding="utf-8"))
    m1 = json.loads((RC1 / "MANIFEST.json").read_text(encoding="utf-8"))
    files_ok = True
    rows = []
    for rel, meta in m2["files"].items():
        p = RC2 / rel
        h = sha(p) if p.exists() else None
        match = h == meta.get("sha256")
        if not match:
            files_ok = False
        rows.append({"rel": rel, "ok": match, "sha16": (h or "")[:16], "bytes": meta.get("bytes")})

    sums_path = RC2 / "SHA256SUMS.txt"
    sums_ok = True
    sum_lines = []
    if sums_path.exists():
        for line in sums_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            digest, name = line.split(None, 1)
            name = name.strip()
            actual = sha(RC2 / name)
            if actual != digest:
                sums_ok = False
            sum_lines.append({"rel": name, "ok": actual == digest})
    else:
        sums_ok = False

    # RC1 immutability vs its own manifest
    rc1_ok = True
    for rel, meta in m1["files"].items():
        p = RC1 / rel
        h16 = sha(p)[:16] if p.exists() else None
        if h16 != meta.get("sha16"):
            rc1_ok = False

    deploy = (RC2 / "DEPLOY_ORDER.txt").read_text(encoding="utf-8")
    out = {
        "rc2_id": m2.get("rc_id"),
        "parent_rc": m2.get("parent_rc"),
        "parent_immutable_flag": m2.get("parent_immutable"),
        "changed_from_rc1": m2.get("changed_from_rc1"),
        "import_smoke": m2.get("import_smoke"),
        "manifest_files_ok": files_ok,
        "sha256sums_ok": sums_ok,
        "rc1_manifest_self_check_ok": rc1_ok,
        "file_count": len(rows),
        "files": rows,
        "sums": sum_lines,
        "deploy_order_has_rc2_note": "RC1" in deploy and "immutable" in deploy.lower(),
        "deploy_order_preview": deploy.splitlines()[:12],
    }
    out_path = ROOT / "_scripts" / "_rc2_integrity_verify.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({
        "manifest_files_ok": files_ok,
        "sha256sums_ok": sums_ok,
        "rc1_manifest_self_check_ok": rc1_ok,
        "changed_from_rc1": m2.get("changed_from_rc1"),
        "import_ok": (m2.get("import_smoke") or {}).get("ok"),
        "out": str(out_path),
    }, indent=2))


if __name__ == "__main__":
    main()
