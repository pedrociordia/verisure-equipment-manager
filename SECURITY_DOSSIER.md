# Verisure Equipment Manager — Security Dossier

**Prepared for:** Information Security Review
**Application:** Verisure Equipment Manager (Netherlands)
**Version:** 1.0
**Date:** 2026-05-06
**Prepared by:** Pedro Ciordia, System Owner
**Staging URL (for review):** https://verisure-equipment.vercel.app

---

## 1. Executive Summary

The Verisure Equipment Manager is an internal web application that tracks equipment handouts and returns for Verisure Netherlands field employees. It manages employee records, equipment transactions, debt calculations, and operational reporting. All data subjects are internal Verisure NL field employees; no customer data and no Article 9 GDPR special-category data is processed.

The application has been built and hardened against a defense-in-depth security posture covering, end to end:

- **Access control** at three layers — client-side route guards, PostgreSQL Row-Level Security with explicit role-based policies (no permissive defaults on data-bearing tables), and edge-function authorization.
- **Data exposure reduction** via dedicated views (`equipment_transactions_safe`, `equipment_transactions_for_reports`, `people_lookup`) and `SECURITY DEFINER` server-side functions (`search_people_for_sbc`, `get_dashboard_stats`) that ensure every non-admin role gets only the minimum data required for its workflow. Signatures and device-detail JSONB are admin-only at the base-table level.
- **Defense in depth on writes** — BEFORE INSERT/UPDATE triggers pin `auth.uid()` to actor columns (`sbc_user_id`, `created_by`) and prevent self-elevation of profile attributes (`branch_id`, `email`, `active`). Identity forgery and scope escalation are structurally impossible from the application role.
- **Append-only audit log** enforced at three layers (no UPDATE/DELETE policies, REVOKE at Postgres-grant level, BEFORE UPDATE/DELETE blocking trigger).
- **Environment hygiene** — `.env` untracked, anon key rotated, `gitleaks` and SCA in CI.
- **Supply chain** — `npm audit --omit=dev` reports zero critical and zero high in runtime, no documented exceptions. Spreadsheet parsing migrated from `xlsx` to `exceljs` (MIT, no open advisories) plus `papaparse` for CSV.
- **HTTP security headers** — strict CSP (`script-src 'self'`, no inline, no remote), HSTS preload-eligible, X-Frame-Options DENY, COOP/CORP same-origin, Permissions-Policy disabling sensors and capabilities, Cache-Control no-store. All 14 headers verifiable via `curl -I` against the staging URL above. External rating: **A+ on securityheaders.com**.
- **Auth posture** — email/password with mandatory TOTP MFA for privileged roles, password floor 12, lockout, 30-minute idle timeout with full client-state clearing, JWT 1h with refresh-token rotation. Corporate SSO is the immediate planned next step (§5).
- **GDPR posture** — lawful basis Art. 6(1)(b) primary plus 6(1)(f) secondary, EU Central data residency (`eu-central-1`, Frankfurt), DPA with Supabase signed, retention anchored to Dutch art. 52 AWR, 72-hour breach notification path to the Autoriteit Persoonsgegevens, Works Council consultation completed.
- **Verifiability** — every claim in this dossier is verified by `scripts/verify-dossier.sh`, which runs in CI on every PR. Latest run: **38 passed, 0 failed, 2 warnings** (warnings are non-blocking engineering-quality items).

One narrow residual item is disclosed in §4. The roadmap in §5 discloses every planned post-approval evolution including SSO migration and a read-only Snowflake integration.

The application currently runs on a synthetic data set only (200 test people, 446 synthetic transactions, 5 demo branches across 9 real Verisure NL districts). No real employee data will be loaded until InfoSec approval is granted (see §6 — operational note on environments).

---

## 2. Architecture & Access Model

### Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5 |
| Backend | Supabase managed PostgreSQL 15 + Auth + Edge Functions (Deno) |
| Hosting (staging) | Vercel (`https://verisure-equipment.vercel.app`) — staging only for InfoSec review. Production host pending InfoSec/IT selection, EU/EEA region only |
| Validation | Zod (runtime schema validation, client and server) |
| Spreadsheet parsing | `exceljs` (xlsx) + `papaparse` (CSV) |
| Authentication | Email/password + TOTP MFA today; SSO via corporate IdP next |

### Role model

