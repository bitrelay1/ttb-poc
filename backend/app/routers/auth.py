import uuid
from datetime import datetime, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.auth import CurrentUser, clear_session, get_current_user, set_session
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import AllowedEmail, AuthLog, User

router = APIRouter(prefix="/auth", tags=["auth"])

_oauth = OAuth()
_oauth.register(
    name="google",
    client_id=settings.google_client_id or None,
    client_secret=settings.google_client_secret or None,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def _client_ip(request: Request) -> str:
    host = request.client.host if request.client else ""
    if host in _TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return host or "unknown"


def _write_auth_log(
    db: Session,
    *,
    event: str,
    provider: str,
    session_identity: str,
    user_id=None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    failure_reason: str | None = None,
) -> None:
    db.add(AuthLog(
        id=uuid.uuid4(),
        session_identity=session_identity,
        user_id=user_id,
        event=event,
        provider=provider,
        ip_address=ip_address,
        user_agent=user_agent,
        failure_reason=failure_reason,
    ))
    db.commit()


@router.get("/login/google")
@limiter.limit("20/minute")
async def login_google(request: Request):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    redirect_uri = str(request.url_for("callback_google"))
    return await _oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback/google", name="callback_google")
async def callback_google(request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")[:512]

    try:
        token = await _oauth.google.authorize_access_token(request)
    except Exception:
        _write_auth_log(
            db, event="login_failure", provider="google",
            session_identity="unknown", ip_address=ip, user_agent=ua,
            failure_reason="OAuth callback failed",
        )
        raise HTTPException(status_code=400, detail="OAuth callback failed — please try signing in again")

    userinfo = token.get("userinfo") or {}
    email = (userinfo.get("email") or "").lower()
    if not email:
        _write_auth_log(
            db, event="login_failure", provider="google",
            session_identity="unknown", ip_address=ip, user_agent=ua,
            failure_reason="No email returned by Google",
        )
        raise HTTPException(status_code=400, detail="Google did not return an email address")
    if not userinfo.get("email_verified"):
        _write_auth_log(
            db, event="login_failure", provider="google",
            session_identity=email, ip_address=ip, user_agent=ua,
            failure_reason="Email not verified by Google",
        )
        raise HTTPException(status_code=403, detail="Your Google account email is not verified")
    name = userinfo.get("name", email)

    allowed = db.query(AllowedEmail).filter_by(email=email).first()
    if allowed is None:
        _write_auth_log(
            db, event="login_failure", provider="google",
            session_identity=email, ip_address=ip, user_agent=ua,
            failure_reason="Email not in allowlist",
        )
        raise HTTPException(
            status_code=403,
            detail="Your email address is not authorized to access this application. Contact your administrator.",
        )

    user = db.query(User).filter_by(email=email).first()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=email,
            name=name,
            role=allowed.role,
            provider="google",
        )
        db.add(user)
    else:
        user.name = name
        user.role = allowed.role  # sync role from allowlist on every login
        user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    _write_auth_log(
        db, event="login_success", provider="google",
        session_identity=email, user_id=user.id, ip_address=ip, user_agent=ua,
    )

    current = CurrentUser(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        provider="google",
        session_identity=user.email,
    )
    response = RedirectResponse(url="/")
    set_session(response, current, settings.secret_key)
    return response


@router.post("/demo")
@limiter.limit("10/minute")
async def demo_login(request: Request, db: Session = Depends(get_db)):
    if not settings.demo_bypass_code:
        raise HTTPException(status_code=404, detail="Demo login is not available")
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")[:512]
    body = await request.json()
    code = body.get("code", "")

    admin_code_set = bool(settings.demo_admin_code)
    is_admin = admin_code_set and code == settings.demo_admin_code

    if not is_admin and code != settings.demo_bypass_code:
        _write_auth_log(
            db, event="login_failure", provider="demo",
            session_identity="unknown", ip_address=ip, user_agent=ua,
            failure_reason="Invalid demo access code",
        )
        raise HTTPException(status_code=401, detail="Invalid demo access code")

    identity = "demo-admin" if is_admin else "demo-user"
    _write_auth_log(
        db, event="login_success", provider="demo",
        session_identity=identity, ip_address=ip, user_agent=ua,
    )

    current = CurrentUser(
        user_id=None,
        email="demo@ttb.local",
        name="Demo Admin" if is_admin else "Demo User",
        role="admin" if is_admin else "agent",
        provider="demo",
        session_identity=identity,
    )
    response = JSONResponse({"ok": True})
    set_session(response, current, settings.secret_key)
    return response


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    ua = request.headers.get("User-Agent", "")[:512]

    try:
        user = get_current_user(request)
        _write_auth_log(
            db, event="logout", provider=user.provider,
            session_identity=user.session_identity,
            user_id=user.user_id, ip_address=ip, user_agent=ua,
        )
    except HTTPException:
        pass  # already logged out or session invalid — no log needed

    response = JSONResponse({"ok": True})
    clear_session(response)
    return response


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "provider": user.provider,
    }
