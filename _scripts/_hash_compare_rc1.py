"""Compare workspace release files vs RC1 (read-only)."""
from __future__ import annotations

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
RC1 = ROOT / "_release" / "phase4c_t28_rc1"
m = json.loads((RC1 / "MANIFEST.json").read_text(encoding="utf-8"))
for rel, meta in m["files"].items():
    p = ROOT / rel
    rcp = RC1 / rel
    h = hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
    rh = hashlib.sha256(rcp.read_bytes()).hexdigest() if rcp.exists() else None
    print(
        f"{rel}: ws16={h[:16] if h else 'MISSING'} "
        f"rc1_16={rh[:16] if rh else 'MISSING'} "
        f"ws_eq_rc1={h == rh} "
        f"manifest16={meta.get('sha16')}"
    )