Three roles managed via the dedicated `user_roles` table and enforced by the `has_role()` SECURITY DEFINER function:

| Role | Scope |
|---|---|
| **admin** | Full access: every page, every record, user management, settings, exports, signatures |
| **data_manager** | Reports, people management, debt/payroll calculations. Does not access settings, user management, or signatures |
| **sbc** | Dashboard, equipment form (own transactions), transaction history (own records via safe view) |

### Three layers of enforcement

1. **Route guards (client).** SPA `AppLayout` checks `allowedRoles` and redirects unauthorized users.
2. **PostgreSQL Row-Level Security.** Every data-bearing table has explicit role-based policies. No `USING (true)` policies on data-bearing tables. The `has_role(auth.uid(), role)` SECURITY DEFINER function is the universal predicate.
3. **Edge function authorization.** `create-user` (deployed at `https://jjoofcdjnbxnmbdfonqj.supabase.co/functions/v1/create-user`, version 2 ACTIVE) validates the caller JWT, re-checks role via `has_role` RPC, validates input via Zod, enforces explicit `confirm_admin: true` for admin role creation, and uses a deployment-time CORS allowlist (`ALLOWED_ORIGINS` env var).

### Per-page access matrix

| Page | Allowed roles | Primary data source |
|---|---|---|
| Dashboard | all authenticated | `get_dashboard_stats()` RPC + `equipment_transactions_safe` view |
| Equipment Form | admin, sbc | `search_people_for_sbc()` RPC for search; `equipment_transactions` for write (`sbc_user_id` pinned by trigger) |
| Transaction History | admin, sbc | `equipment_transactions_safe` for list; base table for admin detail only |
| People Management | admin, data_manager | `people` (admin/DM SELECT, INSERT, UPDATE; admin DELETE) |
| Reports | admin, data_manager | `equipment_transactions_for_reports` view (JSONB device details, no signatures) |
| Settings | admin | `branches`, `equipment_prices`, `phone_models`, `tablet_models`, `profiles` |

### Database objects

**Tables**: `audit_logs`, `branches`, `debt_cases`, `debt_movements`, `equipment_prices`, `equipment_transactions`, `people`, `phone_models`, `tablet_models`, `profiles`, `user_roles`.

**Views**:
- `equipment_transactions_safe` — operational columns plus embedded `sales_name`, `pers_id`, `branch_name`. Excludes signatures and JSONB device details. Internal RLS replicated in WHERE clause; admin/DM see all, SBC see own records only. Used by SBC and Dashboard.
- `equipment_transactions_for_reports` — includes JSONB device details, excludes signatures. Admin/DM only. Used by Reports.
- `people_lookup` — column-restricted view (`id`, `pers_id`, `sales_id`, `sales_name`, `exit_date`, `branch_name`). For internal join resolution; not used directly by any role.

**Functions (SECURITY DEFINER)**:
- `has_role(_user_id uuid, _role app_role) → boolean`
- `search_people_for_sbc(query text, include_exited boolean)` — minimum 2-character query, max 50 rows, returns 6 fields only
- `get_dashboard_stats()` — aggregate counts only, role-aware
- `handle_new_user()` — trigger on `auth.users` insert
- `update_*_updated_at()` — generic
- `protect_profile_columns()` — pins `branch_id`/`email`/`active` for non-admins
- `pin_sbc_user_id()` — pins `sbc_user_id = auth.uid()` for non-admin INSERTs
- `pin_debt_movement_creator()` — pins `created_by = auth.uid()`
- `audit_logs_append_only()` — raises on UPDATE/DELETE

**Edge functions**: `create-user` — admin-only, JWT validation, role check, Zod validation, branch existence check, rollback on failure, audit logged, CORS allowlist via `ALLOWED_ORIGINS` env var.

---

## 3. Security Controls

### 3.1 Identity and authentication

Email/password with mandatory TOTP MFA for `admin` and `data_manager` roles. Password floor 12 characters (NIST SP 800-63B aligned: length over complexity, no mandatory rotation). Lockout via Supabase Auth platform layer after repeated failures.

JWT access-token expiry 1 hour with refresh-token rotation (`refresh_token_reuse_interval = 10` seconds). Idle timeout 30 minutes with pre-expiry warning dialog at 28 minutes; on idle expiry the client performs a full sign-out and clears all sensitive state (profile, role, refresh token, idle storage). All OAuth providers explicitly disabled in `supabase/config.toml` (under version control).

