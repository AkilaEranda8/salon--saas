# Image Understanding Report — Phase 2+

**Date:** 2026-11-14 · **Local only**

## Path

1. Baileys downloads image → base64 on inbound job.  
2. Placeholder text `[Customer sent a photo]` + `has_media=True`.  
3. Booking SM: media → **pause** (never `bad_date`).  
4. Gemini: VISION system rules + CI `INTENT_IMAGE` / `analyze_media`.  
5. Length estimate for hair photos → confirm with customer → verified price tiers only.

## Tests

- `test_f1_photo_during_await_date_yields_to_gemini`  
- `test_mt_image_during_booking`  
- Context builds for `[Customer sent a photo]`
