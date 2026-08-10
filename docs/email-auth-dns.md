# Email authentication DNS (Cloudflare) — Hexalyte

These records cannot be applied from the app repo. Set them in **Cloudflare → hexalyte.com → DNS / Email**.

## Current issues (from security audit)

- SPF appears OK for the sending domain.
- DMARC uses `p=none` with a broken RUA address (`demarc@hexalyte.com.22`).
- Default DKIM selector was not found — spam filters (Fortinet / alphaMountain) treat mail as unauthenticated spam.

## Recommended TXT records

### 1. Fix DMARC

Name: `_dmarc`  
Type: `TXT`  
Value (start here):

```txt
v=DMARC1; p=quarantine; rua=mailto:dmarc@hexalyte.com; ruf=mailto:dmarc@hexalyte.com; fo=1; adkim=s; aspf=s
```

After 1–2 weeks of clean reports, consider `p=reject`.

Ensure mailbox `dmarc@hexalyte.com` exists (or use a reporting service).

### 2. Publish DKIM

From your SMTP provider (mail server / transactional ESP), create a DKIM key and publish the selector they give you, e.g.:

Name: `default._domainkey` (or provider selector)  
Type: `TXT`  
Value: `v=DKIM1; k=rsa; p=...` (provider-generated)

Verify with:

```bash
dig TXT default._domainkey.hexalyte.com +short
dig TXT _dmarc.hexalyte.com +short
```

### 3. Align From domain

Transactional mail (`From:`) should use `@hexalyte.com` (or a subdomain with its own SPF/DKIM) that matches SPF/DKIM/DMARC.

## VirusTotal / vendor false-positive submissions

Submit `https://salon.hexalyte.com/` and `https://admin.hexalyte.com/` as false positives to Bitdefender / G Data / other engines that flagged phishing.

Suggested note:

> Hexalyte Salon is a legitimate multi-tenant salon SaaS. Marketing site salon.hexalyte.com links to the official admin app admin.hexalyte.com (same organization, shared infrastructure). Login collects Hexalyte credentials only. Privacy/Terms published at /privacy and /terms. No credential harvesting of third-party brands.

## After DNS changes

Wait for TTL propagation (often ≤1 hour on Cloudflare), then re-check DMARC/DKIM and request VT reanalysis.
