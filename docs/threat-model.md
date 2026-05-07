# Threat Model — Verisure Equipment Manager

**Application:** Verisure Equipment Manager (Netherlands)
**Methodology:** STRIDE per data flow + attack trees for highest-impact flows
**Last reviewed:** 2026-05-06
**Owner:** Pedro Ciordia, System Owner

---

## 1. Scope and assumptions

### Trust boundaries

1. **Browser → Frontend host (Vercel)** — TLS-terminated by Vercel; immutable static assets served from CDN edge.
2. **Browser → Supabase REST/Auth** — TLS to `*.supabase.co`; anon key bound at runtime.
3. **Edge Functions → Postgres** — same Supabase project, internal control plane.
4. **Postgres → Backups (Supabase platform)** — managed by Supabase; backups encrypted at rest.

### Actors

| Actor | Trust level |
|---|---|
| External anonymous user | Untrusted |
| Authenticated `sbc` | Limited trust — least-privileged business actor |
| Authenticated `data_manager` | Trusted — read-heavy, no settings access |
| Authenticated `admin` | Highly trusted |
| Verisure InfoSec / IT | Highly trusted (out-of-band approval) |
| Supabase platform staff | Trusted under DPA / SOC 2 controls |
| Supabase service role (key) | Server-side only, never exposed to client |

### Assumptions

- Browsers behave per Web Platform spec; CSP and SOP are effective.
- Supabase platform integrity (RLS engine, JWT signing, encryption at rest) is sound. Validated via SOC 2 Type II + ISO 27001 audits referenced in the supplier TPA.
- Internal Verisure NL employees follow the corporate acceptable-use policy.

---

## 2. Data flows analysed

The following 7 data flows cover all classes of interaction in the application. For each, STRIDE is applied and notable threats are recorded with the implemented control.

### DF-1 — Sign-in (email/password + TOTP MFA)
### DF-2 — Equipment-transaction creation (handout, by SBC)
### DF-3 — Equipment-transaction return (return, by SBC or admin)
### DF-4 — Debt calculation read (data_manager via Reports)
### DF-5 — Payroll export (data_manager / admin)
### DF-6 — Admin user creation (admin via `create-user` edge function)
### DF-7 — Role grant or revoke (admin via SQL or future UI)

---

## 3. STRIDE per data flow

### DF-1 — Sign-in

| STRIDE | Threat | Control |
|---|---|---|
| **S** Spoofing | Credential stuffing or password guessing | Lockout after repeated failures (Supabase Auth platform); password floor 12 (NIST SP 800-63B aligned); planned migration to corporate SSO (§5.1) |
| **S** | Phishing of password | TOTP MFA mandatory for `admin` and `data_manager` (cannot be reused without device); SSO will eliminate password phishing entirely |
| **T** Tampering | JWT manipulation | JWT signed by Supabase (HS256/RS256), verified server-side on every request |
| **R** Repudiation | User denies signing in | `auth.audit_log_entries` (Supabase platform) records sign-in events; supplemented by application `audit_logs` |
| **I** Information disclosure | Token theft via XSS | Strict CSP (`script-src 'self'`, no inline, no remote); `connect-src` pinned to self + Supabase; React default escaping |
| **D** Denial of service | Account lockout abuse | Lockout is per-account, not global; rate-limited at Supabase platform layer |
| **E** Elevation of privilege | Sign-in granting wrong role | Roles stored in dedicated `user_roles` table, not in JWT claims; role re-checked on every request via `has_role(auth.uid(), role)` |

### DF-2 — Equipment-transaction creation (SBC)

| STRIDE | Threat | Control |
|---|---|---|
| **S** | SBC creates transaction attributed to another SBC | `pin_sbc_user_id_trigger` BEFORE INSERT pins `sbc_user_id := auth.uid()`. Forgery structurally impossible from application role |
| **T** | Modify after submission | `equipment_transactions.UPDATE` restricted to admin via RLS; SBC and DM cannot mutate |
| **T** | Tamper signature size to DoS | 150 KB Zod cap at client + 160 KB DB CHECK constraint; defense in depth |
| **R** | Deny having created transaction | `audit_logs` entry on submit + signed transaction record (employee + SBC signatures) |
| **I** | Read transactions of other SBCs | RLS policy: SBC SELECT only own records (`sbc_user_id = auth.uid()`) |
| **D** | Spam transactions | Rate limiting at Supabase API layer; signature size cap |
| **E** | Insert with admin-only fields | RLS WITH CHECK enforces role-allowed columns; write paths through Zod validation |

### DF-3 — Equipment-transaction return

Same controls as DF-2. The return flow operates on existing transaction rows; only the `returned_at`, signature, and condition fields are updated, all under the same RLS and trigger constraints.

### DF-4 — Debt calculation read (data_manager)

