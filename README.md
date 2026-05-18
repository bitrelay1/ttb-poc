# TTB Label Verification — Prototype

An AI-powered tool for TTB compliance agents to verify alcohol beverage labels against submitted application data. Upload a label image, enter the application fields, and get a field-by-field pass/fail report in under 5 seconds.

**Live demo:** <!-- TODO: fill in Railway URL after first deploy, e.g. https://ttb-poc.up.railway.app -->

---

## Features

- **Field-by-field AI label verification** — Claude Haiku (standard, ≤5 seconds) and Claude Sonnet (deep re-analysis, user-triggered for difficult images)
- **Batch verification** — multiple labels uploaded and verified concurrently with progressive per-label results
- **Verification workflow** — verify (non-destructive preview) → disposition any REVIEW fields (Accept / Fail / Need New Image) → submit to immutable audit log
- **Pending records** — "Need New Image" creates a pending audit entry with a tracked case ID (`TTB-XXXXXXXX`) agents share with applicants
- **Audit trail** — immutable, per-field, filterable by result and identity, exportable as CSV
- **Admin panel** — audit log management, user and role management, canonical value editor (government warning text)
- **Authentication** — Google OAuth + demo bypass for restricted networks; agent and admin roles
- **Conditional fields** — Statement of Age and State of Distillation shown contextually for Distilled Spirits; AI verifies only fields the agent populates
- **Security / supply chain** — SAST (Bandit, eslint-plugin-security), SBOM (CycloneDX), Dependabot, CI/CD pipeline deploying to Railway
- **Accessibility** — WCAG 2.1 AA / Section 508 basics: skip link, aria-* roles, color-independent status indicators, visible focus states

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Architecture](#2-architecture)
3. [Configuration](#3-configuration)
4. [Running Locally](#4-running-locally)
5. [Deployment](#5-deployment)

> **Design decisions, trade-offs, security controls, accessibility, data retention, and known limitations:** see [ARCHITECTURE.md](ARCHITECTURE.md).
> **Production roadmap:** see [ROADMAP.md](ROADMAP.md).

---

## 1. Quick Start

**Prerequisites:** Python 3.12+, Node 20+, PostgreSQL (or a Railway project with a Postgres service).

```bash
# 1. Clone
git clone https://github.com/bitrelay1/ttb-poc.git
cd ttb-poc

# 2. Backend environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and ANTHROPIC_API_KEY at minimum (see §3)

# 3. Install backend dependencies
cd backend
pip install ".[dev]"

# 4. Run database migrations
alembic upgrade head

# 5. Build the frontend
cd ../frontend
npm ci
npm run build

# 6. Start the server
cd ../backend
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000).

Sign in with the demo access code you set as `DEMO_BYPASS_CODE` in `.env`.

---

## 2. Architecture

```text
┌─────────────────────────────────────────────┐
│  Browser                                    │
│  React + Vite (built → static files)        │
└────────────────┬────────────────────────────┘
                 │ HTTP (same origin)
┌────────────────▼────────────────────────────┐
│  FastAPI (Python 3.12)                      │
│  ├── /api/auth/*     OAuth + demo session   │
│  ├── /api/verify/*   Label verification     │
│  ├── /api/admin/*    Audit logs, users       │
│  └── /*              Static file serving    │
└──────────┬──────────────────┬───────────────┘
           │                  │
    ┌──────▼──────┐   ┌────────────────────────────┐
    │  PostgreSQL  │   │ Anthropic API               │
    │  (Railway)   │   │ Claude Haiku (standard)     │
    └─────────────┘   │ Claude Sonnet (deep mode)   │
                       └────────────────────────────┘
```

**Single Railway service** — the FastAPI app builds and serves the React frontend as static files. No CORS configuration needed; everything runs on the same origin.

**AI layer** — `VisionProvider` abstraction in `backend/app/services/vision.py`; the active model (Claude Haiku) can be swapped for any other provider without touching routes or audit logic. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full provider strategy and network restriction mitigations.

---

## 3. Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/db` |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Haiku label verification |
| `SECRET_KEY` | Yes | Random string used to sign session cookies. No default — the app will not start without a strong value |
| `DEMO_BYPASS_CODE` | Yes | Access code for the demo agent login. No default — must be set to a value that is not `ttb-demo` or similar weak strings |
| `DEMO_ADMIN_CODE` | Yes | Access code that grants `admin` role on demo login — use this to test the admin panel on networks where Google OAuth is blocked. No default — same strength requirement as `DEMO_BYPASS_CODE` |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID. If blank, the Google sign-in button is disabled |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |

**Google OAuth setup:** Create an OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com/). Add your app URL to the authorized origins and `https://your-app.railway.app/api/auth/callback/google` as an authorized redirect URI.

**Generating a secret key:**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 4. Running Locally

### Podman container workflow

This repo includes a host-friendly Podman setup using `docker-compose.yml` and `Dockerfile` at the project root.

```bash
cp .env.example .env
# Fill in DATABASE_URL, ANTHROPIC_API_KEY, and SECRET_KEY

podman-compose up --build
```

Open [http://localhost:8000](http://localhost:8000).

The compose file builds the shared image, runs PostgreSQL in a separate container, mounts the repo into the app container, installs frontend and backend dependencies, runs Alembic migrations, and starts Uvicorn on port 8000.

If your Podman installation does not provide `podman-compose`, install it with `pip install podman-compose`.

### Frontend development (hot reload)

```bash
cd frontend
npm run dev       # starts Vite dev server on :5173, proxies /api to :8000
```

Run the FastAPI backend on `:8000` simultaneously (see Quick Start step 6).

### SAST

```bash
# Python (Bandit)
cd backend && bandit -r app -c pyproject.toml -ll

# JavaScript (eslint-plugin-security)
cd frontend && npm run lint
```

### Database migrations

```bash
cd backend
alembic revision --autogenerate -m "description"   # generate a new migration
alembic upgrade head                                # apply all pending migrations
alembic downgrade -1                                # roll back one migration
```

---

## 5. Deployment

The app deploys to [Railway](https://railway.app/) automatically on every merge to `main` via GitHub Actions. The `railway.toml` at the project root defines the build and start commands.

### First deploy (manual)

1. Create a Railway project with a **PostgreSQL** service and a **web service** pointed at this repo.
2. Copy all variables from `.env.example` into the Railway service's environment variables panel — fill in real values.
3. Set the `RAILWAY_TOKEN` secret in GitHub → Settings → Secrets → Actions.
4. Enable branch protection on `main` (Settings → Branches): require the `Backend` and `Frontend` CI checks to pass before merging; no direct pushes.
5. Push to `main` (or merge a PR) — GitHub Actions builds, runs SAST, generates the SBOM, and deploys.

**Google OAuth callback URL for Railway:** `https://your-app-name.railway.app/api/auth/callback/google`

### Session cookie security

Set `SECURE_COOKIES=true` in Railway (already required for production). Railway terminates TLS before the app, so cookies travel over an encrypted connection end-to-end. For local HTTP development, leave `SECURE_COOKIES` unset or set it to `false`.

---
