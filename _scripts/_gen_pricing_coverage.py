import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"e:\salon_v1")
sys.path.insert(0, str(ROOT / "ai_engine"))
from app.pricing_resolver import OFFICIAL_LENGTH_TIERS, pick_quote_message, resolve_price

cat = json.loads((ROOT / "ai_engine/tests/fixtures/t28_services.json").read_text(encoding="utf-8"))
allowed = set()
for s in cat:
    if s.get("is_active", True):
        allowed.add(int(float(s["price"])))
for tiers in OFFICIAL_LENGTH_TIERS.values():
    for p, _ in tiers.values():
        allowed.add(p)

active = [s for s in cat if s.get("is_active", True)]
rows = []
for s in active:
    q = resolve_price(f"{s['name']} price", cat)
    text = pick_quote_message(q, "english")
    amts = [int(x.replace(",", "")) for x in re.findall(r"Rs\.?\s*([\d,]+)", text or "", flags=re.I)]
    bad = [a for a in amts if a not in allowed]
    rows.append(
        {
            "id": s["id"],
            "name": s["name"],
            "category": s.get("category"),
            "price": s["price"],
            "ok": q.ok,
            "kind": q.price_kind,
            "needs_length": q.needs_length,
            "clarify": q.needs_clarification,
            "escalate": q.escalate,
            "bad_amts": bad,
            "quoted": q.amount_lkr,
        }
    )

by = defaultdict(list)
for r in rows:
    by[r["category"]].append(r)

summary = {
    "catalogue_rows": len(cat),
    "active_services": len(active),
    "inactive_services": len(cat) - len(active),
    "ok_fixed_or_list": sum(1 for r in rows if r["ok"]),
    "needs_length": sum(1 for r in rows if r["needs_length"]),
    "clarify": sum(1 for r in rows if r["clarify"]),
    "escalate": sum(1 for r in rows if r["escalate"]),
    "unverified_amount_hits": sum(1 for r in rows if r["bad_amts"]),
    "closed_safe_paths": sum(
        1 for r in rows if r["ok"] or r["needs_length"] or r["clarify"] or r["escalate"]
    ),
    "by_category": {
        c: {"n": len(v), "safe": sum(1 for x in v if x["ok"] or x["needs_length"] or x["clarify"] or x["escalate"])}
        for c, v in sorted(by.items())
    },
}
out = ROOT / "_scripts" / "_pricing_134_coverage.json"
out.write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2))
print("wrote", out)
