# Re-export auth dependencies so routers can import from a single location
from app.auth import get_current_user, require_admin, CurrentUser

__all__ = ["get_current_user", "require_admin", "CurrentUser"]
