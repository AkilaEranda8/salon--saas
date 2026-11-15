# RC2 — Staging API Key Rotation & Storage Checklist

**Status:** OPERATOR ACTION REQUIRED (cannot revoke from this workspace)  
**Date:** 2026-11-14  

## Why

A Gemini staging key was previously pasted in chat. Treat it as **compromised**.

## Rotate / revoke (manual)

1. Open Google AI Studio / Cloud Console for the **staging** project only.  
2. **Revoke/delete** the exposed key.  
3. Create a **new** staging key with minimal scope.  
4. Do **not** paste the new key into chat, tickets, or docs.  
5. Store only in local gitignored file or approved secret store:

File: `e:\salon_v1\.env.gemini.local`  
Variable name only: `GEMINI_API_KEY` (operator adds the value offline in that file).  
Do not paste the secret into chat, tickets, git, or docs.

6. Confirm production secrets are **not** overwritten and were not pulled.  
7. Re-run (optional, local only): `python _scripts/_pricing_safety_real_gemini.py` — expect pass; evidence must show `key_fingerprint` length only.

## Verified in this workspace (2026-11-14)

| Check | Result |
|---|---|
| `.gitignore` includes `.env.gemini.local` | YES (line 10) |
| `git check-ignore` reports ignore | YES |
| Tracked env secrets in git | Only `.env.example`, `frontend/.env.development` (no live Gemini key files) |
| Key patterns inside `_release/**` | **none** |
| `.env*` files inside RC2 bundle | **none** (11 files; code + manifest only) |

## Still open (operator)

- [ ] Exposed key revoked in Google console  
- [ ] New key written only to `.env.gemini.local` or vault  
- [ ] New key **not** committed, not in RC2, not in reports  
- [ ] Prod Gemini secret unchanged unless separately authorized  

## Do not

- Commit `.env.gemini.local`  
- Copy keys into `_release/phase4c_t28_rc1` or `_rc2`  
- Log full key values in harness JSON (fingerprint length only)  