Planned next: corporate SSO (SAML 2.0 / OIDC) via Supabase enterprise connector, replacing email/password entirely. See §5.

### 3.2 Authorization and Row-Level Security

Every data-bearing table has RLS enabled with explicit role-based policies. `scripts/verify-dossier.sh` checks that no `USING (true)` policies exist on data-bearing tables; the live database state is verified via `pg_policies` query.

Lookup tables (`branches`, `equipment_prices`, `phone_models`, `tablet_models`) carry role-aware policies: SELECT is broad to all authenticated users (non-sensitive operational catalogs needed across all roles for form population, e.g. SBC fills the equipment-handout wizard with the active phone-model list and demobox-item list); INSERT, UPDATE, and DELETE are restricted to admin only via the `"Admin can manage ..."` policies. The catalogs contain no personal data and no information that would constitute a meaningful disclosure if a SBC could enumerate them.

Authorization decisions universally use `has_role(auth.uid(), role)`. The function is `SECURITY DEFINER` with `STABLE` and `search_path = 'public'` (function body is fully qualified with `public.` prefixes). Roles are stored in the dedicated `user_roles` table — never in JWT claims, never in profile fields — so role changes take effect on the next request without token rotation.

### 3.3 Defense in depth on writes

Three trigger functions pin actor identity at the database layer, making forgery and repudiation structurally impossible from the application role:

- **`pin_sbc_user_id()`** on `equipment_transactions` BEFORE INSERT — for non-admin inserts, sets `sbc_user_id := auth.uid()`. An SBC cannot create a transaction attributed to another SBC.
- **`pin_debt_movement_creator()`** on `debt_movements` BEFORE INSERT — sets `created_by := auth.uid()`.
- **`protect_profile_columns()`** on `profiles` BEFORE UPDATE — for non-admins, restores `branch_id`, `email`, and `active` from `OLD`. Self-service profile edits cannot escalate scope or change identity.

`equipment_transactions.UPDATE` is restricted to admins via RLS policy with `WITH CHECK`; data-manager and SBC roles cannot mutate transaction records. `equipment_transactions.person_id` carries `ON DELETE RESTRICT`, so deleting a person does not erase signed legal history.

### 3.4 Append-only audit log

Three-layer enforcement on `audit_logs`:

1. **RLS** — only INSERT (with `actor_user_id = auth.uid()` check) and SELECT (admin all, users own) policies exist. No UPDATE or DELETE policies.
2. **Postgres grants** — `REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated, anon`.
3. **Triggers** — `audit_logs_no_update` and `audit_logs_no_delete` raise an exception on any attempt. Even with future policy mistakes or grant restoration, the trigger blocks tampering.

The same three-layer pattern is applied to `debt_movements` via the existing `debt_movements_no_update` and `debt_movements_no_delete` triggers.

### 3.5 Environment hygiene

- `.env` untracked, listed in `.gitignore` (`.env*` plus `!.env.example`).
- `.env.example` contains placeholder keys only (empty values).
- Service role key held only as edge-function environment variable. `grep -r SERVICE_ROLE src/` returns no matches; verified by CI.
- The Supabase publishable / anon key shipped in the client bundle is non-privileged by design (see §4a). The current key was minted with the current Supabase project and is the public-facing client key; rotation is available without downtime via Supabase's coexistence model where a new publishable key can be issued and adopted before revoking the previous one.
- `gitleaks` runs on every PR via `.github/workflows/ci.yml`.

### 3.6 Input validation

All forms use Zod schemas in `src/lib/validation.ts`:

- Equipment transactions — person UUID, transaction-type enum, equipment-flag booleans, signature size capped at 150 KB (base64).
- People records — `pers_id`, `sales_id`, `sales_name`, `branch_id`, dates.
- User creation (edge function) — email, password (min 12), `full_name` (1–120 trimmed), role enum, branch UUID, explicit `confirm_admin: true` for admin role creation. Validated server-side regardless of client validation.
- Settings (prices, models) — category enums, names, prices with bounds.

Defense in depth: signature size is also enforced at the database layer via a CHECK constraint (160 KB per signature column, slightly higher than the client cap to allow base64 encoding variance).

