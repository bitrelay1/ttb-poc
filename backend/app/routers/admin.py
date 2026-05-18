import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin
from app.database import get_db
from app.limiter import limiter
from app.models import AllowedEmail, AuditLog, AuthLog, CanonicalValue, User

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Audit Logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    result: Optional[str] = Query(None, description="Filter by overall result: pass, fail, review"),
    status: Optional[str] = Query(None, description="Filter by record status: complete, pending"),
    identity: Optional[str] = Query(None, description="Filter by session identity (email or demo-user)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if result:
        q = q.filter(AuditLog.overall_result == result)
    if status:
        q = q.filter(AuditLog.status == status)
    if identity:
        q = q.filter(AuditLog.session_identity.ilike(f"%{identity}%"))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_log_dict(r) for r in rows],
    }


@router.get("/audit-logs/export")
def export_audit_logs(
    result: Optional[str] = Query(None),
    identity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.asc())
    if result:
        q = q.filter(AuditLog.overall_result == result)
    if identity:
        q = q.filter(AuditLog.session_identity.ilike(f"%{identity}%"))
    rows = q.all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "created_at", "session_identity", "label_filename",
        "batch_id", "overall_result", "status", "pending_reason",
        "field_results", "application_data",
    ])
    for r in rows:
        writer.writerow([
            str(r.id),
            r.created_at.isoformat() if r.created_at else "",
            r.session_identity,
            r.label_filename,
            str(r.batch_id) if r.batch_id else "",
            r.overall_result,
            r.status,
            r.pending_reason or "",
            json.dumps(r.field_results),
            json.dumps(r.application_data),
        ])

    buf.seek(0)
    filename = f"ttb_audit_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _log_dict(r: AuditLog) -> dict:
    return {
        "id": str(r.id),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "session_identity": r.session_identity,
        "label_filename": r.label_filename,
        "batch_id": str(r.batch_id) if r.batch_id else None,
        "overall_result": r.overall_result,
        "status": r.status,
        "pending_reason": r.pending_reason,
        "field_results": r.field_results,
        "application_data": r.application_data,
    }


# ── Auth Logs ─────────────────────────────────────────────────────────────────

@router.get("/auth-logs")
def list_auth_logs(
    event: Optional[str] = Query(None, description="Filter by event: login_success, login_failure, logout"),
    identity: Optional[str] = Query(None, description="Filter by session identity"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    q = db.query(AuthLog).order_by(AuthLog.created_at.desc())
    if event:
        q = q.filter(AuthLog.event == event)
    if identity:
        q = q.filter(AuthLog.session_identity.ilike(f"%{identity}%"))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_auth_log_dict(r) for r in rows],
    }


@router.get("/auth-logs/export")
def export_auth_logs(
    event: Optional[str] = Query(None),
    identity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    q = db.query(AuthLog).order_by(AuthLog.created_at.asc())
    if event:
        q = q.filter(AuthLog.event == event)
    if identity:
        q = q.filter(AuthLog.session_identity.ilike(f"%{identity}%"))
    rows = q.all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "event", "provider", "session_identity", "ip_address", "user_agent", "failure_reason"])
    for r in rows:
        writer.writerow([
            str(r.id),
            r.created_at.isoformat() if r.created_at else "",
            r.event,
            r.provider,
            r.session_identity,
            r.ip_address or "",
            r.user_agent or "",
            r.failure_reason or "",
        ])

    buf.seek(0)
    filename = f"ttb_auth_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _auth_log_dict(r: AuthLog) -> dict:
    return {
        "id": str(r.id),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "event": r.event,
        "provider": r.provider,
        "session_identity": r.session_identity,
        "ip_address": r.ip_address,
        "user_agent": r.user_agent,
        "failure_reason": r.failure_reason,
    }


# ── Canonical Values ───────────────────────────────────────────────────────────

class CanonicalValueUpdate(BaseModel):
    value: str = Field(
        description="The new canonical value. For 'government_warning', this must be the exact TTB-prescribed text "
        "including 'GOVERNMENT WARNING:' in all caps. For 'retention_days', an integer as a string (e.g. '2555')."
    )


