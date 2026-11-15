# Phase 4D — SHA-256 Checksum Manifest

**RC:** `phase4c_t28_rc1`  
**Generated:** 2026-11-14  
**Note:** Checksums computed read-only; RC1 files were not modified. Full evidence JSON: `_scripts/_phase4d_rc1_integrity.json`

## Release payload files

| File | Bytes | SHA-256 |
|---|---:|---|
| `ai_engine/app/main.py` | 88282 | `a73d79a65d9f95444573fa977adaed25350dec2ac40ca2a12426cad0c2557cad` |
| `ai_engine/app/pricing_resolver.py` | 29991 | `f38c616f83ac98739bed51476505d45446a649fb7385317b4569416e786cfc29` |
| `ai_engine/app/conversation_intelligence.py` | 24981 | `b48ac76f091efb473e3a5c27929a966679852102ff9122b3e21fc874d862c823` |
| `ai_engine/app/booking_flow.py` | 125699 | `f70577c7fa077e1d5217ff975d1d8e1f1979a718cb8e88532682fb965cfab4a4` |
| `backend/services/crmInboundTurnService.js` | 37787 | `ef40cdd7dd8b031af23b6e9592e6e5c90ea38d8b4a34a71705d174c79e2e99c3` |
| `backend/services/crmAiMemoryService.js` | 8732 | `f63ea110f2129fa725d83d8064fcf21b4acbd2c1815f0eb40714598733f91c61` |
| `worker/services/crmInboundTurnService.js` | 37787 | `ef40cdd7dd8b031af23b6e9592e6e5c90ea38d8b4a34a71705d174c79e2e99c3` |
| `worker/services/crmAiMemoryService.js` | 8732 | `f63ea110f2129fa725d83d8064fcf21b4acbd2c1815f0eb40714598733f91c61` |

Worker JS checksums are **identical** to backend copies (intentional).

## Bundle meta files

| File | Bytes | SHA-256 |
|---|---:|---|
| `MANIFEST.json` | 1221 | `10d536a06f0156579e6561a947e7af36c4b93ea08297d79a280c2bb4da099a67` |
| `DEPLOY_ORDER.txt` | 630 | `ecd10c2b5c84a40db4d2eee2a4a28139953fc541afde0ac938bbcd219f369e93` |

## MANIFEST sha16 cross-check

All eight payload `sha16` prefixes in `MANIFEST.json` equal the first 16 hex chars of the SHA-256 digests above.
