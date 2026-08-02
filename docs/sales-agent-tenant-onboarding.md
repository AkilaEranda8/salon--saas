# Tenant Onboarding — Flow & API for the Sales AI Agent

Everything a sales agent needs to create and activate a new salon tenant on HEXAONE.
Every endpoint and behaviour below was verified against the live production stack.

- **API base:** `https://api.salon.hexalyte.com`
- **Tenant app URL pattern:** `https://{slug}.salon.hexalyte.com`
- **Platform admin console:** `https://admin.hexalyte.com/platform`

---

## 1. Which onboarding path to use

There are two ways a tenant can come into existence. **The sales agent must use the platform path.**

| | Platform path (use this) | Public self-serve (do not use) |
|---|---|---|
| Endpoint | `POST /api/platform/tenants` | `POST /api/onboarding/register` |
| Auth | Platform admin token | None |
| Rate limit | None | 3 per hour per IP |
| Plan | Any (`trial`/`basic`/`pro`/`enterprise`) | Forced to `trial` |
| Owner login username | The owner's email, e.g. `owner@acme.com` | `{emailLocalPart}_{tenantId}`, e.g. `owner_42` |
| Welcome email | Sent with credentials | Not sent |
| First invoice | Auto-generated | Not created |
| Feature flags | Written explicitly from plan defaults | Left `null` (resolved from plan at runtime) |

The two paths produce **different usernames**, which is the single biggest source of "the customer can't log in" tickets. Always create tenants through the platform path so the login username is simply the owner's email address.

---

## 2. Authentication

Production runs Keycloak authentication (`KEYCLOAK_AUTH_ENABLED=true`). This has one critical consequence:

> **Only Keycloak RS256 Bearer tokens are accepted.** The legacy `POST /api/auth/login` endpoint sets an HS256 cookie that the API will reject with `403 Invalid or expired token`. Do not use it.

### Get a platform admin token

```bash
curl -s -X POST https://api.salon.hexalyte.com/api/auth/kc-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"akila","password":"<PLATFORM_ADMIN_PASSWORD>"}'
```

```json
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "expires_in": 300 }
```

Then send `Authorization: Bearer <access_token>` on every `/api/platform/*` call.

Rules:

- **Do not send `X-Tenant-Slug`** when logging in as a platform admin or when calling `/api/platform/*`. Platform admins have no tenant; the header would scope the lookup to a tenant and the login would fail.
- The platform admin logs in with the **plain username** (`akila`). Tenant users log in with `{slug}__{username}` in Keycloak, but the API adds that prefix automatically when `X-Tenant-Slug` is present — so callers always pass the bare username.
- `access_token` is short-lived (~5 min). Refresh with `POST /api/auth/kc-refresh` `{ "refresh_token": "..." }`, or just call `kc-login` again for short scripted runs.
- The token's `salon_role` claim must be `platform_admin`, otherwise every platform route returns `403 Platform admin access required.`
- `PLATFORM_SECRET` is **not** currently set in production, so no `X-Platform-Key` header is needed. If it is ever configured, every `/api/platform/*` request must also send `X-Platform-Key: <secret>` or it returns `403 Platform access denied.`

---

## 3. Step 1 — Pick and check the slug

The slug becomes the customer's subdomain, so confirm it before creating anything. Both calls are public and safe to retry.

**Suggest a slug from the business name:**

```bash
curl -s 'https://api.salon.hexalyte.com/api/onboarding/check-slug?businessName=Glow%20Beauty%20Lounge'
# {"available":true,"suggestedSlug":"glow-beauty-lounge"}
```

**Check a specific slug:**

```bash
curl -s 'https://api.salon.hexalyte.com/api/onboarding/check-slug?slug=glow-beauty-lounge'
# {"available":true}   or   {"available":false}
```

Slug rules:

- Pattern `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` — 3 to 63 characters, lowercase letters, digits and hyphens only, cannot start or end with a hyphen.
- Reserved and always rejected: `www`, `api`, `pma`, `main`, `app`, `admin`, `platform`, `status`, `mail`, `smtp`, `ftp`, `vpn`, `dev`, `staging`.
- `available: false` covers taken, malformed and reserved slugs alike, so treat any `false` as "pick another".
- If you omit `slug` at creation time, the backend slugifies the business name and appends `-2`, `-3`, … until it finds a free one. Passing an explicit slug is preferred so the agent can tell the customer their URL up front.

