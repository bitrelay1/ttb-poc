"""
Unit tests for vision.py helper functions.

Pure functions — no database, no network, no AI calls.
These cover the domain rules that matter most for a federal compliance tool.
"""
import pytest

from app.services.vision import VerificationField, _build_conditional_fields, _compute_overall


def _field(name: str, result: str) -> VerificationField:
    return VerificationField(field=name, extracted="x", submitted="x", result=result)


class TestComputeOverall:
    """_compute_overall drives the per-label pass/fail/review badge agents see."""

    def test_all_pass_returns_pass(self):
        fields = [_field("brand_name", "pass"), _field("abv", "pass"), _field("government_warning", "pass")]
        assert _compute_overall(fields) == "pass"

    def test_one_fail_returns_fail(self):
        fields = [_field("brand_name", "pass"), _field("government_warning", "fail")]
        assert _compute_overall(fields) == "fail"

    def test_fail_dominates_review(self):
        # A single fail overrides any number of review fields — label cannot pass.
        fields = [_field("abv", "review"), _field("government_warning", "fail")]
        assert _compute_overall(fields) == "fail"

    def test_review_without_fail_returns_review(self):
        fields = [_field("brand_name", "pass"), _field("abv", "review")]
        assert _compute_overall(fields) == "review"

    def test_empty_fields_list_returns_pass(self):
        assert _compute_overall([]) == "pass"

    def test_single_review_field_returns_review(self):
        assert _compute_overall([_field("government_warning", "review")]) == "review"

    def test_single_fail_field_returns_fail(self):
        assert _compute_overall([_field("government_warning", "fail")]) == "fail"


class TestBuildConditionalFields:
    """_build_conditional_fields controls which fields are sent to the AI.

    Only fields the agent fills in are included — a blank value means 'not applicable'.
    This is the '27 CFR progressive disclosure' logic: Statement of Age and State of
    Distillation are Distilled Spirits-only fields.
    """

    def test_no_conditional_data_returns_empty_string(self):
        assert _build_conditional_fields({}) == ""

    def test_unrelated_key_does_not_add_conditional_fields(self):
        assert _build_conditional_fields({"brand_name": "Test Brand"}) == ""

    def test_age_statement_included_when_present(self):
        result = _build_conditional_fields({"age_statement": "3 Years Old"})
        assert "age_statement" in result

    def test_state_of_distillation_included_when_present(self):
        result = _build_conditional_fields({"state_of_distillation": "Distilled in Kentucky"})
        assert "state_of_distillation" in result

    def test_both_conditional_fields_included(self):
        result = _build_conditional_fields({
            "age_statement": "3 Years Old",
            "state_of_distillation": "Distilled in Kentucky",
        })
        assert "age_statement" in result
        assert "state_of_distillation" in result

    def test_none_age_statement_skips_field(self):
        # Sending null from the form (Wine / Malt Beverage product type) must not add the field.
        assert _build_conditional_fields({"age_statement": None}) == ""

    def test_none_state_of_distillation_skips_field(self):
        assert _build_conditional_fields({"state_of_distillation": None}) == ""
