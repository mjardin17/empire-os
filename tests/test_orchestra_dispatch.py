"""
Approval must fail closed. Runs the REAL mission board server (node + tsx) against a stub AI Orchestra.
Tests that need the server are skipped (not faked) when node/tsx are unavailable.
"""
import importlib.util
import json
import os
import shutil
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from adapters.learn_loop import LearnLoopAdapter
from adapters.mission_board import MissionBoardAdapter, command_center_dir
from adapters.orchestra_dispatch import OrchestraDispatchAdapter, mint_write_grant, task_digest
from prove_piece6 import free_port, start_command_center, wait_healthy

FACILITY_AUTH_PATH = os.environ.get("FACILITY_AUTH_PATH", os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "ai-orchestra", "backend", "app", "facility_auth.py"))
TOKEN = "t" * 24
GRANT_SECRET = "g" * 24

WRITE_TASK = {"id": "t-write", "title": "Fix it", "fixture": "buggy_calc", "permissions": "write", "timeout_s": 30,
              "allowed_paths": ["calc.py"], "prompt": "fix calc.py", "verify": ["python", "-m", "pytest", "check_calc.py"]}
READ_TASK = {"id": "t-read", "title": "Read it", "fixture": "readonly_probe", "permissions": "read_only", "timeout_s": 30,
             "prompt": "read", "verify": ["python", "-m", "pytest", "check_noop.py"]}


def receipt(status="verified", report_ok=True, exit_code=0):
    return {"status": status, "model": "stub", "permissions": "write", "run_id": "run_abc123",
            "verify": {"exit_code": exit_code, "report": "stub", "report_ok": report_ok},
            "diff": {"changed": ["calc.py"], "added": [], "removed": []}, "candidate_lessons": []}