---

## 4. Step 2 — Create the tenant

```bash
curl -s -X POST https://api.salon.hexalyte.com/api/platform/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "businessName": "Glow Beauty Lounge",
    "slug": "glow-beauty-lounge",
    "ownerName": "Nimali Perera",
    "ownerEmail": "nimali@glowbeauty.lk",
    "password": "Glow#2026Start",
    "phone": "+94771234567",
    "plan": "trial",
    "status": "active",
    "branchName": "Colombo Main"
  }'
```

### Request fields

| Field | Required | Notes |
|---|---|---|
| `businessName` | Yes | Also used as `brand_name`, and as the branch name if `branchName` is omitted. |
| `ownerEmail` | Yes | Lowercased and used as the owner's **login username**. Must be globally unique across all tenants. |
| `ownerName` | Yes | Display name of the owner. |
| `password` | Yes | No minimum length is enforced here, so the agent should generate a strong one (12+ chars, mixed case, digit, symbol). |
| `slug` | No | Auto-generated from `businessName` when omitted. |
| `phone` | No | Stored on the first branch, not on the tenant. |
| `plan` | No, defaults `trial` | `trial` \| `basic` \| `pro` \| `enterprise` |
| `status` | No, defaults `active` | `active` \| `suspended` \| `cancelled` |
| `branchName` | No | Defaults to `businessName`. |

### Success — `201`

```json
{
  "tenant_url": "https://glow-beauty-lounge.salon.hexalyte.com",
  "tenant": {
    "id": 43,
    "name": "Glow Beauty Lounge",
    "slug": "glow-beauty-lounge",
    "email": "nimali@glowbeauty.lk",
    "brand_name": "Glow Beauty Lounge",
    "plan": "trial",
    "status": "active",
    "trial_ends_at": "2026-08-13T00:00:00.000Z"
  },
  "branch": { "id": 57, "name": "Colombo Main" },
  "owner": {
    "id": 128,
    "name": "Nimali Perera",
    "username": "nimali@glowbeauty.lk",
    "role": "superadmin"
  }
}
```

Persist `tenant.id`, `tenant.slug` and `owner.id` in the CRM — every follow-up call needs them.

### Errors

| Status | Message | Meaning |
|---|---|---|
| 400 | `businessName, ownerEmail, ownerName, and password are required.` | Missing a required field. |
| 400 | `Invalid slug format.` | Slug fails the pattern. |
| 400 | `The slug "x" is reserved.` | Slug is on the reserved list. |
| 400 | `Invalid plan. Use trial, basic, pro, or enterprise.` | Bad `plan`. |
| 400 | `Invalid status. Use active, suspended, or cancelled.` | Bad `status`. |
| 401 | `No token provided. Access denied.` | Missing `Authorization` header. |
| 403 | `Platform admin access required.` | Token is valid but not a platform admin. |
| 409 | `This business URL is already taken.` | Slug collision. |
| 409 | `Owner email is already used by another user.` | Email already owns another salon. |
| 500 | `Failed to create tenant.` | Rolled back; nothing was created. Safe to retry. |

**This endpoint is not idempotent.** A retry after a successful create returns `409`. On a `409` for the email, either reuse the existing account or ask the customer for a different address — the same email cannot own two salons.

### What gets created

In one database transaction: the `Tenant` row (plan, status, trial end date, branch/staff caps and explicit feature flags from the plan), the first `Branch`, the owner `User` with role `superadmin`, and default `NotificationSettings`.

After the transaction commits, three things happen asynchronously and **do not fail the request**:

1. A Keycloak group for the slug and a Keycloak user for the owner. If this fails the tenant exists but **nobody can log in** — see the verification step below.
2. A welcome email to `ownerEmail` containing the login URL, username and the plaintext password.
3. A draft platform invoice (`draft` for trial or zero-price plans, `issued` otherwise, currency LKR).

Note that **no services, staff or categories are seeded**. The salon starts empty.

---

## 5. Step 3 — Verify the owner can actually log in

