# Incident Response Plan — Verisure Equipment Manager

**Application:** Verisure Equipment Manager (Netherlands)
**Last reviewed:** 2026-05-06
**Owner:** Pedro Ciordia, System Owner
**Escalation contact:** Verisure NL InfoSec

---

## 1. Purpose

Define how security and personal-data incidents involving the Verisure Equipment Manager are detected, classified, contained, eradicated, recovered from, and reported. Aligned with GDPR Art. 33 (notification to the supervisory authority within 72 hours), Art. 34 (notification to data subjects without undue delay where high risk), and Verisure NL internal incident-handling procedures.

---

## 2. Severity classification

| Level | Definition | Examples | Internal escalation target |
|---|---|---|---|
| **P0 — Critical** | Confirmed exposure of personal data; full or partial loss of confidentiality, integrity, or availability with material business or regulatory impact | Database exposed; admin account compromised with confirmed data exfiltration; RLS bypass live in production | Within 1 hour of detection |
| **P1 — High** | Likely exposure or significant control failure not yet confirmed to have produced loss | Suspected admin account compromise; service-role key potential exposure; unauthenticated endpoint discovered | Within 1 hour of detection |
| **P2 — Medium** | Control degradation without immediate exposure | Audit log gap; CI security check disabled; CSP bypass discovered without exploitation evidence | Within same business day |
| **P3 — Low** | Hygiene findings or non-exploitable issues | Dependency advisory in dev tooling only; verbose error message; non-sensitive log leak | Tracked in backlog, no escalation |

Reclassification is allowed at any time as evidence evolves. Initial classification is conservative (higher rather than lower).

---

## 3. Response phases

### 3.1 Detect

Detection sources, in order of likelihood:

1. **User report** (admin or operator notices unexpected behaviour).
2. **Supabase platform alert** (auth anomaly, query rate spike, function error spike).
3. **Frontend host alerts** (Vercel availability, error rate, anomalous traffic).
4. **CI/CD security checks** (gitleaks, npm audit, Semgrep on every PR).
5. **External notification** (Verisure NL InfoSec, an employee, a third party).

Internal application audit logs (`audit_logs` table) support forensic reconstruction of privileged actions but are not real-time detection.

### 3.2 Triage

Within 30 minutes of detection (P0/P1) or same business day (P2):

- Confirm the incident (rule out false positive).
- Classify severity per §2.
- Identify likely scope (which roles, which tables, which time window).
- Decide whether to involve Verisure NL InfoSec, DPO/HR, and Supabase Support.
- Open an incident record (internal ticket).

### 3.3 Contain

Containment actions available, by category:

| Category | Action | Performed by |
|---|---|---|
| Credential | Rotate Supabase service role key | Admin (`supabase secrets set`) |
| Credential | Rotate publishable / anon key | Admin (Supabase dashboard) |
| User account | Suspend a user | Admin (Supabase Auth admin API) |
| User account | Force-revoke all sessions | Admin (Supabase Auth admin API) |
| Function | Disable a specific edge function | Admin (deploy controls or remove function) |
| Database | Enable read-only mode (in extremis) | Supabase Support escalation |
| Network | Tighten `ALLOWED_ORIGINS` on `create-user` | Admin (env var update + redeploy) |
| Code | Roll back to last known-good commit | Admin via Vercel deployment console |

Containment is prioritised over preservation of evidence, but actions are timestamped and logged so forensic reconstruction remains possible.

### 3.4 Eradicate

Remove the root cause:

- Patch the vulnerable code path or revert the bad change.
- Remove any malicious accounts or sessions.
- Update RLS policies, triggers, or views as needed.
- Add a regression test where applicable (`scripts/verify-dossier.sh`, vitest unit, etc).

### 3.5 Recover

Restore service:

- Validate the fix in staging (`https://verisure-equipment.vercel.app` or post-cutover production-equivalent).
- Roll forward to production.
- Confirm with affected users that workflows resume.
- Monitor closely for recurrence for at least 24 hours.

Backups: Supabase platform provides point-in-time recovery (PITR) at sub-hour granularity. Restore actions for production are executed under change control with a documented run-book.

### 3.6 Document and Notify

#### Internal

- Incident ticket updated with timeline, root cause, containment actions, and lessons learned.
- This dossier (and §4 residual-risk register) updated where the incident reveals a new permanent risk.

#### External — supervisory authority (GDPR Art. 33)

If the incident is a personal-data breach **likely to result in a risk to the rights and freedoms of natural persons**:

- Notification to the **Autoriteit Persoonsgegevens** (Dutch DPA) within **72 hours of awareness**.
- Notification includes: nature of the breach, categories and approximate number of data subjects, categories and approximate number of personal data records, contact point, likely consequences, measures taken or proposed.
- If full information is not yet available within 72 h, notification is provided in phases without undue delay.

#### External — affected data subjects (GDPR Art. 34)

If the incident is **likely to result in a high risk** to rights and freedoms:

- Notification to affected data subjects without undue delay.
- Notification in clear and plain language: nature of the breach, contact point, likely consequences, measures taken.
- Exceptions (per Art. 34(3)): appropriate technical and organisational measures rendered the data unintelligible (e.g., encryption); subsequent measures eliminated the high risk; disproportionate effort (then a public communication is used).

### 3.7 Review

Within 5 business days of recovery (P0/P1) or 10 business days (P2):

- Post-incident review meeting with all involved stakeholders.
- Documented root-cause analysis (RCA).
- Updates to this plan, the threat model, and `verify-dossier.sh` where applicable.
- Updates to the residual-risk register (dossier §4) where applicable.

---

## 4. Recovery objectives

| Metric | Target | Notes |
|---|---|---|
| **RTO** (Recovery Time Objective) | 24 hours | Internal operational tool. Achievable with Supabase platform PITR + Vercel redeploy |
| **RPO** (Recovery Point Objective) | 24 hours | Sub-hour PITR available, 24 h is the SLA target |

Restore tests scheduled quarterly with a documented run-book. First test scheduled before production go-live.

---

## 5. Roles and responsibilities

| Role | Responsibility |
|---|---|
| System Owner (Pedro Ciordia) | Detect, triage, contain, document, notify InfoSec, lead post-incident review |
| Verisure NL InfoSec | Severity validation; supervisory-authority notification (Art. 33); coordination with Verisure Group security |
| Verisure NL DPO / HR / Privacy | GDPR Art. 33–34 decisions on data-subject notification; legal interpretation |
| Supabase Support (under DPA) | Platform-level containment (read-only mode, restore from backup, deep forensics on platform logs) |
| Verisure NL IT | Frontend host and corporate-network controls (DNS, WAF if present, DLP) |
| Verisure NL HR (in user-account incidents) | Offboarding workflow if the incident is tied to an internal actor |

---

## 6. Communication channels

- Internal incident ticket (Jira/ServiceNow per Verisure NL standard).
- Direct contact with Verisure NL InfoSec via email and corporate IM.
- Supabase Support via the dashboard support channel (Pro plan).
- Out-of-band channels (corporate phone, mobile) for P0 if regular channels are compromised.

---

## 7. First tabletop exercise

A first tabletop exercise covering scenarios: (a) admin account compromise, (b) confirmed RLS bypass, (c) suspected service-role-key exposure — is scheduled before production go-live. Findings will be incorporated into a v1.1 of this plan.