| STRIDE | Threat | Control |
|---|---|---|
| **I** | DM reads signatures (out of scope) | DM has no SELECT path that exposes signatures: base table `equipment_transactions` SELECT is admin-only (RLS); the view used by Reports (`equipment_transactions_for_reports`) excludes signature columns by definition |
| **I** | DM reads transactions of other branches without authorisation | Currently DM has cross-branch read; multi-tenant scoping is on the post-approval roadmap (§5.4). Not a current control gap because the role is by design organisation-wide |
| **R** | DM denies generating an export | `audit_logs` entry on every export action |

### DF-5 — Payroll export

| STRIDE | Threat | Control |
|---|---|---|
| **I** | Export contains signatures | Reports view excludes signature columns; payroll view aggregates further |
| **I** | Export leaked off-corp | Not in app's defensive scope. Mitigated by Verisure NL acceptable-use policy and DLP at the OS/network layer |
| **R** | Denial of export action | `audit_logs` entry with actor, timestamp, and aggregate parameters (period, branch filter) |

### DF-6 — Admin user creation (`create-user` edge function)

| STRIDE | Threat | Control |
|---|---|---|
| **S** | Caller spoofs admin | Caller JWT validated; `has_role('admin')` re-checked server-side |
| **T** | Manipulated request body | Zod validation: email format, password ≥12, role enum, branch UUID |
| **T** | CORS bypass | `ALLOWED_ORIGINS` allowlist set at deploy time; no wildcard |
| **R** | Admin denies creating a user | `audit_logs` row with full payload (no secrets) |
| **I** | Sensitive error details leaked | Edge function returns generic error to client; full details logged server-side only |
| **D** | Mass user creation | Rate limiting at Supabase platform layer; audit alert on burst patterns (post-approval observability item) |
| **E** | Non-admin creates admin | Explicit `confirm_admin: true` flag required for admin role assignment + admin role check on caller; double-gated |

### DF-7 — Role grant or revoke

Currently performed by admin via direct `INSERT/DELETE` on `user_roles` (RLS admin-only). Audit trail via Postgres + `audit_logs` entry from the application code path.

Post-approval roadmap: surface this in a dedicated UI with `audit_logs` integration. SSO migration (§5.1) will move role mapping to the corporate IdP groups, removing application-side role management entirely.

---

## 4. Attack trees — highest-impact flows

### AT-1 — Privileged-account compromise (admin)

**Goal:** attacker gains admin access and reads/exports/exfiltrates the full data set.

| Branch | Mitigation |
|---|---|
| Steal admin password | Mandatory TOTP MFA blocks password-only compromise. SSO migration removes passwords entirely |
| Phish TOTP code | Phishing-resistant via SSO post-migration. Pre-SSO: TOTP is rolling, valid 30 sec; reduces window |
| Steal session token via XSS | Strict CSP (`script-src 'self'`, no inline, no remote); React escaping; `connect-src` pinned blocks exfiltration |
| Steal session token via CSRF | Bearer JWTs in `Authorization` headers; browsers do not auto-attach across origins; no state-changing GET endpoints |
| Compromise an admin's device | Out of app scope; mitigated by Verisure NL endpoint security |
| SQL injection | All queries via Supabase JS client / PostgREST = parameterised. Zero raw SQL string concatenation in client code (verified by `verify-dossier.sh` and CI grep) |
| Privilege escalation via profile edit | `protect_profile_columns_trigger` blocks self-elevation of `branch_id`, `email`, `active` |

### AT-2 — Full-roster exfiltration

**Goal:** extract the entire `people` table out of the system.

| Branch | Mitigation |
|---|---|
| SBC enumerates `people` | SBC has no SELECT policy on `people` base table. RPCs return only minimum fields with row limits (max 50 per call) and require min 2-character query |
| Anonymous direct API call | RLS denies anonymous; anon key non-privileged |
| Direct DB connection | Service role key never in client; only as edge-function env var |
| Backup exfiltration | Supabase platform-managed backups, KMS-encrypted at rest |
| Insider misuse by admin/DM | Out of app scope; mitigated by audit logging + `audit_logs` retention 7 years for fiscally-relevant events; access reviewed at HR offboarding |

---

## 5. Residual risk register (linked to dossier §4)

| ID | Description | Status |
|---|---|---|
| R-001 | SBC FK resolution via `equipment_transactions_safe` view (joined `people` fields visible only for SBC's own transactions) | Documented and accepted. See dossier §4.1 |

---

## 6. Validation

This threat model is reviewed:
- On every change that introduces a new RLS policy, view, trigger, or edge function;
- On every change that affects an existing data flow;
- At least annually as part of the application security baseline review.

The latest run of `scripts/verify-dossier.sh` (2026-05-06): 34 passed, 0 failed, 3 warnings. Warnings are non-blocking engineering-quality items, not threat-model gaps.
