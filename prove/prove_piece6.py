import json
import os
import socket
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.mission_board import MissionBoardAdapter, command_center_dir, FORBIDDEN_PORTS

FACTORY = "MISSION_BOARD"
FIXTURE_TITLE = "[FIXTURE] Empire OS mission board proof order"
SEED_JOB_ID = "job_fixture_seed_do_not_touch"
SERVER_START_TIMEOUT_SEC = 40


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    if port in FORBIDDEN_PORTS:
        return free_port()
    return port


def start_command_center(board_path: str, port: int) -> subprocess.Popen:
    """Start the real empire-command-center server on a throwaway port + throwaway board file."""
    cc_dir = command_center_dir()
    tsx_cli = os.path.join(cc_dir, "node_modules", "tsx", "dist", "cli.mjs")
    if not os.path.exists(tsx_cli):
        raise RuntimeError(f"empire-command-center deps not installed ({tsx_cli} missing); run npm install --legacy-peer-deps there")
    env = {**os.environ, "PORT": str(port), "MISSION_BOARD_PATH": board_path, "NODE_ENV": "production"}
    return subprocess.Popen(["node", tsx_cli, "server.ts"], cwd=cc_dir, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_healthy(adapter: MissionBoardAdapter) -> bool:
    deadline = time.time() + SERVER_START_TIMEOUT_SEC
    while time.time() < deadline:
        if adapter.health():
            return True
        time.sleep(0.5)
    return False


def run_checks(adapter: MissionBoardAdapter, board_path: str) -> dict:
    checks = {}

    # Gate: approval without Joshua's flag sends NO request
    before = len(adapter.requests_made)
    gated = adapter.approve("order_does_not_matter", joshua_approved=False)
    checks["gate_blocks_unapproved"] = gated["status"] == "PENDING_APPROVAL" and len(adapter.requests_made) == before

    # Happy path: post -> claim -> proof -> approve
    posted = adapter.post_order(FIXTURE_TITLE, "Test fixture. Nothing is listed, published or synced.", created_by="prove_piece6")
    oid = posted["order"]["order_id"] if posted["order"] else None
    checks["posted_open"] = posted["order_status"] == "open"
    claimed = adapter.claim(oid, "agent-fixture-1")
    checks["claimed"] = claimed["order_status"] == "claimed"
    proofed = adapter.post_proof(oid, "agent-fixture-1", "FIXTURE PROOF: observed run of prove_piece6 (no real work done)")
    checks["proof_posted"] = proofed["order_status"] == "proof_posted"

    still = adapter.approve(oid, joshua_approved=False)
    checks["approve_without_flag_pending"] = still["status"] == "PENDING_APPROVAL" and adapter.get_order(oid)["order_status"] == "proof_posted"

    # Server also refuses a non-approver identity even if someone bypasses the adapter
    bad_identity = adapter._request("POST", f"/api/mission/orders/{oid}/approve", {"approved_by": "agent-fixture-1"})
    checks["non_approver_refused"] = bad_identity["http_status"] == 403 and adapter.get_order(oid)["order_status"] == "proof_posted"

    approved = adapter.approve(oid, joshua_approved=True)
    checks["approved"] = approved["status"] == "COMPLETED" and approved["order_status"] == "approved" \
        and approved["order"]["approved_by"] == "joshua"
    trail = [h["to"] for h in (approved["order"] or {}).get("history", [])]
    checks["history_trail"] = trail == ["open", "claimed", "proof_posted", "approved"]

    # Invalid transitions are rejected
    second = adapter.post_order(FIXTURE_TITLE + " (invalid-transition probe)", created_by="prove_piece6")
    sid = second["order"]["order_id"]
    skip = adapter.approve(sid, joshua_approved=True)  # open -> approved must be refused
    checks["open_to_approved_rejected"] = skip["status"] == "REJECTED" and skip["code"] == "INVALID_TRANSITION" \
        and adapter.get_order(sid)["order_status"] == "open"
    early_proof = adapter.post_proof(sid, "agent-fixture-1", "p")  # open -> proof_posted
    checks["open_to_proof_rejected"] = early_proof["status"] == "REJECTED" and early_proof["code"] == "INVALID_TRANSITION"
    adapter.claim(sid, "agent-fixture-1")
    double = adapter.claim(sid, "agent-fixture-2")
    checks["double_claim_rejected"] = double["status"] == "REJECTED" and double["code"] == "INVALID_TRANSITION"
    wrong_agent = adapter.post_proof(sid, "agent-fixture-2", "p")
    checks["wrong_agent_proof_rejected"] = wrong_agent["status"] == "REJECTED" and wrong_agent["code"] == "NOT_CLAIMER"
    claimed_to_approved = adapter.approve(sid, joshua_approved=True)
    checks["claimed_to_approved_rejected"] = claimed_to_approved["status"] == "REJECTED" \
        and claimed_to_approved["code"] == "INVALID_TRANSITION"
    redo = adapter.approve(oid, joshua_approved=True)
    checks["approved_is_terminal"] = redo["status"] == "REJECTED" and redo["code"] == "INVALID_TRANSITION"

    # Durable on the existing MISSION_BOARD.json, alongside (untouched) render jobs
    with open(board_path, encoding="utf-8") as f:
        board = json.load(f)
    stored = {o["order_id"]: o["status"] for o in board.get("orders", [])}
    checks["persisted_in_mission_board_json"] = stored.get(oid) == "approved" and stored.get(sid) == "claimed"
    checks["render_jobs_untouched"] = [j["job_id"] for j in board.get("jobs", [])] == [SEED_JOB_ID]

    # Adapter refuses BossListers / forbidden ports
    refused = 0
    for port in sorted(FORBIDDEN_PORTS):
        try:
            MissionBoardAdapter(f"http://localhost:{port}")
        except ValueError:
            refused += 1
    checks["forbidden_ports_refused"] = refused == len(FORBIDDEN_PORTS)

    checks["_ids"] = {"approved_order": oid, "probe_order": sid}
    return checks


def main():
    logger.info("Starting Piece 6 Verification Run: Mission Board adapter", factory=FACTORY)
    port = free_port()
    tmp = tempfile.mkdtemp(prefix="piece6_board_")
    board_path = os.path.join(tmp, "MISSION_BOARD.json")
    with open(board_path, "w", encoding="utf-8") as f:
        json.dump({"version": "1.0.0", "last_updated": "2026-01-01T00:00:00Z",
                   "jobs": [{"job_id": SEED_JOB_ID, "status": "complete"}]}, f)

    server = None
    checks = {}
    error = None
    try:
        server = start_command_center(board_path, port)
        adapter = MissionBoardAdapter(f"http://localhost:{port}")
        if not wait_healthy(adapter):
            raise RuntimeError(f"command center did not become healthy on port {port}")
        checks = run_checks(adapter, board_path)
    except Exception as e:  # report, do not fake
        error = str(e)
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()

    ids = checks.pop("_ids", {})
    print("\n--- PIECE 6 PROOF RESULT ---")
    print(f"Command center: empire-command-center (branch feat/mission-board) on throwaway port {port}, board file {board_path}")
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if ids:
        print(f"Order ids: {ids}")

    if error is None and checks and all(checks.values()):
        print("PIECE 6 VERIFIED: order posted -> claimed -> proof_posted -> approved (joshua gate); invalid transitions rejected; stored in MISSION_BOARD.json.\n")
    else:
        failed = [k for k, v in checks.items() if not v]
        print(f"PIECE 6 FAILED: failed={failed} error={error}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
