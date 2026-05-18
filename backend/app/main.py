import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request as StarletteRequest

from app.config import settings
from app.csrf import CSRFMiddleware
from app.limiter import limiter
from app.logging_config import configure_logging
from app.routers import admin, auth, verify

logger = logging.getLogger(__name__)

_WEAK_BYPASS_CODES = {"ttb-demo", "ttb-admin", "demo", "admin", "password", "test"}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob: https://fastapi.tiangolo.com; "
            "connect-src 'self'; font-src 'self'; object-src 'none'; "
            "frame-ancestors 'none'",
        )
        if settings.secure_cookies:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


async def _purge_loop() -> None:
    """Delete audit and auth log rows older than the configured retention_days. Runs every 24 h."""
    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            from datetime import datetime, timedelta, timezone

            import sqlalchemy as sa

            from app.database import SessionLocal
            from app.models import AuditLog, AuthLog, CanonicalValue

            with SessionLocal() as db:
                row = db.query(CanonicalValue).filter_by(key="retention_days").first()
                days = int(row.value) if row and row.value.isdigit() else 2555
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)

                audit_deleted = db.query(AuditLog).filter(AuditLog.created_at < cutoff).delete()
                auth_deleted = db.query(AuthLog).filter(AuthLog.created_at < cutoff).delete()
                db.commit()

            if audit_deleted or auth_deleted:
                logger.info(
                    "Retention purge: removed %d audit log(s) and %d auth log(s) older than %d days",
                    audit_deleted, auth_deleted, days,
                )
        except Exception:
            logger.exception("Retention purge failed")


def _seed_initial_admin() -> None:
    if not settings.initial_admin_email:
        return
    from app.database import SessionLocal
    from app.models import AllowedEmail
    email = settings.initial_admin_email.strip().lower()
    with SessionLocal() as db:
        if not db.query(AllowedEmail).filter_by(email=email).first():
            db.add(AllowedEmail(email=email, role="admin"))
            db.commit()
            logger.info("Seeded initial admin allowlist entry: %s", email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    _WEAK_SECRET_KEYS = {"change-in-production", "change-this-to-a-random-string-in-production", "secret", "secret_key"}
    if len(settings.secret_key) < 32 or settings.secret_key.lower() in _WEAK_SECRET_KEYS:
        raise RuntimeError(
            "SECRET_KEY is missing or too weak. "
            "Set a cryptographically random value of at least 32 characters in the environment."
        )
    if settings.demo_bypass_code and settings.demo_bypass_code.lower() in _WEAK_BYPASS_CODES:
        raise RuntimeError(
            f"DEMO_BYPASS_CODE uses a known-weak value '{settings.demo_bypass_code}'. "
            "Set a strong, unique value in the environment."
        )
    if settings.demo_admin_code and settings.demo_admin_code.lower() in _WEAK_BYPASS_CODES:
        raise RuntimeError(
            f"DEMO_ADMIN_CODE uses a known-weak value '{settings.demo_admin_code}'. "
            "Set a strong, unique value in the environment."
        )
    _seed_initial_admin()
    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()


_DESCRIPTION = """\
REST API for the TTB Label Verification prototype. Allows compliance agents — and external systems — to
submit alcohol beverage label images with accompanying application data and receive a field-by-field
AI-powered verification report.

## Authentication

All endpoints require a valid session cookie obtained via:
- **Google OAuth** — `GET /api/auth/login/google`
- **Demo bypass** — `POST /api/auth/demo` with the shared access code

Endpoints marked **admin only** additionally require the `admin` role.

## Verification workflow

1. `POST /api/verify/` — upload an image + application data; get back field results. **Does not write to the audit log.**
2. `POST /api/verify/finalize` — commit the result (with any reviewer dispositions for REVIEW fields) to the immutable audit log.
3. `POST /api/verify/batch` — upload multiple images in one request; results are written to the audit log automatically.

## Application data schema

The `application_data` object passed to verify and finalize endpoints has this shape:

```json
{
  "brand_name": "Stone's Throw",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750 mL",
  "bottler_name": "Stone's Throw Distillery",
  "bottler_city": "Louisville",
  "bottler_state": "KY",
  "bottler_zip": "40202",
  "type_of_product": "Distilled Spirits",
  "country_of_origin": "United States",
  "age_statement": "3 Years Old",
  "state_of_distillation": "Distilled in Kentucky"
}
```

`age_statement` and `state_of_distillation` are conditional: include them only for Distilled Spirits when they
appear on the label. Omit them (or send `null`) for Wine and Malt Beverage, or when not applicable.
`country_of_origin` defaults to `"United States"` when omitted.

## Field result values

Each field in the response carries one of three `result` values:
- `pass` — label matches submitted data within allowed tolerance
- `fail` — label clearly contradicts submitted data
- `review` — image was unclear or the match is ambiguous; agent must make a disposition decision before finalizing

## Provider abstraction

The AI backend is swappable without code changes to the API layer. See `VisionProvider` in
`app/services/vision.py`. Production migration paths: Azure AI Foundry (same Azure tenancy TTB already
uses), on-premises vision model, or Anthropic API with a firewall allowlist.
"""

_TAGS: list[dict] = [
    {
        "name": "verify",
        "description": "Submit label images for AI-powered field verification.",
    },
    {
        "name": "admin",
        "description": "Audit log management, user administration, and canonical value configuration. **Admin role required.**",
    },
    {
        "name": "auth",
        "description": "Session management: Google OAuth, demo bypass login, and logout.",
    },
]

_is_production = settings.env == "production"

app = FastAPI(
    title="TTB Label Verification",
    version="0.1.0",
    description=_DESCRIPTION,
    openapi_tags=_TAGS,
    lifespan=lifespan,
    # Disable interactive API docs in production — they document the demo bypass scheme
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CSRFMiddleware)
# SessionMiddleware uses SameSite=lax so OAuth redirects (GET) carry the state cookie across
# the Google → /callback redirect. Auth cookies use SameSite=strict (set in app/auth.py).
# The mismatch is intentional: the session cookie is short-lived (max_age=600) and OAuth-only.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    max_age=600,
    same_site="lax",
    https_only=settings.secure_cookies,
)

app.include_router(auth.router, prefix="/api")
app.include_router(verify.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