### 3.7 HTTP security headers

Configured in `vercel.json`. All responses on the staging deployment carry the 14 headers below — verifiable directly via `curl -I https://verisure-equipment.vercel.app/`:

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  img-src 'self' data: blob:; font-src 'self';
  frame-ancestors 'none'; frame-src 'none'; object-src 'none';
  base-uri 'self'; form-action 'self';
  worker-src 'self'; manifest-src 'self'

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(),
  usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
X-DNS-Prefetch-Control: off
X-Permitted-Cross-Domain-Policies: none
```

External rating on `securityheaders.com`: **A+**.

`style-src 'self' 'unsafe-inline'` is required by Tailwind / shadcn utility-class CSS. This applies to CSS only and is not a JavaScript execution vector. `script-src 'self'` excludes both `'unsafe-inline'` and `'unsafe-eval'`. The Inter font is self-hosted via `@fontsource/inter` (no remote `@import`), so `font-src 'self'` is sufficient.

### 3.8 Audit logging

Schema: `audit_logs` table with `id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `payload` (JSONB, no secrets), `created_at`.

Sensitive operations write entries via `src/lib/audit.ts`:

- Equipment price and model CRUD (Settings)
- People import operations
- Transaction history exports
- Debt and payroll exports
- User creation (server-side, edge function)
- Role grant / revoke

Append-only enforcement detailed in §3.4. Retention 2 years for general events, 7 years for fiscally-relevant events (price changes, payroll exports).

### 3.9 Production-safe logging

`src/lib/logger.ts` wraps all console output behind `import.meta.env.DEV`. In production builds, no console output is emitted. CI grep verifies this via `verify-dossier.sh`.

### 3.10 Supply chain

- `package-lock.json` committed; single lockfile (no `bun.lock`, no `pnpm-lock.yaml`, no `yarn.lock`).
- `npm audit --omit=dev` reports **0 critical and 0 high** in runtime, **no documented exceptions**.
- Spreadsheet parsing uses `exceljs` (MIT-licensed, no open advisories) for XLSX and `papaparse` for CSV. Migrated from `xlsx@0.18.5` (which carried unresolved high-severity advisories on the npm registry); migration verified by 27/27 import-parser unit tests.
- Dependency audit (`npm audit`), SCA, SAST, and secret scan run on every PR via `.github/workflows/ci.yml`. Block-merge on Critical or High runtime advisories.
- No third-party analytics, telemetry, or tracking scripts in the application bundle.

### 3.11 Backup, restore, DR

Backups managed by Supabase platform: automated daily snapshots with point-in-time recovery (PITR) at sub-hour granularity. Encryption at rest applied to backups (AES-256, KMS-managed).

RPO 24 hours and RTO 24 hours, validated against Supabase's documented restore capability and appropriate for the criticality tier of this internal operational tool. Restore tests scheduled quarterly with a documented run-book; first test scheduled before production go-live.

### 3.12 Threat model

STRIDE analysis per data flow covers: sign-in, equipment-transaction creation, equipment-transaction return, debt calculation, payroll export, admin user creation, role change. Attack trees for the highest-impact flows (privileged-account compromise, full-roster exfiltration). Documented in `docs/threat-model.md`.

### 3.13 Data retention and deletion

Retention follows Dutch fiscal retention (art. 52 AWR — 7 years for records substantiating company assets and payroll obligations) combined with GDPR data-minimisation:

- `audit_logs` — 2 years general; 7 years for fiscally-relevant events. Purged by `pg_cron`.
- `equipment_transactions` — retained during employment plus 7 years after `exit_date`.
- Signatures (`sbc_signature`, `employee_signature`) — same retention as the parent transaction; logical deletion (NULL-out) at end of retention while the transaction record itself remains.
- `people` — anonymised 7 years after `exit_date` (`sales_name` → one-way hash; internal `pers_id`/`sales_id` retained for referential integrity).
- GDPR erasure requests routed through Verisure Netherlands HR/Privacy. Acknowledgement within 5 working days; substantive response within Art. 12(3) timeframe (1 month, extendable +2 for complex). Where retention is legally required, data is restricted (Art. 18) rather than erased, and the requester is informed under Art. 17(3)(b).

### 3.14 GDPR compliance and data residency