Because the Keycloak sync is fire-and-forget, always confirm the login works before telling the customer their account is ready.

```bash
curl -s -X POST https://api.salon.hexalyte.com/api/auth/kc-login \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Slug: glow-beauty-lounge' \
  -d '{"username":"nimali@glowbeauty.lk","password":"Glow#2026Start"}'
```

A `200` with an `access_token` means onboarding succeeded. A `401 Invalid username or password.` means the Keycloak sync failed and needs to be repaired before handover — escalate rather than resending credentials.

---

## 6. Step 4 — Hand over to the customer

Send the customer:

- **Login URL:** `https://{slug}.salon.hexalyte.com`
- **Username:** their email address
- **Password:** the generated password, and a note to change it under Settings → Profile
- **Trial end date:** `tenant.trial_ends_at`

The welcome email already carries all of this. To also send it over WhatsApp:

```bash
curl -s -X POST https://api.salon.hexalyte.com/api/platform/whatsapp/send-onboard \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "+94771234567",
    "businessName": "Glow Beauty Lounge",
    "slug": "glow-beauty-lounge",
    "ownerEmail": "nimali@glowbeauty.lk",
    "tempPassword": "Glow#2026Start"
  }'
```

`phone`, `businessName` and `slug` are required. This only sends a message — it provisions nothing.

---

## 7. Step 5 — Setup checklist to walk the customer through

The tenant is live immediately but empty. There is no forced setup wizard, so the owner lands straight on the dashboard. Walk them through this order:

| # | Task | Page | API |
|---|---|---|---|
| 1 | Log in and change the password | `/login` → Settings | `PATCH /api/users/:id/password` |
| 2 | Complete the first branch (address, phone, manager) | `/branches` | `PUT /api/branches/:id` |
| 3 | Add service categories and services | `/services` | `POST /api/services` |
| 4 | Add staff | `/staff` | `POST /api/staff` |
| 5 | Create logins for staff who need app access | `/users` | `POST /api/users` |
| 6 | Configure notifications and connect WhatsApp | `/notifications` | `GET`/`PUT /api/notifications/settings` |
| 7 | Branding and optional custom domain | `/branding`, `/domain-settings` | branding / domain APIs |
| 8 | Book a test appointment | `/appointments` | appointment APIs |
| 9 | Upgrade before the trial ends | `/billing` | `POST /api/billing/checkout` |

All tenant-scoped calls need both `Authorization: Bearer <tenant user token>` and `X-Tenant-Slug: {slug}`.

---

## 8. Plans, limits and the trial clock

Live plan catalogue (`GET /api/public/plans`, public, no auth):

| Plan | Price | Branches | Staff | Services |
|---|---|---|---|---|
| `trial` | Free, 14 days | 1 | 5 | 20 |
| `basic` | LKR 2,900/mo | 1 | 10 | 50 |
| `pro` | LKR 7,900/mo | 5 | 50 | 200 |
| `enterprise` | Custom | Unlimited | Unlimited | Unlimited |

`-1` in the API response means unlimited.

Trial lifecycle: a trial tenant is created `active` with `trial_ends_at` 14 days out. After that date there is a **7-day grace period**, and then every API call returns `402` with code `TRIAL_EXPIRED`, which redirects the user to the billing page. Payment is never required to start the trial.

Changing `plan` also resets the branch and staff caps to that plan's limits.

---

## 9. Post-creation operations

All require `Authorization: Bearer <platform admin token>`.

| Goal | Call |
|---|---|
| List / search tenants | `GET /api/platform/tenants?search=glow&plan=trial&status=active&page=1&limit=50` |
| Tenant detail and stats | `GET /api/platform/tenants/:id` |
| Change plan, email, name or caps | `PATCH /api/platform/tenants/:id` with any of `plan`, `status`, `trial_ends_at`, `max_branches`, `max_staff`, `name`, `email` |
| Extend the trial by 7 days | `POST /api/platform/tenants/:id/trial/adjust` `{ "adjust_days": 7 }` |
| Set an exact trial end | `POST /api/platform/tenants/:id/trial/adjust` `{ "trial_ends_at": "2026-09-01" }` |
| Restart the trial | `POST /api/platform/tenants/:id/trial/adjust` `{ "reset": true }` |
| Suspend / reactivate / cancel | `PATCH /api/platform/tenants/:id/quick-status` `{ "action": "suspend" \| "activate" \| "cancel" }` |
| Toggle features | `PATCH /api/platform/tenants/:id/features` `{ "features": { "inventory": true, "loyalty": false } }` |
| Wipe demo data after a trial | `POST /api/platform/tenants/:id/clear-data` `{ "confirm": "<exact slug>" }` |
| Open the tenant as its owner | `POST /api/platform/tenants/:id/impersonate` |
| Force logout of all tenant users | `POST /api/platform/tenants/:id/revoke-sessions` |
| Approve a bank transfer payment | `PATCH /api/billing/bank-slip/:id/approve` |

