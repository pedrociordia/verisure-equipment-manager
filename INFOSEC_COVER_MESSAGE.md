# Cover message for InfoSec — ready to copy

---

**Subject:** Application security review — Verisure Equipment Manager (Netherlands)

Hi [InfoSec contact],

I'm submitting the security documentation pack for the Verisure Equipment Manager, our internal equipment-tracking application for Verisure Netherlands.

**What the application does**

Tracks equipment handouts and returns for field employees: employee records, equipment transactions, debt calculations, payroll-deduction reporting. Internal use only, role-based access (`admin`, `data_manager`, `sbc`). Internal employee data only — no customer data, no GDPR Art. 9 special-category data.

**Live staging for review**

https://verisure-equipment.vercel.app — running on synthetic data only (200 test people, 446 synthetic transactions, 5 demo branches across 9 real Verisure NL districts). Real personal data will be loaded only after your approval.

External rating: **A+ on securityheaders.com** (you can verify directly: `curl -I https://verisure-equipment.vercel.app/`).

**What's in the pack**

- `SECURITY_DOSSIER.md` — full dossier covering architecture, access model, all security controls, residual risk, roadmap, evidence appendix.
- `scripts/verify-dossier.sh` — automated evidence verification. Every claim in the dossier is verified against the live system; runs in CI on every PR. Latest run: **38 passed, 0 failed, 2 warnings** (warnings are non-blocking engineering-quality items).
- Threat model (STRIDE per data flow).
- Equivalent-assessment document covering DPIA threshold analysis.
- Sub-processor list with regions and DPA status.

**Key controls in place**

- PostgreSQL Row-Level Security with explicit role-based policies on every data-bearing table; no `USING(true)` permissive defaults. Lookup tables (catalogs) carry role-aware policies (broad SELECT for form population, mutation admin-only).
- Three views (`equipment_transactions_safe`, `equipment_transactions_for_reports`, `people_lookup`) and four `SECURITY DEFINER` RPCs scope what each role can read. SBC has no SELECT on the `people` base table; `data_manager` has no SELECT path that exposes signatures.
- BEFORE INSERT/UPDATE triggers pin `auth.uid()` to actor columns (`sbc_user_id`, `created_by`) and prevent self-elevation of profile attributes (`branch_id`, `email`, `active`). Identity forgery and scope escalation are structurally impossible from the application role.
- `audit_logs` enforced append-only at three layers (no UPDATE/DELETE policies, REVOKE at Postgres-grant level, BEFORE UPDATE/DELETE blocking trigger).
- 14 HTTP security headers (strict CSP `script-src 'self'` no inline / no remote, HSTS preload, X-Frame-Options DENY, COOP/CORP same-origin, Permissions-Policy disabling sensors, Cache-Control no-store).
- Mandatory TOTP MFA for `admin` and `data_manager`; password floor 12; 30-minute idle timeout with full client-state clearing; JWT 1h with refresh-token rotation.
- Zod input validation on all forms; signature size capped at client and database (CHECK constraint).
- `npm audit --omit=dev`: 0 critical, 0 high in runtime, **no documented exceptions**. Spreadsheet parsing migrated from `xlsx` to `exceljs` + `papaparse`.
- Production-safe logging (zero console output in production). Service role key held server-side only (edge function env var); never in version control.
- `supabase/config.toml` under version control: signup disabled, anonymous disabled, all OAuth providers disabled, MFA TOTP enabled, JWT 1h, rate limits explicit.

**Residual risk (one, low)**

§4.1 — SBC FK resolution. SBC clients never read the `people` base table directly (no SELECT policy). Person fields needed by the Dashboard "Recent Transactions" and Transaction History list views (`sales_name`, `pers_id`, `branch_name`) are embedded in the `equipment_transactions_safe` view via a join executed with `security_invoker = off`. The only person fields an SBC can observe through this view are those of people they themselves transacted with — functionally required and authorized. Risk level: Low.

