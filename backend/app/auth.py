import secrets
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

_COOKIE = "ttb_session"
_CSRF_COOKIE = "ttb_csrf"
_MAX_AGE = 8 * 60 * 60  # 8 hours


@dataclass
class CurrentUser:
    user_id: Optional[uuid.UUID]
    email: str
    name: str
    role: str            # "agent" | "admin"
    provider: str        # "google" | "demo"
    session_identity: str  # stored verbatim in audit logs


def _signer(secret_key: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret_key, salt="ttb-session")


def set_session(response: Response, user: CurrentUser, secret_key: str) -> None:
    payload = {
        "user_id": str(user.user_id) if user.user_id else None,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "provider": user.provider,
        "session_identity": user.session_identity,
    }
    token = _signer(secret_key).dumps(payload)
    from app.config import settings  # deferred to avoid circular import at module load
    response.set_cookie(
        _COOKIE,
        token,
        max_age=_MAX_AGE,
        httponly=True,
        samesite="strict",
        secure=settings.secure_cookies,
    )
    response.set_cookie(
        _CSRF_COOKIE,
        secrets.token_hex(32),
        max_age=_MAX_AGE,
        httponly=False,  # must be JS-readable for the double-submit pattern
        samesite="strict",
        secure=settings.secure_cookies,
    )


def clear_session(response: Response) -> None:
    from app.config import settings
    response.delete_cookie(_COOKIE, httponly=True, samesite="strict", secure=settings.secure_cookies)
    response.delete_cookie(_CSRF_COOKIE, samesite="strict", secure=settings.secure_cookies)


def get_current_user(request: Request) -> CurrentUser:
    from app.config import settings  # deferred to avoid circular import at module load

    token = request.cookies.get(_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = _signer(settings.secret_key).loads(token, max_age=_MAX_AGE)
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="Session expired — please sign in again")
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid session")

    return CurrentUser(
        user_id=uuid.UUID(payload["user_id"]) if payload.get("user_id") else None,
        email=payload["email"],
        name=payload["name"],
        role=payload["role"],
        provider=payload["provider"],
        session_identity=payload["session_identity"],
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
