from slowapi import Limiter
from starlette.requests import Request

# Railway routes requests through an internal router at 127.0.0.1; only trust
# X-Forwarded-For from those addresses to prevent client IP spoofing.
_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def _client_key(request: Request) -> str:
    host = request.client.host if request.client else ""
    if host in _TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return host or "unknown"


limiter = Limiter(key_func=_client_key)
