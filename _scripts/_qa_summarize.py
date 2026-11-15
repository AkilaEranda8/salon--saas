import json
from pathlib import Path

d = json.loads(Path(r"e:\salon_v1\_scripts\_qa_larvendo_probe.json").read_text(encoding="utf-8"))

print("=== STAFF ===")
print(json.dumps(d["staff"]["counts"], indent=2))
for s in d["staff"]["staff"]:
    print(f"  id={s['id']} active={s['is_active']} online={s['available_online']} tenant={s['tenant_id']} branch={s['branch_id']} hours={s['has_working_hours']} name={s['name']} role={s.get('role_title')}")
    if s.get("working_hours"):
        print("   WH:", json.dumps(s["working_hours"], ensure_ascii=False)[:200])
print("missing hours:", d["staff"]["missing_working_hours"])
print("inactive:", d["staff"]["inactive"])
print("tenant_null:", d["staff"]["tenant_id_null"])
print("branches:", json.dumps(d["staff"]["branches"], ensure_ascii=False, indent=2))

print("\n=== DUP GROUPS ===")
for g in d["services"]["exact_duplicate_groups"]:
    print(f"\nkey={g['key']} count={g['count']}")
    for r in g["rows"]:
        print(f"  #{r['id']} [{r['category']}] {r['name']} Rs{r['price']}/{r['duration_minutes']}m active={r['is_active']} online={r['available_online']} appts={r['appointment_refs']}")

print("\n=== PROPOSED CLEANUP ===")
for p in d["services"]["proposed_cleanup"]:
    print(f" keep={p['keep_id']} deactivate={p['propose_deactivate_ids']} reason={p['keep_reason']} key={p['key']}")

print("\n=== NEAR DUP sample ===")
for n in d["services"]["near_duplicate_pairs"][:25]:
    print(f"  '{n['a']}' ~ '{n['b']}'")

print("\n=== MALFORMED KB ===")
print(json.dumps(d["knowledge"]["malformed_titles"], ensure_ascii=False, indent=2))
