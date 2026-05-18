import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.auth import CurrentUser, get_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import AuditLog, CanonicalValue
from app.services.vision import VerificationField, VerificationResult, get_provider

router = APIRouter(prefix="/verify", tags=["verify"])

_ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


def _magic_bytes_match(data: bytes, media_type: str) -> bool:
    if media_type == "image/jpeg":
        return data[:3] == b"\xff\xd8\xff"
    if media_type == "image/png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if media_type == "image/gif":
        return data[:6] in (b"GIF87a", b"GIF89a")
    if media_type == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def _normalize_app_data(data: dict) -> dict:
    if not data.get("country_of_origin"):
        data = {**data, "country_of_origin": "United States"}
    return data


def _get_canonical_warning(db: Session) -> str:
    row = db.query(CanonicalValue).filter_by(key="government_warning").first()
    if row is None:
        raise HTTPException(status_code=500, detail="Canonical government warning not configured")
    return row.value


def _write_audit_log(
    db: Session,
    *,
    label_filename: str,
    application_data: dict,
    result: VerificationResult,
    user_id: Optional[uuid.UUID] = None,
    session_identity: str = "anonymous",
    batch_id: Optional[uuid.UUID] = None,
    status: str = "complete",
    pending_reason: Optional[str] = None,
) -> uuid.UUID:
    log = AuditLog(
        id=uuid.uuid4(),
        user_id=user_id,
        session_identity=session_identity,
        label_filename=label_filename,
        batch_id=batch_id,
        application_data=application_data,
        field_results=[
            {
                "field": f.field,
                "extracted": f.extracted,
                "submitted": f.submitted,
                "result": f.result,
                "note": f.note,
            }
            for f in result.fields
        ],
        overall_result=result.overall,
        status=status,
        pending_reason=pending_reason,
    )
    db.add(log)
    db.commit()
    return log.id


def _sign_result(payload: dict) -> str:
    data = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hmac.new(settings.secret_key.encode(), data.encode(), hashlib.sha256).hexdigest()


def _result_payload(filename: str, result: VerificationResult, batch_id: Optional[uuid.UUID] = None) -> dict:
    payload = {
        "filename": filename,
        "overall": result.overall,
        "fields": [
            {
                "field": f.field,
                "extracted": f.extracted,
                "submitted": f.submitted,
                "result": f.result,
                "note": f.note,
            }
            for f in result.fields
        ],
    }
    if batch_id is not None:
        payload["batch_id"] = str(batch_id)
    payload["_sig"] = _sign_result(payload)
    return payload


async def _read_and_validate_image(upload: UploadFile) -> tuple[bytes, str]:
    media_type = upload.content_type or ""
    if media_type not in _ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{media_type}'. Accepted: JPEG, PNG, WebP, GIF.",
        )
    image_bytes = await upload.read()
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB limit")
    if not _magic_bytes_match(image_bytes, media_type):
        raise HTTPException(
            status_code=415,
            detail="File content does not match the declared image type.",
        )
    return image_bytes, media_type


@router.post("/")
@limiter.limit("30/minute")
async def verify_single(
    request: Request,
    image: UploadFile = File(...),
    application_data: str = Form(...),
    deep: bool = False,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Run AI verification and return results. Does NOT write to the audit log.
    Call POST /verify/finalize to commit the result to the audit log.
    Pass deep=true to use a more thorough (slower, costlier) analysis pass."""
    try:
        app_data = json.loads(application_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="application_data must be valid JSON")

    app_data = _normalize_app_data(app_data)
    canonical_warning = _get_canonical_warning(db)
    image_bytes, media_type = await _read_and_validate_image(image)

    try:
        result = await get_provider().verify_label(
            image_bytes=image_bytes,
            image_media_type=media_type,
            application_data=app_data,
            canonical_government_warning=canonical_warning,
            deep=deep,
        )
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Verification service unavailable — please try again in a moment.",
        )

    filename = image.filename or "unknown"
    return _result_payload(filename, result)


_PREFILL_FIELDS = {
    "brand_name", "product_type", "class_type", "abv", "net_contents",
    "bottler_name", "bottler_city", "bottler_state", "bottler_zip",
    "country_of_origin", "age_statement", "state_of_distillation",
}


@router.post("/prefill")
@limiter.limit("30/minute")
async def prefill_label(
    request: Request,
    image: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Extract label fields from an image to pre-populate the application form.
    Only returns fields the model can read with high confidence; omits uncertain values.
    POC convenience: in production this step would be automated from COLA application data."""
    image_bytes, media_type = await _read_and_validate_image(image)
    try:
        raw = await get_provider().extract_fields(image_bytes, media_type)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not extract fields from this image — please fill in the form manually.",
        )
    return {k: v for k, v in raw.items() if k in _PREFILL_FIELDS}


