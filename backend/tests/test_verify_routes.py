"""
Integration tests for the verification endpoints.

The AI provider and database session are mocked. Tests exercise:
- TTB domain rules (government warning exact match, brand name fuzzy match)
- Input validation (MIME type, file size, JSON shape)
- The two-step verify / finalize workflow
- Overall result aggregation (pass / fail / review)
- Pending record creation and case ID format
"""
import io
import json
import re
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.verify import _sign_result
from app.services.vision import VerificationField, VerificationResult, _compute_overall
from tests.conftest import CANONICAL_WARNING

_MINIMAL_APP_DATA = {
    "brand_name": "Stone's Throw",
    "class_type": "Kentucky Straight Bourbon Whiskey",
    "abv": "45% Alc./Vol. (90 Proof)",
    "net_contents": "750 mL",
    "bottler_name": "Stone's Throw Distillery",
    "bottler_city": "Louisville",
    "bottler_state": "KY",
    "bottler_zip": "40202",
    "type_of_product": "Distilled Spirits",
}


def _mock_provider(*fields: VerificationField) -> MagicMock:
    result = VerificationResult(fields=list(fields), overall=_compute_overall(list(fields)))
    provider = MagicMock()
    provider.verify_label = AsyncMock(return_value=result)
    return provider


@contextmanager
def _ai(*fields: VerificationField):
    with patch("app.routers.verify.get_provider", return_value=_mock_provider(*fields)):
        yield


def _jpeg(content: bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 16):
    return ("label.jpg", io.BytesIO(content), "image/jpeg")


def _post_verify(client, *fields: VerificationField, app_data: dict | None = None) -> dict:
    with _ai(*fields):
        resp = client.post(
            "/api/verify/",
            files={"image": _jpeg()},
            data={"application_data": json.dumps(app_data or _MINIMAL_APP_DATA)},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _field(name: str, result: str, extracted: str | None = "x") -> dict:
    return {"field": name, "extracted": extracted, "submitted": "x", "result": result, "note": None}


# ── Government Warning — the most legally critical domain rule ────────────────

class TestGovernmentWarning:
    def test_exact_match_returns_pass(self, agent_client):
        """The AI confirms the canonical warning text matches → pass."""
        f = VerificationField("government_warning", CANONICAL_WARNING, CANONICAL_WARNING, "pass")
        body = _post_verify(agent_client, f)
        gw = next(f for f in body["fields"] if f["field"] == "government_warning")
        assert gw["result"] == "pass"

    def test_title_case_returns_fail(self, agent_client):
        """'Government Warning:' is not 'GOVERNMENT WARNING:' — any case deviation is a fail.

        27 CFR 5.33(b)(1): the header must appear exactly as 'GOVERNMENT WARNING:'.
        Dave (28-year agent) specifically flagged this as a common applicant error.
        """
        bad_text = CANONICAL_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:")
        f = VerificationField("government_warning", bad_text, CANONICAL_WARNING, "fail")
        body = _post_verify(agent_client, f)
        gw = next(f for f in body["fields"] if f["field"] == "government_warning")
        assert gw["result"] == "fail"

    def test_unreadable_image_returns_review(self, agent_client):
        """When the AI cannot read the warning text, result is 'review' so the agent
        can make an explicit disposition before the record is committed."""
        f = VerificationField("government_warning", None, CANONICAL_WARNING, "review")
        body = _post_verify(agent_client, f)
        gw = next(f for f in body["fields"] if f["field"] == "government_warning")
        assert gw["result"] == "review"

    def test_government_warning_fail_makes_overall_fail(self, agent_client):
        """A government warning failure must propagate to the overall result —
        the label cannot receive any passing disposition."""
        fields = [
            VerificationField("brand_name", "Stone's Throw", "Stone's Throw", "pass"),
            VerificationField("government_warning", "wrong text", CANONICAL_WARNING, "fail"),
        ]
        body = _post_verify(agent_client, *fields)
        assert body["overall"] == "fail"


# ── Brand Name — fuzzy/semantic match per Dave's guidance ────────────────────

class TestBrandName:
    def test_case_insensitive_match_returns_pass(self, agent_client):
        """'STONE'S THROW' and 'Stone's Throw' are the same brand.

        Per Dave Morrison (28-year TTB agent): case-insensitive brand name matching
        is essential to avoid false failures on all-caps labels.
        """
        f = VerificationField("brand_name", "STONE'S THROW", "Stone's Throw", "pass")
        body = _post_verify(agent_client, f)
        bn = next(f for f in body["fields"] if f["field"] == "brand_name")
        assert bn["result"] == "pass"

    def test_meaningfully_different_name_returns_fail(self, agent_client):
        f = VerificationField("brand_name", "Stone Throw", "Stone's Throw", "fail")
        body = _post_verify(agent_client, f)
        bn = next(f for f in body["fields"] if f["field"] == "brand_name")
        assert bn["result"] == "fail"


# ── Input validation ──────────────────────────────────────────────────────────

class TestInputValidation:
    def test_unsupported_mime_type_returns_415(self, agent_client):
        resp = agent_client.post(
            "/api/verify/",
            files={"image": ("label.pdf", b"%PDF-1.4", "application/pdf")},
            data={"application_data": json.dumps(_MINIMAL_APP_DATA)},
        )
        assert resp.status_code == 415

    def test_image_too_large_returns_413(self, agent_client):
        big = b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024 + 1)
        resp = agent_client.post(
            "/api/verify/",
            files={"image": ("label.jpg", io.BytesIO(big), "image/jpeg")},
            data={"application_data": json.dumps(_MINIMAL_APP_DATA)},
        )
        assert resp.status_code == 413

    def test_malformed_json_application_data_returns_422(self, agent_client):
        resp = agent_client.post(
            "/api/verify/",
            files={"image": ("label.jpg", b"\xff\xd8\xff", "image/jpeg")},
            data={"application_data": "not-valid-json{"},
        )
        assert resp.status_code == 422

    def test_batch_exceeding_50_images_returns_422(self, agent_client):
        """Batch endpoint caps at 50 images per request to protect AI API costs."""
        images = [("images", (f"label_{i}.jpg", b"\xff\xd8\xff", "image/jpeg")) for i in range(51)]
        resp = agent_client.post(
            "/api/verify/batch",
            files=images,
            data={"application_data_list": json.dumps([_MINIMAL_APP_DATA] * 51)},
        )
        assert resp.status_code == 422
        assert "50" in resp.json()["detail"]


