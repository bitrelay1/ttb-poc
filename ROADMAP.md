# Roadmap

> For design decisions and trade-offs, see [ARCHITECTURE.md](ARCHITECTURE.md). For requirements and implementation guidance, see [CLAUDE.md](CLAUDE.md).

---

## API surface (available now)

The FastAPI backend exposes a documented REST API that external systems can consume today without any changes.

| Endpoint | Use case |
|---|---|
| `POST /api/verify/` | Submit one image + application data; get field results back |
| `POST /api/verify/finalize` | Commit a result to the audit log with reviewer dispositions |
| `POST /api/verify/batch` | Submit multiple images in one call; results written automatically |
| `GET /api/admin/audit-logs` | Query verification history with filters |
| `GET /api/admin/audit-logs/export` | Download full audit log as CSV |

**Authentication constraint:** All endpoints require a session cookie today. Machine-to-machine integrations need either a service account session or a new API key mechanism (see API key auth below).

---

## Agent-facing audit log and case ID lookup

**Scenario:** Agents need to review past verifications and locate pending records by case ID without admin access.

**What we'd build:**

- Read-only audit log view for agents (all submissions — no sensitive data requires own-only filtering); same expandable field-detail pattern as the existing admin view
- Case ID search/filter so agents can look up pending `TTB-XXXXXXXX` records and share references with applicants

This is the lowest-effort high-value production addition — the admin audit log UI already exists; it's primarily a matter of exposing a read-only version to the agent role.

---

## COLA Online data feed (form pre-population)

**Scenario:** An agent opens a COLA application in the TTB portal and clicks "Verify Label." COLA sends the application data to this system and gets back a pass/fail result — no manual form entry.

**What we'd build:**

- `POST /api/verify/from-cola` — accepts a COLA application record, maps COLA fields to `ApplicationData`, runs verification, returns results in a format COLA can display inline.
- A field mapping table (COLA Box # → `ApplicationData` field) configurable in the admin panel so TTB can adjust mappings without code changes if COLA's schema evolves.

**Variables needed before we can build it:**

| Variable | Why it matters |
|---|---|
| COLA export format | XML (likely, given COLA's age), JSON, or CSV? Determines the mapping layer |
| Push vs pull | Does COLA call us (webhook), or do we poll COLA for new applications? |
| Auth mechanism between systems | Service account? Mutual TLS? Shared API key? SAML assertion? |
| Network topology | Is COLA on the same Azure tenancy? Same intranet? External? |
| COLA field schema | Box 5 (type), Box 8 (brand name), etc. — need field IDs, not just form labels |
| Read-only vs write-back | Does TTB want results written back into the COLA record, or just displayed? |

---

## Importer / bottler portal (programmatic batch submission)

**Scenario:** A large importer's compliance software submits 200–300 label images with pre-filled application data via API, then polls for results — no browser, no agent interaction during submission.

**What we'd build:**

- API key authentication (see below) so importers can authenticate without browser-based OAuth.
- `GET /api/verify/batch/{batch_id}/status` — returns `{ completed: N, total: N, results: [...] }` for polling clients.
- Results webhook or callback URL support.

**Variables needed:**

| Variable | Why it matters |
|---|---|
| Push or pull results | Webhook callback URL vs polling endpoint |
| Who controls image transfer | Do importers upload images, or do we pull from an S3/SharePoint URL they provide? |
| Rate limiting expectations | 200–300 labels at once means ~200 concurrent Anthropic API calls; may need a semaphore |
| Result format | Our `ApplicationData` JSON shape, or a CSV matching their intake format? |

---

## Case management / pending record workflow

**Scenario:** When "Need New Image" creates a pending record, the case ID (`TTB-XXXXXXXX`) should flow into TTB's case management system so the agent has a trackable ticket, not just a reference number.

**What we'd build:**

- Outbound webhook from `POST /api/verify/finalize` when `status == "pending"`: `POST {webhook_url}` with `{ case_id, pending_fields, session_identity, label_filename, created_at }`.
- Webhook URL and optional HMAC secret configurable in the admin panel.
- `PATCH /api/verify/cases/{case_id}/resolve` — called by the case system when a new image arrives; creates a new verification attempt linked to the original `case_id`.

**Variables needed:**

| Variable | Why it matters |
|---|---|
| Which case management system | ServiceNow, Jira, a TTB-internal system? Determines webhook payload format |
| Inbound vs outbound | Does the case system call us, or do we call it? |
| Case ID format expectations | Does the external system want our `TTB-XXXXXXXX` format, or assign its own ticket ID? |
| Who resolves the case | Admin-only via this UI, or does the case system trigger resubmission automatically? |

---

## API key authentication (prerequisite for machine-to-machine integrations)

**Scenario:** Any system-to-system integration (COLA, importer portal, case management) needs to authenticate without a browser session.

**What we'd build:**

- `api_keys` table: `id`, `key_hash` (SHA-256, never stored in plain text), `label`, `role`, `created_by`, `created_at`, `last_used_at`, `revoked_at`.
- Admin panel endpoints for key lifecycle management (`GET`, `POST`, `DELETE /api/admin/api-keys`).
- `Authorization: Bearer <key>` header accepted as an alternative to the session cookie on all `/api/verify/` and `/api/admin/` endpoints.
- Keys carry a role (`agent` or `admin`) so the same RBAC model applies.

**What we need to know:** Whether TTB's security policy allows long-lived API keys, or whether all machine auth must flow through Azure AD service principals / managed identities. If Azure AD is required, follow the `VisionProvider` abstraction pattern — a new auth backend abstraction that accepts session cookies, API keys, or Azure AD tokens without touching route logic.

---

## Webhook / result push (general)

After `POST /api/verify/finalize`, if a `callback_url` was included in the original request (or registered against an API key), POST the finalized result to that URL. This decouples polling from result delivery.

**Shape we'd push:**

```json
{
  "case_id": "TTB-A1B2C3D4",
  "log_id": "uuid",
  "label_filename": "label_001.jpg",
  "overall_result": "pass",
  "status": "complete",
  "field_results": [],
  "created_at": "2026-05-15T14:32:00Z"
}
```