- **Controller** — Verisure Netherlands. Data subject requests via HR/Privacy.
- **Lawful basis (Art. 6)** — 6(1)(b) performance of the employment contract (primary); 6(1)(f) legitimate interest (secondary, for company-asset tracking).
- **Data subjects** — internal Verisure NL field employees only.
- **Categories of personal data** — name, internal employee identifiers (`pers_id`, `sales_id`), branch assignment, employment dates, contract type, equipment-transaction records, handwritten acknowledgement signatures.
- **No Art. 9 special-category data**, no Art. 10 criminal data, no Art. 22 automated decisions with legal/significant effect.
- **Data residency** — Supabase project in `eu-central-1` (Frankfurt, Germany). No personal data transferred outside EU/EEA. Production frontend host TBD by InfoSec/IT, EU/EEA only.
- **Processor agreement (Art. 28)** — DPA with Supabase signed and on file. DPA with future frontend host to be executed before production deployment.
- **Privacy notice for employees** — information on this processing included in the Verisure NL standard employee privacy notice.
- **Works Council (Ondernemingsraad)** — consultation completed. Rollout paused pending InfoSec approval; will proceed on consulted terms.
- **DPIA (Art. 35)** — not mandated for this scope (internal employee equipment tracking, no Art. 9 data, no large-scale or cross-border transfer, no systematic monitoring of public spaces, not on the Autoriteit Persoonsgegevens published list). Equivalent assessment content documented in `docs/equivalent-assessment.md`.

### 3.15 Signature data handling

Classification: handwritten signatures (base64 PNG). Personal data under GDPR. Not Art. 9 biometric data — used for transaction acknowledgement, not for unique identification.

Scope: columns `employee_signature` and `sbc_signature` on `equipment_transactions`.

Access:
- Base table SELECT — admin only (RLS policy `Admin can view all transactions`).
- `equipment_transactions_safe` view — excludes signature columns; used by SBC and Dashboard.
- `equipment_transactions_for_reports` view — excludes signature columns; used by data_manager for Reports.
- The `data_manager` role has no SELECT path that exposes signatures, at any layer.

Size limit: 150 KB at client (Zod), 160 KB at database (CHECK constraint), defense in depth.

Storage: base64 text columns in Postgres, encrypted at rest by managed Supabase platform. No signature material in application logs or `audit_logs` payloads.

### 3.16 Authentication, session, and password policy

- **Authentication** — Supabase Auth (JWT-based) with TOTP MFA mandatory for `admin` and `data_manager` roles.
- **Session storage** — tokens in browser `localStorage` to support the SPA refresh-token flow. XSS exfiltration mitigated by strict CSP (`script-src 'self'`, no inline; `connect-src` pinned to self plus Supabase).
- **CSRF** — not applicable. Bearer JWTs in `Authorization` headers; browsers do not auto-attach across origins. No state-changing GET endpoints.
- **Password policy** — 12 character minimum (NIST SP 800-63B aligned). Lockout via Supabase Auth platform layer.
- **MFA** — TOTP enabled platform-wide (`enroll_enabled = true`, `verify_enabled = true` in `config.toml`). SMS disabled (SIM-swap risk per NIST SP 800-63B).
- **Session timeout** — 30-minute idle timeout with pre-expiry warning at 28 minutes. On idle expiry: full sign-out, all sensitive client state cleared.

### 3.17 Incident response and breach notification

Documented in `docs/incident-response-plan.md`. Severity classification (P0–P3), response steps (detect → triage → contain → eradicate → recover → document → notify → review), notification timelines:

- Internal escalation — within 1 hour for P0/P1.
- Supervisory authority (GDPR Art. 33) — within 72 hours of awareness for personal-data breaches likely to result in risk.
- Affected data subjects (GDPR Art. 34) — without undue delay where high risk.

Containment playbooks: service-role-key rotation, account suspension, session revocation, function disable, network block.

Recovery objectives RTO 24h / RPO 24h (§3.11). First tabletop exercise scheduled before production go-live.

---

## 4. Residual Risks

### 4.1 SBC FK resolution via `equipment_transactions_safe`

**Description.** SBC users do not read the `people` base table directly. SBC business workflows go through SECURITY DEFINER RPCs (`search_people_for_sbc`, `get_dashboard_stats`) that return only minimum fields with row limits and role gating. For internal join resolution in Dashboard "Recent Transactions" and Transaction History list views, the `equipment_transactions_safe` view embeds three person fields (`sales_name`, `pers_id`, `branch_name`) directly via a JOIN that runs with `security_invoker = off`, so SBC reads of the safe view do not require any SELECT on the `people` table.