# ── Country of origin defaulting ─────────────────────────────────────────────

class TestNormalizeAppData:
    def test_missing_country_defaults_to_united_states(self):
        from app.routers.verify import _normalize_app_data
        result = _normalize_app_data({"brand_name": "Test"})
        assert result["country_of_origin"] == "United States"

    def test_explicit_country_is_preserved(self):
        from app.routers.verify import _normalize_app_data
        result = _normalize_app_data({"brand_name": "Test", "country_of_origin": "France"})
        assert result["country_of_origin"] == "France"

    def test_normalize_does_not_mutate_original_dict(self):
        from app.routers.verify import _normalize_app_data
        original = {"brand_name": "Test"}
        _normalize_app_data(original)
        assert "country_of_origin" not in original


# ── Overall result aggregation ────────────────────────────────────────────────

class TestOverallAggregation:
    def test_all_pass_fields_overall_is_pass(self, agent_client):
        fields = [
            VerificationField("brand_name", "x", "x", "pass"),
            VerificationField("government_warning", CANONICAL_WARNING, CANONICAL_WARNING, "pass"),
        ]
        assert _post_verify(agent_client, *fields)["overall"] == "pass"

    def test_one_review_field_overall_is_review(self, agent_client):
        fields = [
            VerificationField("brand_name", "x", "x", "pass"),
            VerificationField("abv", None, "45%", "review"),
        ]
        assert _post_verify(agent_client, *fields)["overall"] == "review"

    def test_fail_dominates_review_in_overall(self, agent_client):
        fields = [
            VerificationField("abv", None, "45%", "review"),
            VerificationField("government_warning", "wrong", CANONICAL_WARNING, "fail"),
        ]
        assert _post_verify(agent_client, *fields)["overall"] == "fail"


# ── Finalize workflow ─────────────────────────────────────────────────────────

