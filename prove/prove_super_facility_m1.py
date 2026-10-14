"""
Super Facility Milestone 1 proof: Empire OS task -> AI Orchestra -> isolated workspace -> verifier -> receipt -> mission board -> learn loop.

Uses the Claude subscription CLI (no API keys). It makes up to 3 real model calls, so it only runs with --live.
Everything runs on throwaway ports, a throwaway board file and a throwaway Orchestra database; no repo is modified.
"""
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from shared import logger
from adapters.mission_board import MissionBoardAdapter
from adapters.learn_loop import LearnLoopAdapter
from adapters.orchestra_dispatch import OrchestraDispatchAdapter
from prove_piece6 import free_port, start_command_center, wait_healthy

FACTORY = "FACILITY_M1"
ORCHESTRA_DIR = os.environ.get("AI_ORCHESTRA_DIR", os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "ai-orchestra"))
START_TIMEOUT_SEC = 60

FIX_TASK = {"id": "m1-fix", "title": "Fix average()", "fixture": "buggy_calc", "permissions": "write", "timeout_s": 240,
            "allowed_paths": ["calc.py"],
            "prompt": "calc.py has a bug: average() returns the wrong mean. Read check_calc.py and calc.py, then fix calc.py.",
            "verify": ["python", "-m", "pytest", "check_calc.py"]}
IDLE_TASK = {**FIX_TASK, "id": "m1-idle", "title": "Idle (expected verification failure)",
             "prompt": "Do NOT change any file. Reply with the single word DONE."}
READ_TASK = {"id": "m1-read", "title": "Count lines", "fixture": "readonly_probe", "permissions": "read_only", "timeout_s": 240,
             "prompt": "Read notes.txt and tell me how many lines it has. Do not create or change any file.",
             "verify": ["python", "-m", "pytest", "check_noop.py"]}