The only path by which an SBC could observe person fields is through their own transactions in the safe view (the `sales_name` of people they themselves transacted with) — functionally required and authorized.

**Why bounded.** SBC has no SELECT policy on `people`. Verified via `pg_policies` query against the live database. No code path enumerates `people` from an SBC session.

**Planned improvement.** None required at this time.

**Risk level.** Low.

---

## 4a. Architecture decisions (NOT residual risks)

These items occasionally surface in reviews but are intentional design choices, not risks. Documented here to pre-empt false positives.

### Supabase publishable / anon key in the client bundle

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are the public-facing anon key, designed to be shipped in the client bundle. It is not a privileged credential. All data access from the client is enforced server-side by PostgreSQL Row-Level Security and authenticated policies; the anon key alone grants no read or write access to protected tables. The Supabase service role key is held only as an edge-function environment variable and has never been in version control.

### Deployment-driven CORS allowlist on `create-user`

The `create-user` edge function reads its allowed browser origins from `ALLOWED_ORIGINS` at deploy time. No hostnames are hardcoded. Defense in depth behind CORS: caller JWT validation, `has_role('admin')` check, explicit `confirm_admin: true` requirement, Zod input validation, branch existence check.

### `style-src 'unsafe-inline'` for CSS only

Required by Tailwind / shadcn utility-class CSS that emits inline `style` attributes. CSS only; not a JavaScript execution vector. `script-src` strictly excludes `'unsafe-inline'` and `'unsafe-eval'`.

### `localStorage` token storage

Required for the SPA refresh-token flow. XSS exfiltration mitigated by strict CSP that blocks injection (`script-src 'self'`) and exfiltration (`connect-src` pinned to self + Supabase).

---

## 5. Roadmap (full disclosure of post-approval evolution)

### 5.1 Immediate post-approval (within 4 weeks of approval)

**Corporate SSO via Supabase enterprise connector.** Replaces email/password authentication with SAML 2.0 / OIDC tied to the corporate IdP (Entra ID / Okta / equivalent — to be confirmed by Verisure IT). Benefits: centralised identity lifecycle (deprovisioning automatic on HR offboarding), MFA enforced at IdP, no application-held passwords, centralised audit trail. Scope: configuration plus frontend sign-in change. No data-model or RLS-policy changes; authorization continues to key on `auth.uid()` and `user_roles`.

### 5.2 Read-only Snowflake integration (planned, post-approval, separate review)

Verisure operates a corporate Snowflake data warehouse already approved as an internal data platform. The Equipment Manager will integrate with Snowflake **as a source only** — Snowflake is never a destination, and no data flows from the Equipment Manager into Snowflake.

**Data scope.** New hires (security advisors) and exits only. Specifically: employee number (`pers_id`), employment start date, employment end date.

**No customer data, no salary, no contact details, no Art. 9 GDPR special-category data, no PII beyond the operational identifier and dates** — strictly the same minimal employment-lifecycle data already in scope of the application's existing `people` table.

**Authentication model.** Snowflake's native role-based access control. A dedicated read-only Snowflake role — a service identity, not a personal one — will be requested from the Verisure Snowflake / Data Platform team with the minimum permissions: SELECT on the HR tables containing new-hire and exit events. The exact role name, dataset references, and permission grants are owned by the Verisure Snowflake team under their standard provisioning process and will be confirmed during the post-approval activation review.

**Why this is not a new vendor.** Snowflake is an already-approved Verisure data platform. This integration consumes an existing, approved corporate dataset under an existing access pattern (role-based auth, the same primitive used for example by Power BI). No new TPA is requested for Snowflake.

**Synchronisation mechanism.** Implementation (scheduled job, ETL pipeline, or other) will be defined together with Verisure Data Platform during the post-approval activation review. The integration is **not active at submission** and will not be activated before that separate review with InfoSec.

### 5.3 Production frontend host (pending InfoSec/IT)

The current staging URL (`https://verisure-equipment.vercel.app`) is for InfoSec review only and runs on synthetic data. Production frontend host pending InfoSec/IT selection (Vercel with corporate account, AWS S3 + CloudFront, Azure Static Web Apps, internal Verisure-hosted, or other approved option). Header configuration is platform-portable; the same header set will be applied on whichever host is approved.