@router.get("/canonical-values")
def list_canonical_values(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    rows = db.query(CanonicalValue).all()
    return [
        {
            "id": r.id,
            "key": r.key,
            "value": r.value,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.put("/canonical-values/{key}")
@limiter.limit("20/minute")
def update_canonical_value(
    request: Request,
    key: str,
    body: CanonicalValueUpdate,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    row = db.query(CanonicalValue).filter_by(key=key).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Canonical value '{key}' not found")
    row.value = body.value
    row.updated_by_id = admin.user_id
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "key": row.key,
        "value": row.value,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# ── Data Retention ────────────────────────────────────────────────────────────

@router.post("/purge-logs")
@limiter.limit("5/minute")
def purge_logs(
    request: Request,
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    """Immediately delete all audit and auth log rows older than retention_days."""
    row = db.query(CanonicalValue).filter_by(key="retention_days").first()
    try:
        days = int(row.value) if row else 2555
    except ValueError:
        days = 2555

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    audit_deleted = db.query(AuditLog).filter(AuditLog.created_at < cutoff).delete()
    auth_deleted = db.query(AuthLog).filter(AuthLog.created_at < cutoff).delete()
    db.commit()

    return {
        "retention_days": days,
        "cutoff": cutoff.isoformat(),
        "audit_logs_deleted": audit_deleted,
        "auth_logs_deleted": auth_deleted,
    }


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    rows = db.query(User).order_by(User.created_at.asc()).all()
    return [_user_dict(u) for u in rows]


class RoleUpdate(BaseModel):
    role: str = Field(description="New role for the user. Must be 'agent' or 'admin'. Admins cannot demote themselves.")


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    if body.role not in ("agent", "admin"):
        raise HTTPException(status_code=422, detail="role must be 'agent' or 'admin'")
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")

    user = db.query(User).filter_by(id=uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.user_id) and body.role != "admin":
        raise HTTPException(status_code=400, detail="Admins cannot demote themselves")
    user.role = body.role
    allowed = db.query(AllowedEmail).filter_by(email=user.email).first()
    if allowed:
        allowed.role = body.role
    db.commit()
    db.refresh(user)
    return _user_dict(user)


def _user_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "provider": u.provider,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }


# ── Allowed Emails (login allowlist) ──────────────────────────────────────────

class AllowedEmailCreate(BaseModel):
    email: EmailStr = Field(description="Email address to allow. Must be a valid Google account email.")
    role: str = Field(default="agent", description="Role to assign: 'agent' or 'admin'.")


class AllowedEmailRoleUpdate(BaseModel):
    role: str = Field(description="New role: 'agent' or 'admin'.")


def _allowed_dict(a: AllowedEmail) -> dict:
    return {
        "id": a.id,
        "email": a.email,
        "role": a.role,
        "added_at": a.added_at.isoformat() if a.added_at else None,
    }


@router.get("/allowed-emails")
def list_allowed_emails(
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    rows = db.query(AllowedEmail).order_by(AllowedEmail.added_at.asc()).all()
    return [_allowed_dict(r) for r in rows]


@router.post("/allowed-emails", status_code=201)
@limiter.limit("20/minute")
def add_allowed_email(
    request: Request,
    body: AllowedEmailCreate,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    if body.role not in ("agent", "admin"):
        raise HTTPException(status_code=422, detail="role must be 'agent' or 'admin'")
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="email is required")
    existing = db.query(AllowedEmail).filter_by(email=email).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{email} is already in the allowlist")
    entry = AllowedEmail(email=email, role=body.role, added_by_id=admin.user_id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _allowed_dict(entry)


@router.put("/allowed-emails/{entry_id}/role")
def update_allowed_email_role(
    entry_id: int,
    body: AllowedEmailRoleUpdate,
    db: Session = Depends(get_db),
    _admin: CurrentUser = Depends(require_admin),
):
    if body.role not in ("agent", "admin"):
        raise HTTPException(status_code=422, detail="role must be 'agent' or 'admin'")
    entry = db.query(AllowedEmail).filter_by(id=entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="Allowlist entry not found")
    entry.role = body.role
    user = db.query(User).filter_by(email=entry.email).first()
    if user:
        user.role = body.role
    db.commit()
    db.refresh(entry)
    return _allowed_dict(entry)


@router.delete("/allowed-emails/{entry_id}", status_code=204)
@limiter.limit("20/minute")
def remove_allowed_email(
    request: Request,
    entry_id: int,
    db: Session = Depends(get_db),
    admin: CurrentUser = Depends(require_admin),
):
    entry = db.query(AllowedEmail).filter_by(id=entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="Allowlist entry not found")
    if admin.email and entry.email == admin.email:
        raise HTTPException(status_code=400, detail="Cannot remove your own allowlist entry")
    if entry.role == "admin":
        admin_count = db.query(AllowedEmail).filter_by(role="admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin allowlist entry")
    db.delete(entry)
    db.commit()
