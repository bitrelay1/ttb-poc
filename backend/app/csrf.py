import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_SESSION_COOKIE = "ttb_session"
_CSRF_COOKIE = "ttb_csrf"
_CSRF_HEADER = "x-csrf-token"
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
# Pre-auth endpoints that legitimately have no CSRF token yet
_EXEMPT_PATHS = frozenset({
    "/api/auth/demo",
    "/api/auth/login/google",
    "/api/auth/callback/google",
})


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in _SAFE_METHODS or request.url.path in _EXEMPT_PATHS:
            return await call_next(request)
        # No session cookie means the request is unauthenticated; auth will reject it.
        if _SESSION_COOKIE not in request.cookies:
            return await call_next(request)
        csrf_cookie = request.cookies.get(_CSRF_COOKIE, "")
        csrf_header = request.headers.get(_CSRF_HEADER, "")
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse({"detail": "CSRF validation failed"}, status_code=403)
        return await call_next(request)
