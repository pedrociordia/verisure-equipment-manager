# Third Party Assurance (TPA) Request — Supabase Inc.

**Solicitante (System Owner):** Pedro Ciordia
**Business Owner:** Rodrigo Cocco Parise — rodrigo.cocco@verisure.nl
**Producto:** Verisure Equipment Manager (Verisure Netherlands)
**Original submission date:** 2026-05-07 (as part of the InfoSec pack to Aranya Rahman, Verisure NL InfoSec)
**Version:** v1.1
**Last updated:** 2026-05-13

---

## Review status update (v1.1)

This TPA was submitted on 7 May 2026 as part of the InfoSec pack to Verisure NL InfoSec. On 12 May 2026 the InfoSec contact recommended completing the corporate STRADA questionnaire as the primary review track; this TPA remains in the documentation pack as the supplier-level reference for Supabase Inc. The substantive answers below were updated for v1.1 to reflect: (a) the actual Supabase region (`eu-west-1`, Dublin), (b) the clarified DPA scope distinguishing the current development environment from the planned Verisure NL corporate account, and (c) a fuller post-approval roadmap disclosure on Q26.

---

## 1. Supplier name
Supabase Inc.

## 2. System Owner Contact
Pedro Ciordia

## 3. Business Owner Contact
Rodrigo Cocco Parise — rodrigo.cocco@verisure.nl

## 4. Supplier product name / services required
Verisure Equipment Manager — internal web application for tracking equipment handouts and returns for Verisure Netherlands field employees. Built on Supabase (managed Postgres, Auth, Edge Functions, EU region `eu-west-1` / Dublin) with a React SPA frontend. Processes internal employee data only; no customer data.

## 5. Service type
☑ **Software – Cloud**

## 6. Describe the product and/or service provided by the supplier
Supabase provides a managed backend-as-a-service platform consisting of: (a) a fully managed PostgreSQL database (with Row-Level Security, backups, and point-in-time recovery available as an add-on on Pro+ plans), (b) Supabase Auth (JWT-based authentication and session management), (c) Edge Functions (serverless TypeScript/Deno runtime used for privileged server-side operations such as user creation), and (d) the Supabase JavaScript client library used by the frontend.

The Verisure Equipment Manager uses Supabase as its sole backend: application data, user accounts, role assignments, and audit logs are all stored in the Supabase-managed Postgres database (EU region, Dublin, Ireland). No self-hosted infrastructure is used.

## 7. How will the service/product be accessed?
☑ **Over the internet**

## 8. Where will Verisure data be stored?
☑ **Supplier Data Center (servers managed by the Supplier)**

## 9. In which location will the information be stored?
☑ **Europe** (Supabase project region: `eu-west-1`, Dublin, Ireland)

## 10. Approximate volume of data/records involved
☑ **1000–10000 records**

## 11. Who will have access to the product/service?
☑ **Verisure staff** (only)

## 12. Approximately how many users are expected to use/access the product?
☑ **Between 100 and 500**

## 13. Is this request…
☑ **To assess a selected new supplier**

## 14. Target signature date
Originally 2026-05-11 (TPA submission window). Current review track is STRADA, target finalisation week of 2026-05-18.

## 15. Business region(s) served
☑ **North**

## 16. Business country(s) served
☑ **NL** (Netherlands only)

## 17. Verisure point of contact
Pedro Ciordia

## 18. Which business area(s) will use the product/service?
☑ **Operations**
☑ **Technology – IT**

## 19. If "Other" was selected, please specify
*(N/A)*

## 20. Supplier point of contact
Supabase Support Team

## 21. Supplier point of contact email
security@supabase.com, privacy@supabase.io, support@supabase.io

## 22. Will the service manage any customer or employee personal data?
☑ **Yes** — employee personal data only (internal Verisure Netherlands field employees). No customer data. No Art. 9 GDPR special-category data.

## 23. Will customer or employee personal data be shared with this supplier?
☑ **Yes** — employee personal data only. Supabase acts as Data Processor (GDPR Art. 28); Verisure Netherlands is the Data Controller.

**Note on current state (development environment):** the application is currently hosted under a dedicated Supabase organization (`verisure-equipment-dev`, Pro Plan, `eu-west-1` / Dublin) controlled by the System Owner. The standard Supabase DPA is in place for this development organisation, and the development environment processes **synthetic data only** — no real personal data of Verisure NL employees is loaded at this stage.

**Note on production state (post-approval):** as part of the post-approval migration documented in `SECURITY_DOSSIER.md` §5.0, corporate procurement will be initiated with Verisure IT to provision a Verisure NL-owned Supabase account, with the **Verisure NL ↔ Supabase DPA executed in Verisure NL's name**, prior to any real personal data being loaded. Plan tier and region (EU/EEA only, `eu-west-1` baseline) will be agreed with InfoSec.

## 24. Will the service manage any payment card data?
☑ **No** — PCI DSS not applicable. No PAN, no CVV, no cardholder data of any kind.

## 25. Will the service manage alarm chain data or impact on alarm chain processes?
☑ **No** — the application has no connection to alarm chain systems, alarm data, or alarm operations. It is a standalone internal equipment-tracking tool.

