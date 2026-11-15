# Hair Cut Style Resolution Report — Larvendo T28

**RC:** `phase6_t28_rc3` (local candidate)  
**Status:** NOT DEPLOYED  

## Live Hair Cut catalogue (active)

| ID | Name | Price (LKR) | Duration (min) |
|----|------|-------------|----------------|
| 167 | Baby Hair Cut | 1,000 | 30 |
| 168 | Blade and Bloom BC | 1,000 | 30 |
| 169 | Blade and Bloom HC | 2,000 | 45 |
| 276 | Blade and Bloom(Hair & Beard) | 3,000 | 75 |
| 286 | Front Cut | 1,500 | 30 |
| 287 | Gents Beard Cut | 1,000 | 30 |
| 285 | Gents Hair Cut | 2,000 | 45 |
| 238 | Ladies Hair Cut | 3,500 | 45 |
| **278** | **Ladies Hair Cut-Butterfly** | **4,500** | **105** |
| 239 | Ladies One Length | 1,500 | 30 |

## Butterfly validation

- Brief reference: id **278**, Rs **4,500** — **matches live T28**.
- Fixture `t28_services.json` matches live.
- `resolve_price("Butterfly Cut…")` → Rs 4,500; Ladies Hair Cut alone → Rs 3,500.

## Layer Cut

- **Not listed** as a separate active service.
- Resolver returns clarification + stylist confirmation path.
- Must **not** quote Ladies Hair Cut Rs 3,500 as Layer Cut.

## Multi-ask behaviour

Message with Hair Cut options + Layer + Butterfly:
1. Mentions both styles.
2. Matches Butterfly row id 278.
3. Marks Layer as missing.
4. Category remains Hair Cut only (no Facials leak).

## Code

- `ai_engine/app/catalogue_quality.py` — `resolve_haircut_styles`, `style_notes_block`
- `ai_engine/app/booking_flow.py` — haircut filter uses multi-style resolver
- `ai_engine/app/pricing_resolver.py` — Butterfly before Ladies fixed path; Layer clarify
- `ai_engine/app/main.py` — style notes injected into salon live snapshot