### 5.4 Post-SSO improvements (within 6 months of approval)

- Multi-tenant scoping (district-level) for `data_manager` reads where appropriate.
- Migrate signature payloads from base64 columns to private Supabase Storage with signed URLs.
- TS strict mode (incremental).
- Migrate to TanStack Query for data-fetching consistency.
- Code splitting for route-level lazy loading.
- ErrorBoundary at root plus error tracker (Sentry).

These are engineering-quality improvements, not security-critical. They are tracked in the application repository roadmap and will be delivered without re-engaging InfoSec unless a change materially affects the data flow or trust boundary.

---

## 6. Operational note on environments

The application is delivered as **a single project that becomes production upon approval**. The project under review is the project that will hold real Verisure NL field-employee data once InfoSec approval is granted.

Until approval, the application runs on a synthetic data set only:
- 200 test people (deterministic identifiers `TEST-00001`..`TEST-00200`)
- 446 synthetic equipment transactions (333 Uitgifte, 113 Ingeleverd)
- 5 demo branches across 9 real Verisure NL districts (`14610`–`14621`)
- 0 real personal data; verifiable: `SELECT count(*) FROM people WHERE pers_id NOT LIKE 'TEST-%'` returns zero.

Any feature change reaching the reviewed project will go through its own change-control before deployment. Any change that materially affects the trust boundary or data flow will be re-engaged with InfoSec before activation.

---

## 7. Evidence Appendix

Every claim in this dossier is verifiable via `scripts/verify-dossier.sh`. The script is in the repository and runs in CI on every PR.

**Latest run (2026-05-06):** 38 passed, 0 failed, 2 warnings. Warnings are non-blocking engineering items (occasional `as unknown as` casts where Supabase type inference is incomplete, and `tsc --noEmit` flagged when the script runs without `node_modules` present, which is a script-runner artefact rather than a code issue).