def start_orchestra(port: int, workdir: str, receipts: str, workspaces: str, token: str, grant_secret: str) -> subprocess.Popen:
    backend = os.path.join(ORCHESTRA_DIR, "backend")
    env = {**os.environ, "PYTHONPATH": backend, "FACILITY_RECEIPT_DIR": receipts, "FACILITY_WORKSPACE_ROOT": workspaces,
           "FACILITY_API_TOKEN": token, "FACILITY_GRANT_SECRET": grant_secret,
           "FACILITY_ENABLE_PROVIDER_EXEC": "1", "FACILITY_ENABLE_WRITE_EXEC": "1", "PYTHONDONTWRITEBYTECODE": "1"}
    return subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port), "--log-level", "warning"],
                            cwd=workdir, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def orchestra_up(port: int) -> bool:
    deadline = time.time() + START_TIMEOUT_SEC
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://localhost:{port}/api/lessons", timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def raw_approve(board_url: str, order_id: str, approver: str):
    """Returns (http_status, body). Used to prove the SERVER refuses approvals the adapter would never send."""
    req = urllib.request.Request(f"{board_url}/api/mission/orders/{order_id}/approve", method="POST",
                                 data=json.dumps({"approved_by": approver}).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def stop(proc):
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


def main():
    if "--live" not in sys.argv:
        print("This proof makes up to 3 real Claude CLI calls (subscription, no API keys). Re-run with --live.")
        sys.exit(2)
    logger.info("Starting Super Facility Milestone 1 proof", factory=FACTORY)
    tmp = tempfile.mkdtemp(prefix="facility_m1_")
    board_path, receipts, odir = os.path.join(tmp, "MISSION_BOARD.json"), os.path.join(tmp, "receipts"), os.path.join(tmp, "orchestra")
    os.makedirs(odir)
    workspaces = os.path.join(tmp, "workspaces")
    os.makedirs(workspaces)
    # Per-run random secrets, passed only through the environment (never printed or written to disk).
    token, grant_secret = secrets.token_hex(24), secrets.token_hex(24)
    os.environ["FACILITY_API_TOKEN"], os.environ["FACILITY_GRANT_SECRET"] = token, grant_secret
    with open(board_path, "w", encoding="utf-8") as f:
        json.dump({"version": "1.0.0", "last_updated": "2026-01-01T00:00:00Z", "jobs": []}, f)

    board_proc = orch_proc = None
    checks, results, error = {}, {}, None
    try:
        bport, oport = free_port(), free_port()
        board_proc = start_command_center(board_path, bport)
        orch_proc = start_orchestra(oport, odir, receipts, workspaces, token, grant_secret)
        board = MissionBoardAdapter(f"http://localhost:{bport}")
        checks["mission_board_healthy"] = wait_healthy(board)
        checks["orchestra_healthy"] = orchestra_up(oport)
        if not all(checks.values()):
            raise RuntimeError(f"preconditions failed: {checks}")
        learn = LearnLoopAdapter(storage_dir=os.path.join(tmp, "learn"))
        disp = OrchestraDispatchAdapter(board, learn, f"http://localhost:{oport}")

        # Policy: a write task without allow_write is refused before anything is posted.
        n = len(board.requests_made)
        refused = disp.dispatch(FIX_TASK, allow_write=False)
        checks["write_task_refused_without_grant"] = refused["status"] == "REJECTED" and len(board.requests_made) == n

        # 1. Happy path: model fixes the bug, the verifier (not the model) says pass.
        fix = disp.dispatch(FIX_TASK, allow_write=True, joshua_approved=False)
        rc = fix.get("receipt") or {}
        checks["fix_verified_by_pytest"] = fix["status"] == "COMPLETED" and rc.get("status") == "verified" and (rc.get("verify") or {}).get("exit_code") == 0
        checks["fix_only_calc_py_changed"] = (rc.get("diff") or {}).get("changed") == ["calc.py"]
        checks["fix_order_at_proof_posted"] = fix.get("order_status") == "proof_posted" and fix.get("approval") == "PENDING_APPROVAL"

        # Missing/forged credentials are refused before anything is posted.
        n = len(board.requests_made)
        saved = os.environ.pop("FACILITY_API_TOKEN")
        no_token = disp.dispatch(READ_TASK)
        os.environ["FACILITY_API_TOKEN"] = saved
        checks["missing_token_refused_before_posting"] = no_token["status"] == "REJECTED" and len(board.requests_made) == n

        # 2. Failure path: nothing fixed -> verification_failed -> pending, unverified candidate lesson.
        idle = disp.dispatch(IDLE_TASK, allow_write=True)
        ic = idle.get("receipt") or {}
        checks["idle_fails_verification"] = idle["status"] == "FAILED" and ic.get("status") == "verification_failed"
        checks["idle_order_stays_proof_posted"] = idle.get("order_status") == "proof_posted" and idle.get("approval") is None
        code, body = raw_approve(f"http://localhost:{bport}", idle["order_id"], "joshua")
        checks["raw_approve_of_failed_order_is_409"] = code == 409 and body.get("code") == "VERIFICATION_REQUIRED"
        checks["candidate_lesson_pending_unverified"] = len(ic.get("candidate_lessons", [])) == 1 and ic["candidate_lessons"][0]["verified"] == 0
        with urllib.request.urlopen(f"http://localhost:{oport}/api/lessons") as r:
            ledger = json.loads(r.read())
        checks["lesson_in_ledger_not_active"] = bool(ledger) and all(l["status"] == "pending" and l["verified"] == 0 for l in ledger)

        # 3. Read-only task: allowed without write grant, workspace untouched.
        ro = disp.dispatch(READ_TASK, allow_write=False)
        rr = ro.get("receipt") or {}
        checks["read_only_verified_and_untouched"] = ro["status"] == "COMPLETED" and not any((rr.get("diff") or {}).values())

        # Approval: server rejects a blank approver; only Joshua's explicit approval reaches `approved`.
        code, _ = raw_approve(f"http://localhost:{bport}", fix["order_id"], "")
        checks["blank_approver_rejected_by_board"] = code in (400, 403)
        approved = board.approve(fix["order_id"], joshua_approved=True)  # fix order is verified, so this is allowed
        checks["joshua_approval_reaches_approved"] = approved.get("order_status") == "approved"
        checks["failed_order_not_approved"] = board.get_order(idle["order_id"])["order_status"] == "proof_posted"

        events = learn.read_events("ORCHESTRA_DISPATCH")
        checks["learn_events_3_recorded"] = [e["outcome"] for e in events] == ["success", "failure", "success"]
        results = {"fix": fix, "idle": idle, "read": ro}
    except Exception as e:
        error = str(e)
    finally:
        stop(orch_proc)
        stop(board_proc)

    print("\n--- SUPER FACILITY M1 PROOF RESULT ---")
    for name, r in results.items():
        rc = r.get("receipt") or {}
        print(f"  {name:<5} dispatch={r['status']} receipt={rc.get('status')} model={rc.get('model')} verify_exit={(rc.get('verify') or {}).get('exit_code')} "
              f"diff={(rc.get('diff') or {}).get('changed')} order={r.get('order_status')}")
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if error:
        print(f"ERROR: {error}")
    ok = checks and all(checks.values()) and not error
    print("SUPER FACILITY M1 VERIFIED" if ok else "SUPER FACILITY M1 FAILED: see checks above.")
    shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