## 26. Is integration between this supplier and other Verisure systems required?
☑ **No for current scope.** The application is currently standalone; no integration with SAP, Active Directory / Entra ID, HRIS, data warehouse, or any other corporate system.

**Full post-approval roadmap disclosure (per `SECURITY_DOSSIER.md` §5):** to avoid any salami-slicing concern, the planned post-approval evolution of the application includes the following, each gated on additional InfoSec sign-off as appropriate:

1. **Infrastructure ownership migration** — provisioning of Verisure NL-owned Supabase and Vercel accounts with corporate DPAs (see §5.0 of the dossier).
2. **Corporate SSO** — Supabase enterprise SSO connector (SAML 2.0 / OIDC) tied to the Verisure corporate IdP (Entra ID / Okta / equivalent — TBD by Verisure IT).
3. **Snowflake integration (read-only, source-only)** — scoped to new-hire and exit employee data (employee number plus dates), authenticated via a dedicated service role provisioned by the Verisure Snowflake/Data Platform team. No PII beyond what the application already processes; no customer data; no destination writes back to Snowflake. This integration is **out of current scope** and would be submitted under a separate review track.

None of the items above are active integrations today.

## 27. Highest protective marking of Verisure data shared with/processed by the supplier
☑ **C3 – Restricted** (employee personal data: name, internal identifiers, employment dates, equipment transactions, handwritten acknowledgment signatures)

## 28. Type of personal data shared with the supplier
Employee personal data only (internal Verisure Netherlands field employees):
- Full name (`sales_name`)
- Internal employee identifiers (`pers_id`, `sales_id`)
- Branch assignment
- Employment start date and exit date (where applicable)
- Contract type
- Equipment transaction records (device model, serial number, handout/return dates)
- Handwritten acknowledgment signatures (base64 PNG, used as transaction receipt)

**No customer data. No payment card data. No alarm-chain data. No Art. 9 GDPR special-category data** (health, biometric-for-identification, racial/ethnic, political, religious, trade-union, sex-life, genetic).

## 29. How does Verisure share the above information with the supplier?
Data is not "shared" via file transfer or email. Verisure staff (admin and data_manager roles) enter and manage data directly through the web application UI. The application persists data to the Supabase-hosted PostgreSQL database over TLS 1.2+. All data transfers between the browser and Supabase are encrypted in transit (HTTPS); data is encrypted at rest by the managed Supabase platform. No data is sent to Supabase by email, shared drive, or manual file upload. Supabase acts as a Data Processor (GDPR Art. 28) under the executed DPA; Verisure Netherlands retains full control of the data.

## 30. Does the supplier need to access any internal Verisure application?
**No.** Supabase does not require access to any internal Verisure system, network, VPN, or corporate Wi-Fi. The integration is one-way: the Verisure-owned web application connects outbound to the Supabase managed service over public HTTPS. Supabase staff have no inbound access to Verisure infrastructure. Supabase support personnel may access the Supabase-hosted database only for break-fix/support under the DPA and Supabase's internal access controls (documented in their SOC 2 Type II report and Trust Center), never touching Verisure corporate systems.

## 31. Is the supplier going to provide any service or tool that uses AI?
☑ **No** — the supplier (Supabase) provides managed PostgreSQL, authentication, and edge-function runtime; none of these involve AI, ML model inference, or generative AI processing of Verisure data. The application itself contains no AI/ML features, no automated decision-making within the meaning of GDPR Art. 22. Supabase's optional AI features (e.g., `pgvector`, AI-assisted SQL editing) are **not used** in this project.

---

## Supporting documentation (accompanying this TPA submission)

- [SECURITY_DOSSIER.md](SECURITY_DOSSIER.md) — full application security review: architecture, access model, controls, residual risks, GDPR compliance (data controller, lawful basis, retention, breach notification), evidence appendix, infrastructure ownership migration roadmap (§5.0).
- [INFOSEC_COVER_MESSAGE.md](INFOSEC_COVER_MESSAGE.md) — executive cover message for InfoSec summarising the submission.
- Supabase Data Processing Agreement (GDPR Art. 28) — in place for the development environment under the System Owner's organisation; the Verisure NL ↔ Supabase DPA will be executed as part of the corporate-account migration on InfoSec approval, prior to any real-personal-data load.
- Supabase SOC 2 Type II report — available via the Supabase Trust Center.

**Relationship between documents:** this TPA assesses **Supabase as a third-party supplier**; the Security Dossier assesses **the Verisure Equipment Manager application** that uses Supabase as its backend. Both belong to the same InfoSec submission and should be reviewed together.

---

## Document changelog
- v1.0, 2026-05-07 — Initial TPA submission as part of the InfoSec pack to Verisure NL InfoSec.
- v1.1, 2026-05-13 — Region correction to `eu-west-1` (Dublin); Q23 updated to distinguish the development-environment DPA (System Owner's organisation, synthetic data only) from the Verisure NL ↔ Supabase DPA pending corporate-account migration; Q26 expanded with full post-approval roadmap disclosure (infrastructure ownership migration, SSO, Snowflake read-only) to remove any salami-slicing concern; document versioned and committed to repository for the first time.