**Architecture notes (for clarity, not risks)**

- The Supabase publishable / anon key shipped in the client bundle is non-privileged by design. All data access is enforced server-side by RLS and authenticated policies. The service role key is held only as edge-function environment variable.
- The `create-user` edge function reads its CORS allowlist from `ALLOWED_ORIGINS` at deploy time. Defense in depth behind CORS: caller JWT validation, role check, explicit `confirm_admin: true` for admin role creation, Zod validation, branch existence check.

**Compliance posture**

- **Data controller**: Verisure Netherlands. Data subject requests via Verisure NL HR/Privacy.
- **Lawful basis (GDPR Art. 6)**: 6(1)(b) performance of the employment contract; 6(1)(f) legitimate interest as secondary.
- **Data residency**: Supabase project in `eu-west-1` (Dublin, Ireland). Frontend hosted on Vercel EU region. No personal data leaves EU/EEA.
- **Hosting ownership (development environment)**: the application currently runs on a dedicated Supabase organization (`verisure-equipment-dev`, Pro Plan, `eu-west-1` / Dublin) and a dedicated Vercel team (Pro Plan), both under the System Owner's control. Supabase Pro includes a 99.9% uptime SLA and daily backups with 7-day retention. This is deliberate for the development and InfoSec review phase. On approval, we will initiate corporate procurement with Verisure IT to provision Verisure NL-owned Supabase and Vercel accounts under Verisure NL DPAs, with plan tiers agreed with InfoSec and a controlled migration of codebase and data. Until that point, the environment contains synthetic data only.
- **Processor agreements (Art. 28)**: DPA with Supabase signed and on file for the current development organisation; available on request. The Verisure NL ↔ Supabase DPA (and Vercel equivalent) will be executed as part of the corporate-account migration above, prior to any real-personal-data load.
- **Retention**: audit logs 2 years general, 7 years for fiscally-relevant; equipment transactions and signatures retained during employment plus 7 years post-`exit_date` per Dutch art. 52 AWR.
- **Breach notification**: 72-hour process to the Autoriteit Persoonsgegevens, GDPR Art. 33–34.
- **HR / Works Council (Ondernemingsraad)**: consultation completed.
- **DPIA (Art. 35)**: not mandated for this scope; equivalent assessment content documented.

**Roadmap (full disclosure, see dossier §5)**

1. **Infrastructure ownership migration to Verisure NL corporate accounts** (pre-production, see dossier §5.0). Provisioning of Verisure NL-owned Supabase and Vercel accounts under Verisure NL DPAs, with plan tiers and region (EU/EEA only, `eu-west-1` baseline) agreed with InfoSec. Codebase and configuration transferred under corporate governance. No real personal data is loaded until this migration completes. This precedes the SSO migration below.
2. **Corporate SSO via Supabase enterprise SAML/OIDC connector**, within 4 weeks of approval. Replaces email/password entirely.
3. **Read-only Snowflake integration** (post-approval, separate review). Source-only, role-based authentication (service identity, not personal — same access pattern Verisure already uses for Power BI). Data scope strictly limited to new hires and exits: employee number plus employment start/end dates. No customer data, no salary, no contact details, no Art. 9 GDPR special-category data. Snowflake is an already-approved Verisure data platform; no new TPA is requested for it.
4. **Engineering-quality improvements** (TS strict, TanStack Query, code splitting, Sentry, signature storage migration) over 6 months. Not security-critical; tracked in the application repository roadmap.

**Operational note**

The application is delivered as a single project that becomes production upon approval. The project under review is the project that will hold real Verisure NL field-employee data once approval is granted. Until then it runs on synthetic data only.

We would appreciate your review. Happy to walk through any section, schedule a 30-minute call, or answer questions in writing.

Best regards,
Pedro Ciordia
System Owner, Verisure Equipment Manager