class ApplicationData(BaseModel):
    """Application data submitted by the agent. Sent to the AI as the ground truth for comparison."""

    model_config = {"extra": "ignore", "populate_by_name": True}

    brand_name: str = Field(description="Brand name as printed on the label. Case-insensitive fuzzy match.")
    class_type: str = Field(description="Class/type designation, e.g. 'Kentucky Straight Bourbon Whiskey'.")
    abv: str = Field(description="Alcohol by volume, e.g. '45% Alc./Vol. (90 Proof)'.")
    net_contents: str = Field(description="Net volume, e.g. '750 mL'.")
    bottler_name: str = Field(description="Name of bottler or producer as listed on the COLA application.")
    bottler_city: str = Field(default="", description="Bottler or producer city.")
    bottler_state: str = Field(default="", description="Bottler or producer state.")
    bottler_zip: str = Field(default="", description="Bottler or producer zip code.")
    bottler_address: str = Field(
        default="",
        description="Full address of bottler/producer. If omitted, it is assembled from city, state, and zip.",
    )
    product_type: str = Field(
        alias="type_of_product",
        description="Product category: 'distilled_spirits', 'wine', or 'malt_beverage'.",
    )
    country_of_origin: str = Field(
        default="United States",
        description="Country of origin. Omit for domestic products; defaults to 'United States'.",
    )
    age_statement: Optional[str] = Field(
        default=None,
        description=(
            "Statement of age as it appears on the label, e.g. '3 Years Old'. "
            "Distilled Spirits only. Omit or send null if not applicable (27 CFR 5.74)."
        ),
    )
    state_of_distillation: Optional[str] = Field(
        default=None,
        description=(
            "State of distillation statement, e.g. 'Distilled in Idaho'. "
            "Distilled Spirits only. Required when distillation state differs from bottler address state (27 CFR 5.66(f))."
        ),
    )

    @model_validator(mode="after")
    def _assemble_bottler_address(self):
        if not self.bottler_address:
            parts = [part.strip() for part in (self.bottler_city, self.bottler_state, self.bottler_zip) if part.strip()]
            self.bottler_address = ", ".join(parts)
        return self


class FieldOverride(BaseModel):
    disposition: str = Field(
        description="Agent disposition for a REVIEW field. One of: 'accept' (agent confirms data is correct), "
        "'fail' (agent rejects the field), 'request_new_image' (creates a pending record with a case ID).",
    )
    note: str = Field(
        default="",
        description="Optional manual transcription or reviewer comment. When provided for a REVIEW field, "
        "this value replaces the null extracted text in the audit log.",
    )


class FinalizeBody(BaseModel):
    filename: str = Field(description="Original image filename, as returned by POST /verify/.")
    application_data: ApplicationData = Field(
        description="The same application data submitted to POST /verify/. Stored verbatim in the audit log."
    )
    result: dict = Field(
        description="The full result object returned by POST /verify/. Contains 'overall' and 'fields' array."
    )
    overrides: dict[str, FieldOverride] = Field(
        default={},
        description="Reviewer dispositions for REVIEW fields. Key is the field name (e.g. 'government_warning'). "
        "Required before finalize if any field result is 'review'. "
        "Government Warning FAIL results cannot be overridden — only 'fail' or 'request_new_image' are accepted.",
    )
    batch_id: Optional[str] = Field(
        default=None,
        description="UUID of the batch this label belongs to, as returned by POST /verify/batch/. Omit for single-label submissions.",
    )


