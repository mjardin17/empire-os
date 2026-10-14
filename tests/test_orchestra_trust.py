"""Offline unit tests for the verification trust decision. No server, no network."""
from adapters.orchestra_dispatch import ACCEPTED_VERIFICATION_TRUST, evidence_from_receipt, verified_receipt


def base(**over):
    r = {"status": "verified", "run_id": "run_unit", "task_id": "t-read", "verification_trust": "pristine_code_only",
         "verify": {"report_ok": True}, "attestation": "ab" * 32}
    r.update(over)
    return r


def test_only_pristine_code_only_verified_receipts_count():
    assert ACCEPTED_VERIFICATION_TRUST == "pristine_code_only"
    assert verified_receipt(base()) is True


def test_same_user_write_receipt_is_not_verified_even_with_passing_report():
    assert verified_receipt(base(verification_trust="agent_code_executed_same_user")) is False


def test_receipt_without_trust_level_is_not_verified():
    r = base()
    del r["verification_trust"]
    assert verified_receipt(r) is False


def test_failing_or_malformed_receipts_are_not_verified():
    assert verified_receipt(base(status="verification_failed")) is False
    assert verified_receipt(base(verify={"report_ok": "yes"})) is False
    assert verified_receipt(None) is False


def test_evidence_is_taken_from_the_signed_receipt_fields_only():
    ev = evidence_from_receipt(base())
    assert ev == {"run_id": "run_unit", "task_id": "t-read", "status": "verified", "report_ok": True,
                  "verification_trust": "pristine_code_only", "attestation": "ab" * 32}


def test_no_attestation_means_no_evidence():
    r = base()
    del r["attestation"]
    assert evidence_from_receipt(r) is None
    assert evidence_from_receipt(base(attestation=None)) is None
