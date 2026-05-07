# Equivalent Assessment — DPIA Threshold and Documentation

**Application:** Verisure Equipment Manager (Netherlands)
**Document purpose:** demonstrate that, while a formal Data Protection Impact Assessment (DPIA) per GDPR Art. 35 is not mandated for this processing scope, the equivalent risk-assessment content has been produced and is on file with Verisure NL.
**Last reviewed:** 2026-05-06
**Owner:** Pedro Ciordia, System Owner
**Reviewer (intended):** Verisure NL HR/Privacy / DPO

---

## 1. DPIA threshold analysis

GDPR Art. 35(1) requires a DPIA where processing is "likely to result in a high risk to the rights and freedoms of natural persons". Art. 35(3) lists three triggers, and the European Data Protection Board (WP248 rev.01) lists nine criteria; processing meeting two or more is generally subject to a DPIA. The Dutch Autoriteit Persoonsgegevens publishes a list of processing operations always requiring a DPIA.

| Trigger / criterion | Applicable to this processing? | Justification |
|---|---|---|
| **Art. 35(3)(a)** Systematic and extensive evaluation including profiling with significant effects | No | No automated decision-making with legal/significant effect (Art. 22). Debt and payroll calculations are deterministic arithmetic on signed receipts; outcomes are verified by humans before any payroll deduction |
| **Art. 35(3)(b)** Large-scale processing of Art. 9 (special categories) or Art. 10 (criminal) data | No | No special-category data and no criminal-conviction data |
| **Art. 35(3)(c)** Systematic monitoring of publicly accessible areas on a large scale | No | No monitoring of public spaces |
| **WP248** Evaluation or scoring | No | No scoring of behavior, location, or any other personal aspect |
| **WP248** Automated decision-making with legal or similar significant effect | No | All decisions reviewed by humans |
| **WP248** Systematic monitoring | No | The application records discrete equipment-handout events; it does not continuously monitor employees |
| **WP248** Sensitive data or data of a highly personal nature | No | Operational employee identifiers, dates, and equipment receipts only |
| **WP248** Data processed on a large scale | No | ~4,000 internal Verisure NL field employees; not "large-scale" by the WP248 examples (which reference national-scale or cross-border processing) |
| **WP248** Matching or combining datasets | No | The application does not combine datasets from different sources. The planned post-approval Snowflake integration (§5.2) will source new-hire/exit deltas only — not a matching operation in the WP248 sense |
| **WP248** Data concerning vulnerable data subjects | No | Adult employees, not vulnerable data subjects |
| **WP248** Innovative use or technology | No | Standard web application stack with established security controls |
| **WP248** When the processing in itself prevents data subjects from exercising a right or using a service or contract | No | The application supports the employment contract; it does not prevent rights or services |
| **AP NL list** of processing operations always requiring DPIA | Not on the list | Verified against the AP-published list (last consulted at the date above) |

**Conclusion:** the processing **does not meet the WP248 threshold** (zero criteria met) and is not on the AP NL mandatory-DPIA list. A formal DPIA is therefore **not mandated**.

---

## 2. Equivalent assessment content

Notwithstanding the above, the equivalent content of a DPIA is documented across this submission. The following table maps each DPIA section (per Art. 35(7)) to where the content lives.

| DPIA section (Art. 35(7)) | Where it is documented |
|---|---|
| (a) Systematic description of the envisaged processing operations and the purposes of the processing | Dossier §1 (Executive Summary); §3.14 (GDPR compliance & data residency); §6 (Operational note on environments) |
| (b) Necessity and proportionality assessment in relation to the purposes | Below, §3 of this document |
| (c) Risks to rights and freedoms of data subjects | Threat model (`docs/threat-model.md`) — DF-1 to DF-7 STRIDE analysis + AT-1, AT-2 attack trees; dossier §4 residual risks |
| (d) Measures envisaged to address the risks, including safeguards, security measures, and mechanisms to ensure protection of personal data and to demonstrate compliance | Dossier §3 (entire section: 17 control areas), §3.13 (retention), §3.17 (incident response); incident response plan (`docs/incident-response-plan.md`) |

---

## 3. Necessity and proportionality

### Necessity

The processing is necessary for the performance of the employment contract (GDPR Art. 6(1)(b)). Verisure NL provides equipment to its field employees; the application records the issue and return of that equipment, the condition on return, and the financial reconciliation if equipment is not returned. Without this processing, Verisure NL cannot:

- Demonstrate that company assets were issued under the employment policy;
- Reconcile equipment-related debts at termination of employment;
- Comply with Dutch fiscal retention obligations (art. 52 AWR) for records substantiating company assets and payroll obligations.

### Proportionality

Data minimisation per Art. 5(1)(c) is enforced at the data model:

- **No customer data**, no salary, no contact details, no Art. 9 special-category data, no Art. 10 criminal data.
- **Employee data is restricted to operational identifiers and dates**: name, internal identifiers (`pers_id`, `sales_id`), branch assignment, employment start/exit dates, contract type.
- **Signatures** are limited in size (150 KB Zod cap, 160 KB DB CHECK), retained only as long as the parent transaction, and accessible only to admin role.
- **Roles** restrict what each user sees: SBC sees only own transactions; data_manager sees no signatures; admin alone has full visibility.
- **Retention** anchored to the legal minimum (Dutch art. 52 AWR — 7 years post-`exit_date`), with anonymisation thereafter (`sales_name` → one-way hash; identifiers retained for referential integrity only).

Less-intrusive alternatives considered and rejected:

- **Paper records:** rejected. They do not provide equivalent fiscal traceability, are vulnerable to physical loss, and create more, not fewer, GDPR risks (lack of access control, inability to honour erasure or rectification within Art. 12(3) timelines).
- **Off-the-shelf tool without RLS or audit log:** rejected. Equivalent functionality without the security depth.
- **Minimal MoreApp form-only flow (current state):** the predecessor process. Rejected because of repeated reconciliation failures, untracked returns, and delayed debt recovery — the very reasons this application was commissioned.

The chosen approach is proportionate: it implements the minimum data set necessary for the legitimate purpose, with strong technical and organisational safeguards.

---

## 4. Consultation

- **Verisure NL HR/Privacy:** kept informed. Privacy notice update covering this specific processing in scope.
- **Works Council (Ondernemingsraad):** consultation completed. Rollout paused pending InfoSec approval.
- **Data Protection Officer (where applicable):** dossier and this assessment shared on request.
- **InfoSec:** this submission.
- **Data subjects:** information provided through the standard Verisure NL employee privacy notice; this application's processing is described with reference to its purposes, lawful basis, retention, and rights-exercise channel.

---

## 5. Conclusion

A formal DPIA is not mandated for this processing scope under Art. 35(3), WP248 rev.01, or the Dutch AP published list. The equivalent assessment content — systematic description, necessity-and-proportionality analysis, risk register, and safeguards register — is fully documented in this submission and is available for review.

A DPIA will be promptly opened if any of the following occur:

- Scope expansion that introduces Art. 9 or Art. 10 data;
- Scope expansion to include monitoring (e.g., GPS tracking of equipment in use);
- Scope expansion to include automated decision-making with legal or significant effect;
- Material changes to the data subjects, processing purposes, or trust boundaries.
