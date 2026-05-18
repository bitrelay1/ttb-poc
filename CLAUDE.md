# CLAUDE.md — TTB Label Verification Prototype

> **Copilot users:** This file is the source of truth. See [.github/copilot-instructions.md](.github/copilot-instructions.md).

---

## Table of Contents

0. [Role Prompting](#0-role-prompting)
1. [Project Context](#1-project-context)
2. [Requirements](#2-requirements)
3. [Decisions & Assumptions](#3-decisions--assumptions)
4. [Implementation Guidance](#4-implementation-guidance)
5. [Evaluation Criteria](#5-evaluation-criteria)

> **Actionable gaps and pre-submission checklist:** see [ROADMAP.md](ROADMAP.md) · **Design decisions, trade-offs, and security:** see [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 0. Role Prompting

Invoke Claude in a specific role to get focused assistance. Start your message with the role name.

| Role | When to use | Primary focus |
| --- | --- | --- |
| **Senior Dev** | Building features, architecture, debugging | §4 implementation guidance · §2 checklist · §3 decisions |
| **Auditor** | Security review, supply chain, accessibility, code quality | §2.5 federal reqs · §2.6 security · ARCHITECTURE.md §2 · ROADMAP Open Gaps |
| **Customer** | Evaluate completeness, UX, submission readiness | §2 full checklist · §5 evaluation criteria |
| **Tech Writer** | README, CHANGELOG, ARCHITECTURE.md, assumptions documentation | §2.8 deliverables · §3 decisions · ARCHITECTURE.md |

Example: "As Auditor: review the CI/CD config for supply chain gaps."

---

## 1. Project Context

**What we're building:** A standalone prototype that lets TTB compliance agents upload an alcohol beverage label image and enter the corresponding application data, then get an AI-powered field-by-field verification report.

**Who uses it:**

- 47 agents ranging from tech-savvy (Jenny, 8 months) to tech-averse (Dave, 28 years, prints emails)
- Sarah's benchmark: her 73-year-old mother should be able to use it
- Peak load: 200–300 label applications submitted at once by large importers

**What it is NOT:**

- Not integrated with COLA or any live TTB system
- Not a production system — standalone proof-of-concept only
- No PII storage requirements for this prototype

**Source document:** [`take-home-prompt.md`](take-home-prompt.md)

---

## 2. Requirements

Requirements for this prototype. Completion status is tracked in [ROADMAP.md](ROADMAP.md).

### 2.1 Core Verification Fields

These fields must be extracted from the label image and compared against the submitted application data:

**Always required (all products):**

- **Brand name** — fuzzy match acceptable (e.g., "STONE'S THROW" == "Stone's Throw")
- **Class/type designation** — e.g., "Kentucky Straight Bourbon Whiskey"
- **Alcohol content (ABV)** — e.g., "45% Alc./Vol. (90 Proof)"
- **Net contents** — e.g., "750 mL"
- **Name and address of bottler/producer**
- **Country of origin** (required for imports)
- **Government Health Warning Statement** — STRICT exact match (see §3 for details)

**Conditionally required (shown in form when applicable):**

- **Statement of Age** — any age claim on label, or spirit aged less than minimum required period (27 CFR 5.74); shown for distilled spirits only
- **State of Distillation** — distillation state differs from bottler address state (27 CFR 5.66(f)); shown for distilled spirits only

### 2.2 Performance

- Results returned in **≤5 seconds** per label (hard requirement — agents abandoned the last vendor tool at 30–40s)

### 2.3 User Experience

*Benchmark: Sarah's 73-year-old mother (just learned video calls) should be able to complete a review. Dave (28-year agent, prints emails) should not need training. Half the team is 50+.*

- UI is clean and obvious — no hunting for buttons
- Non-technical users (50+ age range) can complete a review without training
- Clear pass/fail output per field, not ambiguous AI prose
- Linear single-path workflow — upload image → fill fields → submit → read results; no branching menus or hidden steps
- All primary actions visible at a glance; no dropdowns or nested navigation hiding core functionality
- Form labels and result labels use plain language — no technical jargon
- Error messages state what went wrong and what to do next, not just a code or status
- Loading state gives clear feedback (spinner or progress indicator) while verification runs
- Pass/fail results scannable at a glance — color + text label together (never color alone)

### 2.4 Batch Processing

- Support uploading **multiple labels at once** (batch of 200–300)
- Display progress and per-label results as they complete

### 2.5 Federal / Government Requirements

- **Audit trail** — every verification action logged: user/session, timestamp, label identifier, each field checked, pass/fail per field, overall result. Immutable. Exportable.
- **Admin panel** — view and export audit logs; manage users and roles; configure canonical values (e.g., government warning text)
- **Section 508 / WCAG 2.1 AA** — federal accessibility law; applies to any government-facing tool
- **CHANGELOG** — maintained for all significant changes, following federal software change documentation standards
- **Minimal data retention** — no PII stored beyond what the audit trail requires; document retention policy in ARCHITECTURE.md

### 2.6 Security & Supply Chain

- **CI/CD pipeline** — GitHub Actions; branch protection on `main`; no direct pushes; deployments only from CI
- **Dependency scanning** — automated alerts for vulnerable dependencies (Dependabot or Snyk)
- **SBOM** — software bill of materials generated on every build (CycloneDX for Python, Syft for containers if applicable)
- **Secret scanning** — GitHub secret scanning enabled; no credentials in code; all secrets via environment variables
- **SAST** — static analysis in CI pipeline (Bandit for Python; eslint-plugin-security for JS/TS)
- **HTTPS only** — TLS enforced at the deployment layer; no HTTP fallback
- **Artifact integrity** — build artifacts hashed and recorded in CI; images (if any) signed or digested

### 2.7 Image Handling

- Handle labels photographed at an angle, with glare, or in poor lighting (nice-to-have; document if not implemented)

### 2.8 Deliverables

- GitHub repository with all source code
- `README.md` with setup and run instructions
- `ARCHITECTURE.md` with design decisions, trade-offs, security controls, accessibility, data retention, and known limitations
- Deployed application URL (working prototype)

---

## 3. Decisions & Assumptions

*Document every non-obvious choice here so the reviewer understands the reasoning.*

### Conditional Fields — Product-Type-Driven Progressive Disclosure

The TTB COLA form (TTB F 5100.31) defines three product types: Distilled Spirits, Wine, and Malt Beverage. The form begins with a **Type of Product** selector that mirrors Box 5 of the COLA form. This drives which conditional sections appear.

**UI strategy:** The Age & Maturation section (Statement of Age, State of Distillation) appears only for Distilled Spirits. No conditional sections are shown for Wine or Malt Beverage in this prototype — the 7 core fields apply to all product types.

**Fields not implemented:** Wood Treatment (27 CFR 5.73), Sulfite Declaration (27 CFR 5.63(c)(7)), Coloring Materials (27 CFR 5.63(c)(5–6)), and Neutral Spirits / Commodity Statement (27 CFR 5.71) are omitted from this prototype. These are ingredient-threshold or production-method disclosures that cannot be reliably verified from a label image by OCR alone — a sulfite level of ≥10 ppm is not printed on the label in any standard location. Documenting the omission is preferable to implementing a verification that cannot produce reliable results.

**Verification strategy:** Only fields the agent fills in are sent to the AI. A blank value means "not applicable — skip." `_build_conditional_fields()` in `backend/app/services/vision.py` constructs the conditional field instructions dynamically from `application_data`.

**Full-caps government warning:** The TTB checklist requires only `GOVERNMENT WARNING:` to be in all caps. The body text follows the prescribed mixed-case wording. A label with the full warning in all caps fails the exact-match requirement. This is validated against the official TTB checklist.

### Government Warning — Strict Exact Match

The TTB government warning must appear **word-for-word** with `GOVERNMENT WARNING:` in all caps. Any deviation (title case, missing colon, font tricks, different wording) is a rejection. Standard text:

> **GOVERNMENT WARNING:** (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.

Verification strategy: extract text from image via vision model, normalize whitespace, compare against canonical text. Case of `GOVERNMENT WARNING:` must match exactly; flag any deviation.

### Brand Name — Fuzzy/Semantic Match

Per Dave's feedback ("STONE'S THROW" vs "Stone's Throw" — obviously the same"), brand name matching should be case-insensitive and punctuation-tolerant. Use normalized string comparison, not strict equality. Flag only meaningful differences.

### Application Data Input Format

The prompt does not specify a form format. Decision: provide a **structured form** with labeled fields (not free-text blob) so the AI comparison is field-by-field rather than holistic. This maps directly to the checklist agents already use.

**Prefill from Image (POC convenience):** A "Prefill from Image" button sends the uploaded label to a dedicated extraction endpoint (`POST /verify/prefill`) and pre-populates only the fields the model could read with high confidence — fields it cannot read clearly are left blank for the agent to complete. This replaces what would be an automated data feed from the COLA system in production; agents still review and correct all values before verifying.

### AI / Vision API

Using **Claude Haiku** (cheapest Claude vision model) via the Anthropic API for label OCR, field extraction, and semantic comparison. Chosen over Tesseract + rules because: (1) this is explicitly an "AI-Powered" prototype and AI integration is being evaluated, (2) Haiku handles fuzzy matching, imperfect images, and judgment calls in a single call, (3) estimated demo cost is < $2 total for realistic reviewer usage.

Implementation must use a **provider-agnostic abstraction layer** so the model can be swapped (e.g., to Gemini Flash or a FedRAMP-authorized model) without rewriting verification logic. Documented in ARCHITECTURE.md §1 (AI model choice).

### Network Restrictions Note

Marcus (IT Systems Administrator) noted the government network blocks outbound traffic to many domains — the prior scanning vendor's ML endpoints were blocked entirely. The Anthropic API (`api.anthropic.com`) is an external service and would face the same risk in production.

**Architecture mitigates this:** Each label verification is a single API call — one image + one structured prompt → one JSON response. There is no multi-step pipeline, no streaming dependency, and no secondary API calls. This makes the external dependency easy to replace with a self-hosted or agency-hosted alternative.

**TTB is already on Azure** (Marcus confirmed the 2019 migration). The natural production migration path is therefore:

1. **Azure AI Foundry / Azure OpenAI** — Microsoft's hosted AI platform, already within the agency's Azure tenancy. Claude models are available via Azure AI Foundry; GPT-4o Vision is an alternative. No outbound firewall exceptions needed.
2. **Local / on-prem LLM** — A vision-capable model (e.g., LLaVA, Qwen-VL, or a quantized Claude variant) served inside the agency network. Zero external traffic.
3. **Proxy allowlist** — Allowlist `api.anthropic.com` at the firewall as a lower-effort interim step.

**No code changes required to swap providers.** The `VisionProvider` ABC in `backend/app/services/vision.py` isolates all AI logic. A new provider implementation (e.g., `AzureFoundryProvider`) drops in by implementing `verify_label()` and updating `get_provider()`. Documented in ARCHITECTURE.md §1 (Network restrictions).

### Authentication

**Implemented:** Google OAuth (functional) for real user sign-in.

**Demo bypass:** A shared access code (value communicated to reviewer out-of-band) enters the app as a named `demo-user` session. This exists because federal computers often block OAuth popups — the reviewer should always be able to access the app regardless of network restrictions.

**Roles:** Two roles — `agent` and `admin`.

- `agent`: submit verifications (read-only audit log access is a production feature — see ROADMAP.md Part 2)
- `admin`: view all audit logs, export CSV, manage canonical values (e.g., government warning text), promote users to admin

Store role on the user record from day one, enforce in middleware. Production consideration: a read-only `auditor` role (separation of duties) would be added but is out of scope for this prototype — documented in ARCHITECTURE.md §1 (Authentication).

**Production note:** Treasury runs on Azure. Real production auth would be Azure AD / Microsoft Entra ID or PIV card (MAX.gov). Documented in ARCHITECTURE.md §1 (Authentication).

**Audit trail** works in both Google and demo-bypass sessions — actions are attributed to the authenticated identity or `demo-user` respectively.

### No COLA Integration

This is explicitly out of scope. The app is a standalone prototype.

### Verification Workflow — Check Before Commit

The AI check endpoint does **not** write to the audit log. A separate finalize step commits the result. This gives agents the chance to review AI output, add reviewer notes, and make disposition decisions for REVIEW fields before anything is logged — preventing duplicate entries when an agent re-runs verification to correct a data entry mistake.

### REVIEW Field Dispositions

When the AI returns REVIEW for a field, agents must choose one of three explicit dispositions before the Submit button becomes active:

- **Accept** — agent confirms the submitted data is correct; logged as pass
- **Fail** — agent rejects the field; logged as fail
- **Need New Image** — cannot determine from the image; creates a pending record

**Government Warning — disposition rules by result state:**

- **FAIL** (AI read the text, it doesn't match canonical): only Fail or Need New Image. The label text is wrong; no agent override can legitimize a non-matching warning.
- **REVIEW** (AI couldn't read the image): all three dispositions available, including Accept. The agent manually transcribes what they see. If they can confirm it matches, Accept is appropriate — REVIEW is an image-quality problem, not a label-content problem.

### Pending Records and Case IDs

When any field is flagged "Need New Image," the submission creates a **pending** audit log record rather than blocking. Every pending record receives a case ID (`TTB-XXXXXXXX`, derived from the first 8 characters of the log UUID in uppercase). Agents share this case ID with applicants when requesting image resubmission, tying the new attempt back to the original record in the audit log.

### Deep Re-Analysis — Dual-Model Cost Strategy

Standard verification uses **Claude Haiku** for every label (~$0.00025/call, under $2 for full prototype usage). When REVIEW fields are present, agents can trigger a user-initiated deep re-analysis using **Claude Sonnet**. Sonnet is applied with an extended prompt that instructs the model to examine edges, curves, and partial characters and transcribe text verbatim. Deep mode is never triggered automatically — it requires an explicit button click — so the Sonnet cost (~10–15× Haiku) is only incurred when an agent chooses it for a specific difficult label.

### Batch Processing Approach

Process batch uploads concurrently (parallel API calls per label) with a progress indicator. Show results as they complete rather than waiting for the full batch.

---

## 4. Implementation Guidance

### Code Principles

- Prefer fewer, clearly organized files over elaborate abstraction
- No comments unless the "why" is non-obvious
- Handle error states explicitly (bad image, API timeout, unreadable label)
- No backwards-compatibility shims or feature flags

### Tech Stack

- **Backend:** FastAPI (Python 3.12+) — async-native, Pydantic validation, SQLAlchemy ORM for audit trail
- **Frontend:** React + Vite (JavaScript) — built as static files and served directly from the FastAPI app; single origin, no CORS config needed
- **Database:** PostgreSQL — Railway managed instance
- **Hosting:** Railway — single project (web service + PostgreSQL); persistent container, no cold-start issue
- **CI/CD:** GitHub Actions → auto-deploy to Railway on merge to `main`
- **Key libraries:** `anthropic` (AI/vision), `sqlalchemy` + `alembic` (ORM + migrations), `authlib` (Google OAuth), `python-multipart` (file uploads)

---

## 5. Evaluation Criteria

From the prompt — keep these in mind at every decision point:

1. Correctness and completeness of core requirements
2. Code quality and organization
3. Appropriate technical choices for the scope
4. User experience and error handling
5. Attention to requirements
6. Creative problem-solving

> "A working core application with clean code is preferred over ambitious but incomplete features."