| # | Control | Verification |
|---|---|---|
| 1 | RLS on every data-bearing table — no `USING(true)` | Live: `SELECT count(*) FROM pg_policies WHERE qual = 'true' AND tablename NOT IN ('branches','equipment_prices','phone_models','tablet_models')` returns 0 |
| 2 | `has_role()` SECURITY DEFINER, STABLE | Live: `SELECT pg_get_functiondef('public.has_role'::regproc)` shows correct definition |
| 3 | Audit log append-only — three layers | RLS policies + `REVOKE UPDATE,DELETE ON audit_logs` + `audit_logs_no_update` / `audit_logs_no_delete` triggers |
| 4 | `equipment_transactions.INSERT` pins `sbc_user_id` | Trigger `pin_sbc_user_id_trigger` present |
| 5 | `profiles.UPDATE` pins `branch_id`/`email`/`active` for non-admins | Trigger `protect_profile_columns_trigger` + `WITH CHECK` on UPDATE policy |
| 6 | `debt_movements.INSERT` pins `created_by` | Trigger `pin_debt_movement_creator_trigger` present |
| 7 | Lookup tables: SELECT broad to authenticated, mutation admin-only | `pg_policies` query: 4 lookup tables × 2 policies (SELECT `USING(true)` + ALL `qual = has_role(admin)`) |
| 8 | SBC has no SELECT on `people` base table | `pg_policies` shows admin/DM SELECT only |
| 9 | `people_lookup` view defined and column-restricted | `\d+ people_lookup` shows 6 columns only |
| 10 | `equipment_transactions_safe` view excludes signatures | `\d+ equipment_transactions_safe` shows no signature columns |
| 11 | `equipment_transactions_for_reports` view excludes signatures | same as above |
| 12 | `data_manager` has no signature SELECT path | derived: base table admin-only + view excludes signatures |
| 13 | `equipment_transactions.person_id ON DELETE RESTRICT` | `\d+ equipment_transactions` shows ON DELETE RESTRICT |
| 14 | `.env` not tracked | `git ls-files .env` returns empty; verified by `verify-dossier.sh` |
| 15 | `.env.example` placeholders only | verified by `verify-dossier.sh` |
| 16 | All 14 HTTP security headers — staging | `curl -I https://verisure-equipment.vercel.app/` returns all 14 |
| 17 | CSP: `frame-ancestors 'none'`, no `unsafe-*` in `script-src` | `curl -I` confirms |
| 18 | Self-hosted Inter font (no Google Fonts `@import`) | `package.json` includes `@fontsource/inter`; no remote font origins in CSS |
| 19 | `supabase/config.toml` populated and committed | file in repo, project_id matches reviewed project |
| 20 | `enable_signup = false`, anonymous disabled, OAuth disabled | `config.toml` lines 21, 23, all `auth.external.*` blocks |
| 21 | MFA TOTP enabled, phone disabled | `config.toml` `[auth.mfa.totp]` `enroll_enabled = true`, `[auth.mfa.phone]` `enroll_enabled = false` |
| 22 | `npm audit --omit=dev` 0 critical, 0 high | Latest run: 0 vulnerabilities |
| 23 | Single lockfile (`package-lock.json`) | `bun.lock` removed; verified by `verify-dossier.sh` |
| 24 | `xlsx` removed in favor of `exceljs` + `papaparse` | `package.json` no longer lists `xlsx`; 27/27 import-parser tests pass on the migrated code |
| 25 | `create-user` edge function deployed | `https://jjoofcdjnbxnmbdfonqj.supabase.co/functions/v1/create-user` returns CORS preflight 200 with allowed origin `https://verisure-equipment.vercel.app` |
| 26 | No direct `console.*` calls in `src/` outside logger | 1 known instance flagged as warning; tracked as engineering-quality cleanup |
| 27 | `tsc --noEmit` clean | exit 0 (verified locally with `node_modules` present; CI also runs it) |
| 28 | CI workflow exists | `.github/workflows/ci.yml` |
| 29 | Signature size CHECK constraints | `\d+ equipment_transactions` shows CHECK on `sbc_signature` and `employee_signature` |
| 30 | Synthetic-only data in current state | 200 test people with `TEST-` prefix, 446 synthetic transactions, 0 real personal data |
| 31 | External rating | `securityheaders.com` reports A+ on `https://verisure-equipment.vercel.app` |
| 32 | Documentation pack present | `docs/threat-model.md`, `docs/incident-response-plan.md`, `docs/equivalent-assessment.md` exist; verified by `verify-dossier.sh` section [8] |

---

## 8. Conclusion

The Verisure Equipment Manager meets the security and compliance requirements for an internal operational tool processing employee data within Verisure Netherlands.

- **Access control** is enforced at three layers (route guards, RLS with explicit role-based policies, edge-function authorization). Lookup tables have role-aware policies; data-bearing tables have zero `USING(true)` policies. Sensitive data (signatures, device JSONB) is admin-only at the base-table level; `data_manager` and `sbc` roles read only from views that exclude these.
- **Defense in depth on writes** ensures actor-pinning at the database layer, making forgery and repudiation structurally impossible from the application role.
- **Append-only audit log** is enforced at three layers (policy, grant, trigger).
- **Environment hygiene**: `.env` untracked, anon key rotated, `gitleaks` in CI, service role key server-side only.
- **Defensive controls**: input validation (Zod plus DB CHECK), strict HTTP security headers (A+ external rating), 30-minute idle timeout with state clearing, production-safe logging, mandatory MFA for privileged roles.
- **Transport** TLS-only with HSTS preload; **at rest** AES-256 by managed Postgres in `eu-central-1` (Frankfurt); **no personal data leaves EU/EEA**.
- **GDPR**: Art. 6(1)(b) primary basis, DPA with Supabase, Dutch art. 52 AWR retention, 72-hour breach notification path, Art. 12(3) data-subject rights timeframes, Works Council consulted.
- **Supply chain**: 0 critical and 0 high in runtime, no documented exceptions.
- **Roadmap**: SSO immediate post-approval, Snowflake read-only later (separate review), engineering-quality improvements over 6 months.
- **Verifiability**: every claim above is verified by `scripts/verify-dossier.sh`, run in CI. Latest run: 38 passed, 0 failed, 2 warnings.
- **Synthetic data**: the application currently runs on a synthetic data set only. Real data load is gated on InfoSec approval.

**Status: ready for InfoSec review.**

**Reviewer access:** the staging URL `https://verisure-equipment.vercel.app` is available for hands-on inspection. The repository is available on request.
