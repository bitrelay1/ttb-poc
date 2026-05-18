# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0-mvp] — 2026-05-16

Initial MVP release of the TTB Label Verification Prototype.

### Label Verification

- Agents upload a label image and fill in the corresponding application data fields; the system returns a pass/fail/review result for each field in under 5 seconds
- Fields verified for all product types: brand name, class/type designation, alcohol content (ABV), net contents, bottler name, bottler address, country of origin, and government warning statement
- Distilled Spirits products show two additional conditional fields: Statement of Age (27 CFR 5.74) and State of Distillation (27 CFR 5.66(f)); these fields are omitted entirely for Wine and Malt Beverage
- Government warning is validated against the canonical TTB text with strict exact-match — `GOVERNMENT WARNING:` must be all-caps with colon; any deviation results in an automatic fail
- Brand name matching is case-insensitive and punctuation-tolerant (e.g., "STONE'S THROW" matches "Stone's Throw")
- When the AI cannot confidently read a field from the image, it returns a REVIEW result; agents must explicitly accept, fail, or flag the field as needing a new image before the submission can be finalized
- Government Warning FAIL results cannot be accepted by an agent — only Fail or Need New Image dispositions are available, preventing override of a confirmed mismatch
- Agents can trigger a one-time deep re-analysis on difficult images using a higher-capability model; this is never triggered automatically
- When a field is flagged "Need New Image," the submission creates a pending record with a case ID (`TTB-XXXXXXXX`) that agents share with applicants for resubmission tracking
- Batch upload supports multiple labels verified concurrently, with results displayed progressively as each label completes

### Audit Trail & Admin

- Every verification is logged with the agent identity, timestamp, label filename, submitted field values, per-field results, and overall result
- Admins can view the full audit log with filters by result and identity, paginated with expandable field-level detail rows, and export to CSV
- Admins can edit the canonical government warning text directly in the UI without a code deployment
- Access is restricted to an email allowlist managed in the admin panel; the first admin is bootstrapped from an environment variable at startup
- User management allows admins to promote or demote agents; self-demotion is blocked

### Security & Infrastructure

- Google OAuth 2.0 sign-in with a demo bypass access code for environments where OAuth popups are blocked
- Two roles: `agent` (submit verifications) and `admin` (full access); enforced in middleware on every request
- CSRF protection, rate limiting, and security headers applied across all API endpoints
- Automated CI pipeline on every push: Python SAST (Bandit), JavaScript SAST (eslint-plugin-security), frontend build check, and 44-test suite covering domain logic, API routes, and auth/RBAC
- CycloneDX software bill of materials (SBOM) generated on every CI run and retained as a 90-day artifact
- Dependabot configured for weekly dependency scans across pip, npm, and GitHub Actions
- Deployed to Railway via GitHub Actions on merge to `main`; no direct pushes to main

### Accessibility

- Meets WCAG 2.1 AA / Section 508 requirements: skip navigation link, visible keyboard focus indicators, ARIA landmark roles and live regions, color-independent status indicators (pass/fail/review conveyed by text label and color together)
