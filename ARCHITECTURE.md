# Architecture & Design Decisions

> Design rationale, trade-offs, security posture, and production considerations for the TTB Label Verification prototype.
> For setup and operations, see [README.md](README.md). For the production roadmap, see [ROADMAP.md](ROADMAP.md).

---

## Table of Contents

1. [Design Decisions & Trade-offs](#1-design-decisions--trade-offs)
2. [Security & Supply Chain](#2-security--supply-chain)
3. [Accessibility](#3-accessibility)
4. [Data Retention Policy](#4-data-retention-policy)
5. [Known Limitations](#5-known-limitations)
6. [Testing](#6-testing)
7. [Out of Scope](#7-out-of-scope)

---

## 1. Design Decisions & Trade-offs

### AI model choice — dual-model strategy

Standard verification uses **Claude Haiku** for every label (~$0.00025 per label, under $2 for full prototype usage). Haiku handles imperfect images, fuzzy matching, and semantic judgment in a single API call — far simpler than a Tesseract + rules pipeline, and better on angled or glare-obscured photos.

When multiple fields return REVIEW — typically because the image is low-quality — agents can trigger a **deep re-analysis** using **Claude Sonnet**. Sonnet applies a more thorough prompt that instructs the model to trace edges, examine partial characters, follow curves in the label, and transcribe text verbatim before comparing. Deep mode is user-triggered only (a "Re-analyze" button appears when REVIEW fields are present) so it is never charged automatically. A loading banner clearly indicates the longer wait. Sonnet costs roughly 10–15× more per call than Haiku, but is used sparingly.

A third Haiku use is the user-triggered **"Prefill from Image"** button (`POST /verify/prefill`): the agent uploads a label and gets form fields pre-populated with values the model could read with high confidence — fields it could not read clearly are returned null and left blank. The extraction prompt is separate from the verification prompt (no comparison logic) and uses a tighter 1 024-token budget. In production this step would be eliminated by receiving structured application data directly from the COLA system.

The `VisionProvider` abstraction means all three model uses live in one file (`backend/app/services/vision.py`) and can be swapped (e.g., to Azure AI Foundry or an on-prem model) without touching any other layer.

### Verification workflow — check before commit

The AI check (`POST /verify/`) runs label analysis but does **not** write to the audit log. A separate "Submit Record" step (`POST /verify/finalize`) commits the result. This two-step design gives agents the chance to review AI output, add notes, and make disposition decisions for any REVIEW fields before anything is logged — preventing duplicate audit entries when an agent re-runs verification to correct a data entry mistake.

### REVIEW field dispositions and pending records

When the AI marks a field as REVIEW (cannot confirm from the image), agents must make an explicit disposition for each flagged field before the Submit button becomes active:

- **Accept** — agent confirms the submitted application data is correct; logged as pass.
- **Fail** — agent rejects the field; logged as fail.
- **Need New Image** — agent cannot determine the field value from the image; the record is saved as **pending**.

Pending records receive a case ID (`TTB-XXXXXXXX`) derived from the database log entry UUID. The case ID is the reference agents share with applicants when requesting image resubmission — it ties the new submission back to the original attempt in the audit log.

**Government Warning exception:** The government warning field cannot be accepted by an agent — only failed or flagged for a new image. Because exact text match is a regulatory requirement, no agent override can make a non-matching warning pass; the applicant must resubmit.

### Government warning — strict exact match

The TTB canonical government warning must appear **word-for-word** with `GOVERNMENT WARNING:` in all caps and a colon. Any deviation in wording, capitalization, or punctuation is a `fail`. The canonical text is stored in the `canonical_values` database table and editable by admins — so if the required text ever changes, no code deployment is needed.

One limitation: the AI checks the text content extracted from the image but cannot reliably verify font weight (bold) or font size from OCR alone. This is documented as a known gap (see §5).

### Brand name — fuzzy match

Brand name matching is case-insensitive and punctuation-tolerant. `STONE'S THROW` and `Stone's Throw` are the same brand; only meaningfully different names (e.g., `Stone Throw` vs `Stone's Throw`) are flagged. This matches the guidance from Dave (28-year TTB agent) who identified this as a source of false failures in prior tools.

### Batch processing

The backend `/api/verify/batch` endpoint exists and groups results under a shared `batch_id`. However, the frontend currently fires individual `/api/verify/` requests concurrently (via `Promise.all`) to display results progressively as each label completes — rather than waiting for the entire batch to finish. Trade-off: individual requests do not carry the `batch_id` from the batch endpoint, so batch-mode verifications from the UI are logged as separate audit entries without a shared batch ID. This is acceptable for the prototype; a future version could use SSE or WebSockets for streaming batch results from the single batch endpoint.

**Production assumption — agents do not manually enter application data.** In the real TTB workflow, application data (brand name, ABV, bottler address, etc.) is already entered by the importer when filing through COLA Online. An agent opening a batch in production would have those fields pre-populated from COLA — no manual form entry. Manual data entry is a prototype-only trade-off caused by the standalone, non-COLA-connected nature of this tool. This assumption also makes pre-upload image quality checks (before form entry) irrelevant in production, since there is no form-filling step to interrupt.

### Authentication

**Google OAuth** is the primary auth path for real users. **Demo bypass** exists because federal computers frequently block OAuth popups — the reviewer must always be able to access the app regardless of network restrictions.

**Production note:** Treasury runs on Azure. Real production auth would be **Azure AD / Microsoft Entra ID** or **PIV card via MAX.gov**. This prototype uses Google OAuth as the closest available stand-in. Swap by replacing `authlib`'s Google provider config with an Entra ID OpenID Connect endpoint.

A read-only `auditor` role (separation of duties — view logs without admin privileges) is an obvious production addition but is out of scope for this prototype.

**Agent audit log access:** Agents have no history view in this prototype. The production design gives agents read-only access to the full audit log — there is no sensitive data requiring own-only filtering. Case ID lookup for pending records resolves as a natural part of that view (see ROADMAP.md).

### Network restrictions

The Anthropic API (`api.anthropic.com`) is an external service. On government networks with restrictive outbound filtering — Marcus noted the prior vendor's ML endpoints were blocked entirely — this call would fail in production as-is.

**Architecture:** Each label verification is a single API call (one image + one structured prompt → one JSON response). There is no multi-step pipeline or secondary external dependency, which makes the external call straightforward to replace.

**TTB is already on Azure** (migrated 2019). The recommended production migration paths, in priority order:

1. **Azure AI Foundry / Azure OpenAI** — Microsoft's hosted AI platform within the existing agency Azure tenancy. Claude models are available via Azure AI Foundry; no new firewall exceptions needed because traffic stays within Azure.
2. **On-prem / local LLM** — A vision-capable open model (e.g., LLaVA, Qwen-VL) served inside the agency network. Zero external traffic.
3. **Firewall allowlist** — Add `api.anthropic.com` to the outbound allowlist as a lower-effort interim for the prototype period.

**No code changes required to swap.** The `VisionProvider` ABC in `backend/app/services/vision.py` isolates all AI logic behind a single interface. A new provider (e.g., `AzureFoundryProvider`) requires only implementing `verify_label()` and updating `get_provider()` — no changes to routes, audit logging, or any other layer.

---

## 2. Security & Supply Chain

| Control | Implementation |
|---|---|
| SAST — Python | Bandit (`bandit -r app -ll`) in CI |
| SAST — JavaScript | `eslint-plugin-security` in CI |
| CVE gate (fixable) | Trivy filesystem scan in CI — blocks CRITICAL (CVSSv3 9.0+) and HIGH (CVSSv3 7.0+, covers CVSSv4 8.0+ range); `ignore-unfixed: true` |
| KEV gate | Trivy filesystem scan in CI — blocks unfixed CRITICAL CVEs regardless of patch availability; catches CISA KEV entries and actively-exploited zero-days; `ignore-unfixed: false` |
| Dependency scanning | Dependabot (weekly, pip + npm + GitHub Actions) — security alert PRs are auto-generated by GitHub when vulnerabilities are detected |
| SBOM | CycloneDX JSON generated on every CI run, uploaded as a 90-day artifact |
| Secret scanning | GitHub secret scanning (enable in repo Settings → Security) |
| Secrets management | All secrets via environment variables; `.env` is git-ignored; `.env.example` contains only placeholder values |
| Branch protection | Require CI checks (`Backend`, `Frontend`, `Trivy`) to pass before merge; no direct push to `main` |
| Deployments | Only from CI on merge to `main`; `RAILWAY_TOKEN` scoped to the repo via GitHub Actions secret |
| TLS | Railway provides HTTPS at the edge; no HTTP fallback |
| Session signing | `itsdangerous.URLSafeTimedSerializer` with HMAC; 8-hour expiry |
| Cookie flags | `httponly=True`, `samesite=lax`; `secure` controlled by `SECURE_COOKIES` env var — set `true` in Railway and any production deployment (the browser sees HTTPS end-to-end even though Railway terminates TLS at the edge); use `false` for local HTTP development only |
| CSRF | Double-submit cookie pattern (`ttb_csrf` cookie + `x-csrf-token` header, compared via `secrets.compare_digest`); pre-auth paths exempt; enforced on all state-mutating requests from authenticated sessions |

**Note on artifact integrity:** The CI workflow uploads the SBOM as a GitHub Actions artifact with a 90-day retention window. For production, sign build artifacts with `cosign` or record hashes in a transparency log.

### Deferred security controls (requires public repo or GitHub Advanced Security license)

The following controls are configured via the GitHub Security UI and are not available for private repos on the free plan. Enable these when the repository is made public or when GitHub Advanced Security is provisioned.

| Control | Where to configure | What to set |
|---|---|---|
| Dependabot auto-triage rules | Settings → Security → Dependabot → Auto-triage rules | Add rule: auto-dismiss severity LOW and MEDIUM; keep open (never auto-dismiss) any alert tagged KEV or with CVSSv3 ≥ 9.0 / CVSSv4 ≥ 8.0 |
| Code scanning alerts | Settings → Security → Code scanning | Enable default setup; alert threshold: HIGH and above |
| Security overview | Security tab → Overview | Review after public/GHAS; confirms KEV and critical alert counts |

---

## 3. Accessibility

The UI targets **WCAG 2.1 AA** / **Section 508**, which applies to any tool used by federal employees.

- Skip-to-main-content link at the top of every page
- All interactive elements have visible focus indicators (3px outline)
- Status regions use `role="status"` and `aria-live="polite"` so screen readers announce results
- Tab bar uses `role="tab"` and `aria-selected`
- All form inputs have associated `<label>` elements
- Images and decorative SVGs have `aria-hidden="true"` or meaningful `alt` text
- Color is never the sole indicator of status — pass/fail/review badges include text labels (✓ PASS / ✗ FAIL / ? REVIEW)
- Minimum touch target sizes follow WCAG 2.5.5

A formal assistive-technology audit (JAWS, NVDA, VoiceOver) has not been conducted — this is on the production checklist.

---

## 4. Data Retention Policy

This prototype is not a production system and does not process real PII under normal operation. The audit log stores:

- Session identity (Google email address or the literal string `demo-user`)
- Label filename (assigned by the user's browser — may contain PII if the file is named after a person)
- Submitted application data (brand name, address, etc. — not personal data)
- Verification results

**Retention:** Audit log retention is configurable via the `retention_days` canonical value in the admin panel. The default is **2555 days (7 years)**, aligned with NARA General Records Schedule baselines for administrative records. A background task in `main.py` purges records older than the configured window every 24 hours.

**Deletion:** The admin panel exposes a `purge-logs` endpoint that removes records older than the retention window on demand. Audit logs are append-only in normal operation; deletion is admin-controlled and exists solely for retention compliance, not general data management.

**Separation-of-duties gap:** The purge operation is immediate and irreversible — a single admin account can delete all records matching the retention window with one API call and no second-approval step. There is no dry-run preview, no confirmation from a second administrator, and no soft-delete grace period before records are permanently removed. In a production deployment this should be addressed by one or more of: (a) requiring a second admin to confirm the purge via a separate API call or out-of-band approval, (b) implementing soft-delete with a configurable hold period before hard deletion executes, or (c) restricting the purge endpoint to a dedicated `auditor` role that is separate from the `admin` role and requires dual authorization. Until one of these controls is in place, the purge capability should be considered a privileged, break-glass operation documented in the system security plan.

**Google account data:** The `users` table stores email and display name from Google OAuth. This data is retained until manually deleted from the database.

---

## 5. Known Limitations

| Limitation | Detail |
|---|---|
| Font/weight verification | The AI extracts text content but cannot reliably verify that the government warning is printed in bold or at a specific font size — only that the text matches |
| Poor image quality | Heavily blurred, extremely low-resolution, or mostly-obscured labels return `review` for affected fields. Agents can trigger a deep re-analysis (Claude Sonnet) for a more thorough extraction pass — but this does not recover entirely illegible labels; a new photograph is sometimes the only resolution |
| Language | Only English labels are supported in the current prompt |
| Batch audit trail | Batch-mode verifications from the UI are logged as individual entries without a shared `batch_id` (see §1 batch processing) |
| Google OAuth on restricted networks | Federal networks may block OAuth redirects; demo bypass code is always available as a fallback |

---

## 6. Testing

The test suite runs in CI without any external services — no PostgreSQL connection, no Anthropic API key.

**Run locally:**

```bash
cd backend
pip install -e ".[dev]"
pytest -v
```

**Coverage:**

| File | Tests | What it covers |
|---|---|---|
| `tests/test_vision_logic.py` | 14 | Pure domain helpers: `_compute_overall()` (pass/fail/review rollup) and `_build_conditional_fields()` (27 CFR progressive disclosure logic) |
| `tests/test_verify_routes.py` | 20 | API integration: government warning exact match and title-case fail, brand name fuzzy match, input validation (MIME type, file size, batch cap), overall result aggregation, verify/finalize workflow, case ID format (`TTB-[0-9A-F]{8}`), pending record creation |
| `tests/test_auth.py` | 10 | Auth/RBAC: every protected endpoint returns 401 unauthenticated; agent sessions return 403 on all admin endpoints |

**Isolation strategy:** The SQLAlchemy session (`get_db`) and authenticated user (`get_current_user`) are replaced via FastAPI's `dependency_overrides`. The database is a `MagicMock` — no real PostgreSQL, and no SQLite dialect-compatibility issues from the PostgreSQL-specific column types (`UUID`, `JSON`) in the ORM models. The AI provider is patched at `app.routers.verify.get_provider` with an `AsyncMock` returning controlled `VerificationResult` objects.

---

## 7. Out of Scope

- **COLA integration** — this is a standalone prototype, not connected to any live TTB system
- **FedRAMP architecture** — the prototype demonstrates the capability; production would require FedRAMP-authorized hosting, a FedRAMP-authorized AI model, and an ATO process
- **PIV card / Azure AD auth** — production Treasury auth would use Entra ID or PIV; Google OAuth is the prototype stand-in
- **Custom ML model training** — Claude Haiku handles judgment calls that would require extensive labeled training data for a custom model
- **Enterprise-scale infrastructure** — Railway is appropriate for a prototype; production would need autoscaling, HA database, and formal DR planning
- **Proposed Alcohol Facts labeling** — TTB's January 2025 NPRM proposes requiring an "Alcohol Facts" panel (calories, carbs, protein, and fat per serving) and major food allergen disclosures on all labels subject to the FAA Act. If finalized, these become mandatory label fields; the tool would need corresponding form inputs and AI verification. The proposed compliance date is 5 years after a final rule is published in the Federal Register.
- **Automatic pre-analysis on image upload** — running AI extraction speculatively in the background while an agent fills out the form was rejected: it would incur API cost on every upload regardless of whether the agent uses the result, and COLA integration eliminates the form-fill step entirely in production. A *user-triggered* prefill button is implemented as a POC convenience (see §1 — AI model choice).
