# Verisure Equipment Manager (Netherlands)

Internal web application for tracking equipment handouts and returns for Verisure Netherlands field employees.

**Status:** ready for InfoSec review (synthetic data only; production data load gated on approval).

**Staging URL (for InfoSec review):** https://verisure-equipment.vercel.app

---

## Documentation

For Information Security review, the primary document is **[`SECURITY_DOSSIER.md`](./SECURITY_DOSSIER.md)** — full security review covering architecture, access model, controls, residual risk, roadmap, and evidence appendix.

Supporting documents:

- **[`INFOSEC_COVER_MESSAGE.md`](./INFOSEC_COVER_MESSAGE.md)** — executive cover summary.
- **[`docs/threat-model.md`](./docs/threat-model.md)** — STRIDE per data flow + attack trees.
- **[`docs/incident-response-plan.md`](./docs/incident-response-plan.md)** — severity classification, response phases, GDPR Art. 33–34 timelines.
- **[`docs/equivalent-assessment.md`](./docs/equivalent-assessment.md)** — DPIA threshold analysis and equivalent-assessment content.

Every claim in the dossier is verified by **[`scripts/verify-dossier.sh`](./scripts/verify-dossier.sh)**, which runs in CI on every PR.

---

## Stack

- React 18 + TypeScript + Vite 5
- Tailwind CSS v3 + shadcn/ui
- Supabase (managed PostgreSQL + Auth + Edge Functions, region `eu-central-1`)
- exceljs + papaparse for spreadsheet parsing

---

## Application roles

| Role | Scope |
|---|---|
| `admin` | Full access |
| `data_manager` | Reports, people management, debt/payroll calculations |
| `sbc` | Dashboard, equipment form (own transactions), transaction history (own records) |

---

## Reviewer access

The staging URL above is configured for hands-on inspection. HTTP security headers can be verified directly:

```bash
curl -I https://verisure-equipment.vercel.app/
```

External rating: **A+ on securityheaders.com**.

For credentials or any other reviewer needs, contact:

- **System Owner:** Pedro Ciordia (Verisure NL)
- **Business Owner:** Rodrigo Cocco Parise — rodrigo.cocco@verisure.nl

---

## Notes for developers

- `.env` is untracked. See `.env.example` for required variables.
- `package-lock.json` is the single lockfile.
- All schema changes go through migrations under `supabase/migrations/`.
- Roles are stored in the `user_roles` table; never on `profiles`. Role checks use the `has_role(auth.uid(), role)` SECURITY DEFINER function.
- Sensitive operations write to `audit_logs` via `src/lib/audit.ts`. The table is append-only at three layers (RLS + Postgres grants + triggers).

This codebase is internal to Verisure NL. Not open source.