Trial adjustment only works while `plan === 'trial'`; otherwise it returns `400 Trial period can only be adjusted for tenants on the trial plan.`

`clear-data` deletes operational records (appointments, payments, customers and so on) but **keeps** login accounts and branches. The `confirm` value must exactly match the tenant slug.

`DELETE /api/platform/tenants/:id` is a **soft cancel** only — it sets `status: 'cancelled'`. The row, the Keycloak group and the slug all remain, so a cancelled slug cannot be reused for a new signup.

---

## 10. Known traps

1. **Never use `POST /api/auth/login`.** Production is on Keycloak; use `kc-login` and Bearer tokens.
2. **Never send `X-Tenant-Slug` on platform admin calls.** It breaks platform login and platform routes.
3. **`POST /api/platform/users/:id/reset-password` does not change the real password.** It updates only the local database and skips the Keycloak sync, so the customer's login is unchanged while the API cheerfully returns a `tempPassword`. To genuinely reset a tenant user's password, use the tenant-scoped `PATCH /api/users/:id/password` (as a tenant `superadmin`/`admin`), which does sync Keycloak.
4. **Owner email is globally unique.** One email cannot own two salons.
5. **Create is not idempotent.** Store the returned `tenant.id` immediately and never blind-retry a create.
6. **Keycloak sync is non-fatal.** A `201` does not guarantee a working login — always run the verification login in step 3.
7. **Cancelled tenants still hold their slug**, and any tenant-scoped request for a cancelled slug returns `403 ACCOUNT_CANCELLED`.
8. **Nothing is seeded.** Do not promise a ready-to-use catalogue; the setup checklist is required work.
9. **Server-side scripts bypass CORS** (no `Origin` header is allowed through), but browser-based tools must run from a `*.hexalyte.com` origin.
10. **The welcome email contains the plaintext password.** Treat the generated password as a secret in CRM notes and logs, and tell the customer to rotate it on first login.

---

## 11. Complete happy path

```bash
API=https://api.salon.hexalyte.com
SLUG=glow-beauty-lounge

# 1. Authenticate as platform admin
TOKEN=$(curl -s -X POST "$API/api/auth/kc-login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"akila","password":"'"$PLATFORM_PASSWORD"'}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

# 2. Confirm the slug is free
curl -s "$API/api/onboarding/check-slug?slug=$SLUG"

# 3. Create the tenant
curl -s -X POST "$API/api/platform/tenants" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "businessName":"Glow Beauty Lounge",
    "slug":"'"$SLUG"'",
    "ownerName":"Nimali Perera",
    "ownerEmail":"nimali@glowbeauty.lk",
    "password":"'"$OWNER_PASSWORD"'",
    "phone":"+94771234567",
    "plan":"trial",
    "status":"active",
    "branchName":"Colombo Main"
  }'

# 4. Verify the owner can log in
curl -s -X POST "$API/api/auth/kc-login" \
  -H 'Content-Type: application/json' \
  -H "X-Tenant-Slug: $SLUG" \
  -d '{"username":"nimali@glowbeauty.lk","password":"'"$OWNER_PASSWORD"'"}'

# 5. Send WhatsApp credentials
curl -s -X POST "$API/api/platform/whatsapp/send-onboard" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "phone":"+94771234567",
    "businessName":"Glow Beauty Lounge",
    "slug":"'"$SLUG"'",
    "ownerEmail":"nimali@glowbeauty.lk",
    "tempPassword":"'"$OWNER_PASSWORD"'"
  }'
```
