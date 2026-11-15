# Facial Catalogue Validation Report — Larvendo T28

**RC:** `phase6_t28_rc3` (local candidate)  
**Status:** NOT DEPLOYED  
**Catalogue action:** Display/validation only — **no merge, delete, or deactivate**

## Live active facial-related rows

### Category `Facials`

| ID | Name | Price | Duration |
|----|------|-------|----------|
| 295 | Aroma Magic Gold Facial | 7,000 | 90 |
| 178 | Clean-up | 4,000 | 60 |
| 298 | Fox C Peel Treatment | 15,000 | 75 |
| 214 | Gold/Diamond Facial | 5,000 | 90 |
| 296 | Hydra Facial Standard | 6,000 | 40 |
| 297 | Hydra Facial Ume Care | 8,000 | 40 |
| 294 | Normal Facial | 4,500 | 90 |
| 255 | Pimple Treatment | 4,500 | 75 |
| 261 | Spacylon Facial | 6,000 | 90 |
| 293 | Umecare Clean-up | 6,000 | 60 |
| 265 | Umecare Facial | 10,000 | 90 |

### Category `Facials (Ladies and Gents)`

| ID | Name | Price | Duration |
|----|------|-------|----------|
| 166 | Aroma Magic Gold | 7,000 | 90 |
| 194 | Fox C Peal Treatment | 15,000 | 75 |
| 246 | Normal Facial (Jovis) | 4,500 | 90 |
| 247 | Normal Facial (Oxy) | 4,500 | 90 |
| 230 | Standard Hydra Facial | 10,000 | 90 |
| 266 | Umecare Hydra Facial | 14,000 | 90 |

## Near-duplicate analysis

These look similar in chat but are **distinct active catalogue rows** (different ids and often different prices/durations):

| Group | Distinct IDs | Notes |
|-------|--------------|-------|
| Normal Facial | 294, 246, 247 | Plain / Jovis / Oxy |
| Hydra | 296, 230, 297, 266 | Standard vs Standard Hydra vs Ume Care vs Umecare Hydra — **prices differ** |
| Aroma Magic | 295, 166 | Same price; different names/categories |
| Fox C Peel | 298, 194 | Spelling Peel vs Peal |
| Clean-up | 178, 293 | Base vs Umecare |

**Conclusion:** Do **not** merge. Customer replies must list each matched option with **display name + backend id + live price**.

## Implementation

- `facial_display_rows()` — customer-friendly `display_name`, retains `id`
- `facial_near_duplicate_groups()` — prompt guidance so Gemini does not collapse aliases
- Injected into salon live snapshot when facial intent is detected

## Approval gate

Any future catalogue cleanup (merge/deactivate) requires separate verified catalogue evidence + explicit approval.