class Stub:
    """Tiny stand-in for AI Orchestra: returns a canned reply and records what it was sent."""

    def __init__(self):
        self.reply, self.http_status, self.seen = receipt(), 200, []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                stub.seen.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()},
                                  "body": json.loads(self.rfile.read(length) or b"{}")})
                data = json.dumps(stub.reply).encode()
                self.send_response(stub.http_status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.port = free_port()
        self.server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture(autouse=True)
def secrets(monkeypatch):
    monkeypatch.setenv("FACILITY_API_TOKEN", TOKEN)
    monkeypatch.setenv("FACILITY_GRANT_SECRET", GRANT_SECRET)


@pytest.fixture(scope="module")
def board_url():
    tsx = os.path.join(command_center_dir(), "node_modules", "tsx", "dist", "cli.mjs")
    if shutil.which("node") is None or not os.path.exists(tsx):
        pytest.skip("node or tsx is unavailable; real mission board server tests cannot run")
    tmp = tempfile.mkdtemp(prefix="orch_dispatch_test_")
    path = os.path.join(tmp, "MISSION_BOARD.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"version": "1.0.0", "last_updated": "2026-01-01T00:00:00Z", "jobs": []}, f)
    port = free_port()
    proc = start_command_center(path, port)
    url = f"http://localhost:{port}"
    try:
        if not wait_healthy(MissionBoardAdapter(url)):
            pytest.skip("mission board server did not become healthy")
        yield url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture()
def stub():
    s = Stub()
    yield s
    s.close()


@pytest.fixture()
def disp(board_url, stub, tmp_path):
    return OrchestraDispatchAdapter(MissionBoardAdapter(board_url), LearnLoopAdapter(storage_dir=str(tmp_path / "learn")),
                                    f"http://localhost:{stub.port}")


def raw_approve(board_url, order_id, approver="joshua"):
    req = urllib.request.Request(f"{board_url}/api/mission/orders/{order_id}/approve", method="POST",
                                 data=json.dumps({"approved_by": approver}).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def never_approved(disp):
    return not any("/approve" in r for r in disp.board.requests_made)


def order_of(disp, out):
    return disp.board.get_order(out["order_id"])["order"]


# ---- grant compatibility with the real AI Orchestra authorizer ----------------------------------

@pytest.fixture(scope="module")
def facility_auth():
    if not os.path.exists(FACILITY_AUTH_PATH):
        pytest.skip(f"facility_auth.py not found at {FACILITY_AUTH_PATH}")
    spec = importlib.util.spec_from_file_location("facility_auth_under_test", FACILITY_AUTH_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_digest_matches_orchestra(facility_auth):
    assert task_digest(WRITE_TASK) == facility_auth.task_digest(WRITE_TASK)
    assert task_digest(READ_TASK) == facility_auth.task_digest(READ_TASK)


def test_grant_verifies_with_facility_auth(facility_auth):
    grant = mint_write_grant(WRITE_TASK, GRANT_SECRET)
    facility_auth.check_write_grant(WRITE_TASK, grant)  # raises on mismatch
    assert len(grant.split(".")) == 3  # exp.nonce.mac
    assert mint_write_grant(WRITE_TASK, GRANT_SECRET) != grant  # fresh nonce every time


def test_grant_is_single_use(facility_auth):
    grant = mint_write_grant(WRITE_TASK, GRANT_SECRET)
    facility_auth.check_write_grant(WRITE_TASK, grant)
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant(WRITE_TASK, grant)


def test_title_is_bound_by_grant(facility_auth):
    grant = mint_write_grant(WRITE_TASK, GRANT_SECRET)
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant({**WRITE_TASK, "title": "different"}, grant)


def test_grant_is_bound_to_task_and_secret(facility_auth, monkeypatch):
    grant = mint_write_grant(WRITE_TASK, GRANT_SECRET)
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant({**WRITE_TASK, "prompt": "something else"}, grant)
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant(WRITE_TASK, mint_write_grant(WRITE_TASK, "x" * 24))  # forged with another secret
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant(WRITE_TASK, "1.deadbeef")
    monkeypatch.setenv("FACILITY_GRANT_SECRET", "short")  # server side too short -> write disabled
    with pytest.raises(facility_auth.AuthError):
        facility_auth.check_write_grant(WRITE_TASK, grant)


def test_dispatched_grant_header_verifies(disp, stub, facility_auth):
    disp.dispatch(WRITE_TASK, allow_write=True)
    seen = stub.seen[0]
    facility_auth.check_write_grant(seen["body"], seen["headers"]["x-facility-write-grant"])
    assert seen["headers"]["authorization"] == f"Bearer {TOKEN}"


# ---- fail-closed on anything that is not a verified receipt -------------------------------------

@pytest.mark.parametrize("status", ["verification_failed", "timeout", "permission_violation",
                                    "protected_file_violation", "agent_error"])
def test_unverified_receipt_never_approved(disp, stub, board_url, status):
    stub.reply = receipt(status=status, report_ok=False, exit_code=1)
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "FAILED"
    assert out["order_status"] == "proof_posted"
    assert never_approved(disp)
    order = order_of(disp, out)
    assert order["proof"].startswith("NOT VERIFIED:") and "run_abc123" in order["proof"]
    assert order["verification_status"] == "failed" and order["requires_verification"] is True
    code, body = raw_approve(board_url, out["order_id"])
    assert code == 409 and body.get("code") == "VERIFICATION_REQUIRED"
    assert disp.board.get_order(out["order_id"])["order_status"] == "proof_posted"


def test_status_verified_but_report_not_ok_is_not_verified(disp, stub, board_url):
    stub.reply = receipt(status="verified", report_ok=False)
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "FAILED" and out["order_status"] == "proof_posted" and never_approved(disp)
    assert raw_approve(board_url, out["order_id"])[0] == 409


@pytest.mark.parametrize("reply", [{"status": "verified"}, {"status": "verified", "verify": {"report_ok": "yes"}},
                                   {"status": "verified", "verify": "ok"}, ["verified"], {}])
def test_malformed_receipt_not_verified(disp, stub, board_url, reply):
    stub.reply = reply
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "FAILED" and out["order_status"] == "proof_posted" and never_approved(disp)
    assert order_of(disp, out)["proof"].startswith("NOT VERIFIED:")
    assert raw_approve(board_url, out["order_id"])[0] == 409


def test_orchestra_http_error_not_verified(disp, stub, board_url):
    stub.http_status, stub.reply = 500, {"detail": "boom"}
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "FAILED" and out["order_status"] == "proof_posted" and never_approved(disp)
    assert order_of(disp, out)["proof"].startswith("NOT VERIFIED:")
    assert raw_approve(board_url, out["order_id"])[0] == 409


def test_orchestra_unreachable_not_verified(board_url, tmp_path):
    d = OrchestraDispatchAdapter(MissionBoardAdapter(board_url), LearnLoopAdapter(storage_dir=str(tmp_path / "l")),
                                 f"http://localhost:{free_port()}")
    out = d.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "FAILED" and out["order_status"] == "proof_posted" and never_approved(d)
    assert raw_approve(board_url, out["order_id"])[0] == 409


# ---- verified paths -----------------------------------------------------------------------------

def test_verified_without_joshua_is_pending(disp, stub):
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=False)
    assert out["status"] == "COMPLETED" and out["approval"] == "PENDING_APPROVAL"
    assert out["order_status"] == "proof_posted" and never_approved(disp)
    order = order_of(disp, out)
    assert order["verification_status"] == "verified" and order["proof"].startswith("VERIFIED:")


def test_verified_with_joshua_reaches_approved(disp, stub):
    out = disp.dispatch(WRITE_TASK, allow_write=True, joshua_approved=True)
    assert out["status"] == "COMPLETED" and out["order_status"] == "approved"
    assert any("/approve" in r for r in disp.board.requests_made)


def test_proof_text_has_no_local_paths(disp, stub):
    stub.reply = {**receipt(), "receipt_path": "C:\\Users\\x\\receipts\\run.json"}
    out = disp.dispatch(WRITE_TASK, allow_write=True)
    proof = order_of(disp, out)["proof"]
    assert "C:\\" not in proof and "receipt_path" not in proof and "run_abc123" in proof


def test_read_only_task_sends_token_but_no_grant(disp, stub):
    out = disp.dispatch(READ_TASK, allow_write=False)
    assert out["status"] == "COMPLETED"
    headers = stub.seen[0]["headers"]
    assert headers["authorization"] == f"Bearer {TOKEN}" and "x-facility-write-grant" not in headers


# ---- refusals happen before anything is posted --------------------------------------------------

def test_write_without_allow_write_rejected_no_requests(disp, stub):
    out = disp.dispatch(WRITE_TASK, allow_write=False, joshua_approved=True)
    assert out["status"] == "REJECTED" and disp.board.requests_made == [] and stub.seen == []


def test_missing_api_token_rejected_no_requests(disp, stub, monkeypatch):
    monkeypatch.delenv("FACILITY_API_TOKEN")
    for task, aw in ((READ_TASK, False), (WRITE_TASK, True)):
        out = disp.dispatch(task, allow_write=aw)
        assert out["status"] == "REJECTED"
    assert disp.board.requests_made == [] and stub.seen == []


def test_short_api_token_rejected(disp, stub, monkeypatch):
    monkeypatch.setenv("FACILITY_API_TOKEN", "short")
    assert disp.dispatch(READ_TASK)["status"] == "REJECTED" and disp.board.requests_made == []


@pytest.mark.parametrize("value", [None, "short", "x" * 15])
def test_missing_or_short_grant_secret_rejected(disp, stub, monkeypatch, value):
    if value is None:
        monkeypatch.delenv("FACILITY_GRANT_SECRET")
    else:
        monkeypatch.setenv("FACILITY_GRANT_SECRET", value)
    out = disp.dispatch(WRITE_TASK, allow_write=True)
    assert out["status"] == "REJECTED" and disp.board.requests_made == [] and stub.seen == []


@pytest.mark.parametrize("bad", [{**WRITE_TASK, "allowed_paths": []}, {**WRITE_TASK, "allowed_paths": None},
                                 {**WRITE_TASK, "allowed_paths": "calc.py"}, {**WRITE_TASK, "allowed_paths": [""]},
                                 {**WRITE_TASK, "permissions": "root"}, {**WRITE_TASK, "id": ""}, {**WRITE_TASK, "extra": 1}, "not a dict"])
def test_invalid_task_rejected_no_requests(disp, stub, bad):
    out = disp.dispatch(bad, allow_write=True)
    assert out["status"] == "REJECTED" and disp.board.requests_made == [] and stub.seen == []


def test_forbidden_ports_still_refused(board_url):
    for port in (3001, 3002):
        with pytest.raises(ValueError):
            OrchestraDispatchAdapter(MissionBoardAdapter(board_url), None, f"http://localhost:{port}")
    with pytest.raises(ValueError):
        OrchestraDispatchAdapter(MissionBoardAdapter(board_url), None, "http://example.com:8000")