class TestFinalizeWorkflow:
    def _body(self, fields: list[dict], overrides: dict | None = None) -> dict:
        result = {"overall": "pass", "fields": fields}
        result["_sig"] = _sign_result(result)
        return {
            "filename": "label.jpg",
            "application_data": _MINIMAL_APP_DATA,
            "result": result,
            "overrides": overrides or {},
        }

    def test_finalize_returns_case_id_and_log_id(self, agent_client):
        body = self._body([_field("brand_name", "pass")])
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert "case_id" in data
        assert "log_id" in data
        assert data["status"] == "complete"

    def test_case_id_follows_ttb_xxxxxxxx_format(self, agent_client):
        """Case IDs must be TTB- followed by 8 uppercase hex characters.

        Agents share these with applicants when requesting image resubmission,
        so format consistency matters for case tracking.
        """
        body = self._body([_field("brand_name", "pass")])
        resp = agent_client.post("/api/verify/finalize", json=body)
        case_id = resp.json()["case_id"]
        assert re.match(r"^TTB-[0-9A-F]{8}$", case_id), f"Unexpected case_id format: {case_id}"

    def test_finalize_writes_audit_log_with_correct_identity_and_status(self, agent_client, mock_db):
        """Finalize must write exactly one AuditLog row with the agent's session identity
        and correct overall result — the audit trail is a federal compliance requirement.
        """
        body = self._body([_field("brand_name", "pass")])
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 200
        mock_db.add.assert_called_once()
        log_obj = mock_db.add.call_args[0][0]
        assert log_obj.session_identity == "agent@ttb.gov"
        assert log_obj.status == "complete"
        assert log_obj.overall_result == "pass"

    def test_review_field_with_accept_disposition_creates_complete_record(self, agent_client, mock_db):
        """Agent accepts a REVIEW field (image unreadable, but agent confirms the data is correct).
        Result: logged as pass, overall record stays complete — not pending.
        """
        body = self._body(
            fields=[_field("abv", "review", extracted=None)],
            overrides={"abv": {"disposition": "accept", "note": "confirmed 45% Alc./Vol."}},
        )
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 200
        assert resp.json()["status"] == "complete"
        mock_db.add.assert_called_once()
        log_obj = mock_db.add.call_args[0][0]
        assert log_obj.overall_result == "pass"

    def test_fail_disposition_creates_failed_complete_record(self, agent_client, mock_db):
        """Agent explicitly marks a REVIEW field as fail.
        Result: complete record logged with overall fail — the most common real-world outcome.
        """
        body = self._body(
            fields=[_field("abv", "review", extracted=None)],
            overrides={"abv": {"disposition": "fail", "note": ""}},
        )
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 200
        assert resp.json()["status"] == "complete"
        mock_db.add.assert_called_once()
        log_obj = mock_db.add.call_args[0][0]
        assert log_obj.overall_result == "fail"

    def test_review_field_with_request_new_image_creates_pending_record(self, agent_client, mock_db):
        """'Need New Image' disposition: agent cannot make a determination from the image.
        Result: record saved as pending with a case ID to share with the applicant.
        """
        body = self._body(
            fields=[_field("government_warning", "review", extracted=None)],
            overrides={"government_warning": {"disposition": "request_new_image", "note": ""}},
        )
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert "government_warning" in data["pending_fields"]
        assert data["case_id"].startswith("TTB-")
        mock_db.add.assert_called_once()
        log_obj = mock_db.add.call_args[0][0]
        assert log_obj.status == "pending"

    def test_fail_government_warning_accept_override_returns_422(self, agent_client):
        """Accepting a Government Warning FAIL is explicitly rejected by the server.

        Per 27 CFR 5.33: a non-matching warning text cannot be legitimized by agent override.
        REVIEW disposition (unreadable image) allows Accept; FAIL (wrong text) does not.
        """
        body = self._body(
            fields=[_field("government_warning", "fail")],
            overrides={"government_warning": {"disposition": "accept", "note": ""}},
        )
        resp = agent_client.post("/api/verify/finalize", json=body)
        assert resp.status_code == 422
        assert "Government Warning" in resp.json()["detail"]


# ── AI provider failure ───────────────────────────────────────────────────────

class TestProviderFailure:
    def test_verify_returns_500_on_provider_exception(self, agent_client):
        """When the AI provider raises (timeout, rate limit, API error), the endpoint
        returns 500 with a human-readable message — not a raw stack trace.
        """
        from unittest.mock import AsyncMock, patch

        failing = MagicMock()
        failing.verify_label = AsyncMock(side_effect=Exception("API timeout"))
        with patch("app.routers.verify.get_provider", return_value=failing):
            resp = agent_client.post(
                "/api/verify/",
                files={"image": _jpeg()},
                data={"application_data": json.dumps(_MINIMAL_APP_DATA)},
            )
        assert resp.status_code == 500
        assert "Verification service unavailable" in resp.json()["detail"]


# ── Batch happy path ──────────────────────────────────────────────────────────

class TestBatchHappyPath:
    def test_batch_returns_one_result_per_image_with_shared_batch_id(self, agent_client):
        """Batch of 2 images → 2 results that all share the top-level batch_id."""
        fields = [VerificationField("brand_name", "Test Brand", "Test Brand", "pass")]
        images = [
            ("images", (f"label_{i}.jpg", b"\xff\xd8\xff", "image/jpeg"))
            for i in range(2)
        ]
        with _ai(*fields):
            resp = agent_client.post(
                "/api/verify/batch",
                files=images,
                data={"application_data_list": json.dumps([_MINIMAL_APP_DATA] * 2)},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "batch_id" in data
        assert len(data["results"]) == 2
        result_batch_ids = {item["batch_id"] for item in data["results"]}
        assert result_batch_ids == {data["batch_id"]}
        for item in data["results"]:
            assert item["overall"] == "pass"
            assert len(item["fields"]) > 0

    def test_batch_image_count_mismatch_returns_422(self, agent_client):
        """Sending 2 images but 1 application_data entry is a client error."""
        images = [
            ("images", (f"label_{i}.jpg", b"\xff\xd8\xff", "image/jpeg"))
            for i in range(2)
        ]
        resp = agent_client.post(
            "/api/verify/batch",
            files=images,
            data={"application_data_list": json.dumps([_MINIMAL_APP_DATA])},
        )
        assert resp.status_code == 422