@router.post("/finalize")
@limiter.limit("30/minute")
async def verify_finalize(
    request: Request,
    body: FinalizeBody,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Commit a verified result to the audit log. Accepts optional reviewer notes for REVIEW fields."""
    result_for_sig = dict(body.result)
    sig = result_for_sig.pop("_sig", None)
    if sig is None:
        raise HTTPException(status_code=422, detail="Missing result signature — re-run verification before submitting.")
    if not secrets.compare_digest(sig, _sign_result(result_for_sig)):
        raise HTTPException(status_code=422, detail="Result signature is invalid — result may have been tampered with.")

    field_results = []
    pending_field_names = []
    for f in body.result.get("fields", []):
        fc = dict(f)
        field_name = fc.get("field", "")
        override = body.overrides.get(field_name)

        # Per 27 CFR 5.33: a Government Warning FAIL means the label text is wrong.
        # No agent override can legitimize non-matching warning text — only fail or
        # request_new_image are valid dispositions for this specific case.
        if (
            override
            and field_name == "government_warning"
            and fc.get("result") == "fail"
            and override.disposition == "accept"
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Government Warning FAIL cannot be accepted — the label text does not match "
                    "the required TTB wording. Valid dispositions: 'fail' or 'request_new_image'."
                ),
            )

        if override and fc.get("result") == "review":
            note_parts = [fc["note"]] if fc.get("note") else []
            manual_reading = override.note.strip()
            if manual_reading:
                fc["extracted"] = manual_reading
            if override.disposition == "request_new_image":
                pending_field_names.append(field_name)
                note_parts.append("[Reviewer: new image required]")
                fc["note"] = " ".join(note_parts)
            else:
                action = "accepted" if override.disposition == "accept" else "failed"
                suffix = f"[Reviewer: {action}"
                if manual_reading:
                    suffix += f" — reads: {manual_reading}"
                suffix += "]"
                note_parts.append(suffix)
                fc["note"] = " ".join(note_parts)
                fc["result"] = "pass" if override.disposition == "accept" else "fail"
        elif override and fc.get("result") in ("pass", "fail"):
            note_parts = [fc["note"]] if fc.get("note") else []
            reason = override.note.strip() if override.note else ""
            if override.disposition == "accept" and fc.get("result") == "fail":
                suffix = "[Agent override: accepted as pass"
                if reason:
                    suffix += f" — {reason}"
                suffix += "]"
                note_parts.append(suffix)
                fc["note"] = " ".join(note_parts) or None
                fc["result"] = "pass"
            elif override.disposition == "fail" and fc.get("result") == "pass":
                suffix = "[Agent override: marked as fail"
                if reason:
                    suffix += f" — {reason}"
                suffix += "]"
                note_parts.append(suffix)
                fc["note"] = " ".join(note_parts) or None
                fc["result"] = "fail"
        field_results.append(fc)

    if any(f["result"] == "fail" for f in field_results):
        overall = "fail"
    elif any(f["result"] == "review" for f in field_results):
        overall = "review"
    else:
        overall = "pass"

    record_status = "pending" if pending_field_names else "complete"
    pending_reason = (
        f"New image required for: {', '.join(pending_field_names)}"
        if pending_field_names else None
    )

    result = VerificationResult(
        overall=overall,
        fields=[
            VerificationField(
                field=f["field"],
                extracted=f.get("extracted"),
                submitted=f.get("submitted"),
                result=f.get("result", "review"),
                note=f.get("note"),
            )
            for f in field_results
        ],
    )

    log_id = _write_audit_log(
        db,
        label_filename=body.filename,
        application_data=body.application_data.model_dump(),
        result=result,
        user_id=current_user.user_id,
        session_identity=current_user.session_identity,
        batch_id=uuid.UUID(body.batch_id) if body.batch_id else None,
        status=record_status,
        pending_reason=pending_reason,
    )

    case_id = f"TTB-{str(log_id).replace('-', '').upper()[:8]}"
    if pending_field_names:
        return {
            "status": "pending",
            "case_id": case_id,
            "log_id": str(log_id),
            "pending_fields": pending_field_names,
        }
    return {"status": "complete", "case_id": case_id, "log_id": str(log_id)}


async def _process_one(
    upload: UploadFile,
    app_data: dict,
    canonical_warning: str,
) -> tuple[str, VerificationResult]:
    image_bytes, media_type = await _read_and_validate_image(upload)
    result = await get_provider().verify_label(
        image_bytes=image_bytes,
        image_media_type=media_type,
        application_data=app_data,
        canonical_government_warning=canonical_warning,
    )
    return upload.filename or "unknown", result


@router.post("/batch")
@limiter.limit("5/minute")
async def verify_batch(
    request: Request,
    images: list[UploadFile] = File(...),
    application_data_list: str = Form(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        app_data_list = json.loads(application_data_list)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="application_data_list must be valid JSON")

    if not isinstance(app_data_list, list):
        raise HTTPException(status_code=422, detail="application_data_list must be a JSON array")

    if len(images) > 50:
        raise HTTPException(status_code=422, detail="Batch size cannot exceed 50 images per request")

    app_data_list = [_normalize_app_data(d) for d in app_data_list]

    if len(images) != len(app_data_list):
        raise HTTPException(
            status_code=422,
            detail=f"Received {len(images)} image(s) but {len(app_data_list)} application data entry/entries",
        )

    canonical_warning = _get_canonical_warning(db)
    batch_id = uuid.uuid4()

    tasks = [_process_one(img, app_data, canonical_warning) for img, app_data in zip(images, app_data_list)]
    outcomes = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for i, outcome in enumerate(outcomes):
        if isinstance(outcome, Exception):
            logger.error(
                "Batch label processing error for '%s': %s",
                images[i].filename or f"label_{i}",
                outcome,
            )
            output.append({
                "filename": images[i].filename or f"label_{i}",
                "batch_id": str(batch_id),
                "overall": "review",
                "fields": [
                    {
                        "field": "error",
                        "extracted": None,
                        "submitted": None,
                        "result": "review",
                        "note": "Verification failed — please resubmit this label.",
                    }
                ],
                "error": "Verification failed — please resubmit this label.",
            })
        else:
            filename, result = outcome
            _write_audit_log(
                db,
                label_filename=filename,
                application_data=app_data_list[i],
                result=result,
                user_id=current_user.user_id,
                session_identity=current_user.session_identity,
                batch_id=batch_id,
            )
            output.append(_result_payload(filename, result, batch_id))

    return {"batch_id": str(batch_id), "results": output}
