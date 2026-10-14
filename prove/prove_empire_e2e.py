import json
import os
import shutil
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from shared import logger
from adapters.mission_board import MissionBoardAdapter
from adapters.learn_loop import LearnLoopAdapter
from adapters.roof import EmpireRoof
from prove_piece6 import free_port, start_command_center, wait_healthy

FACTORY = "ROOF"


def bosslisters_up() -> bool:
    try:
        with urllib.request.urlopen("http://localhost:3001/api/health", timeout=10) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    logger.info("Starting Empire OS end-to-end verification (all four factories under the roof)", factory=FACTORY)
    port = free_port()
    tmp = tempfile.mkdtemp(prefix="empire_e2e_")
    board_path = os.path.join(tmp, "MISSION_BOARD.json")
    with open(board_path, "w", encoding="utf-8") as f:
        json.dump({"version": "1.0.0", "last_updated": "2026-01-01T00:00:00Z", "jobs": []}, f)

    server = None
    checks, summary, error = {}, None, None
    try:
        checks["bosslisters_running_on_3001"] = bosslisters_up()
        server = start_command_center(board_path, port)
        board = MissionBoardAdapter(f"http://localhost:{port}")
        checks["mission_board_healthy"] = wait_healthy(board)
        if not all(checks.values()):
            raise RuntimeError(f"preconditions failed: {checks}")

        learn = LearnLoopAdapter(storage_dir=os.path.join(tmp, "learn"))
        roof = EmpireRoof(board, learn)

        # Production behaviour: nothing approved, nothing live.
        summary = roof.run(joshua_approved=False)
        steps = summary["steps"]
        checks["all_4_factories_ran_ok"] = summary["factories_ok"] == 4 and summary["factories_total"] == 4
        checks["every_factory_dry_run"] = all(s.get("gate_mode") == "DRY_RUN" for s in steps)
        checks["4_orders_at_proof_posted"] = all(s.get("order_status") == "proof_posted" for s in steps)
        checks["approval_withheld_without_joshua"] = all(s.get("approval") == "PENDING_APPROVAL" for s in steps)

        events = learn.read_events()
        checks["4_learn_events_success"] = len(events) == 4 and all(e["outcome"] == "success" for e in events)
        checks["learn_summary_scores_all_factories"] = (
            sorted(summary["learn_summary"].keys()) == ["BOOK_MAKER", "BOSSLISTERS", "MERCH_FACTORY", "VIDEO_STUDIO"]
        )

        with open(board_path, "r", encoding="utf-8") as f:
            persisted = json.load(f).get("orders", [])
        checks["board_file_persisted_4_orders"] = len(persisted) == 4 and all(o["status"] == "proof_posted" for o in persisted)

        # Joshua's gate: approving one order is the only way it reaches `approved`.
        approved = board.approve(steps[0]["order_id"], joshua_approved=True)
        checks["joshua_approval_reaches_approved"] = approved.get("order_status") == "approved"
        still_pending = [board.get_order(s["order_id"])["order_status"] for s in steps[1:]]
        checks["other_orders_still_proof_posted"] = all(s == "proof_posted" for s in still_pending)
    except Exception as e:  # report, do not fake
        error = str(e)
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=10)
            except Exception:
                server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n--- EMPIRE OS END-TO-END PROOF RESULT ---")
    if summary:
        print(f"Run: {summary['run_id']}  Status: {summary['status']}  Roof gate: {summary['gate_mode']}  Factories OK: {summary['factories_ok']}/{summary['factories_total']}")
        for s in summary["steps"]:
            print(f"  [{'OK ' if s.get('ok') else 'BAD'}] {s['factory']:<14} mode={s.get('gate_mode')} order={s.get('order_status')} approval={s.get('approval')}")
            print(f"        proof: {s.get('proof')}")
        print(f"Learn loop scores: {json.dumps(summary['learn_summary'])}")
    for name, ok in checks.items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    if error:
        print(f"ERROR: {error}")

    if checks and all(checks.values()) and not error:
        print("EMPIRE OS END-TO-END VERIFIED: video + book + merch + BossListers ran under one roof; orders posted/claimed/proofed on the mission board; every result scored in the learn loop; nothing went live; approval stayed with Joshua.\n")
    else:
        print("EMPIRE OS END-TO-END FAILED: see checks above.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
