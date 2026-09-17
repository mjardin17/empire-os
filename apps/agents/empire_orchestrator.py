"""
orchestrator/empire_orchestrator.py — Empire OS master controller.

Reads MISSION_BOARD.json every 30 seconds, dispatches pending missions to
the correct agent, collects results, and writes them back to the board.
Multiple projects (GG + LO + IL + ED) run SIMULTANEOUSLY — every active
mission gets its own worker thread (ThreadPoolExecutor, max_workers=4).

What it executes itself (assigned_to claude/council):
  render       → empire_render.py subprocess per episode (multi-agent scene
                 building when the mission carries use_all_4_images/multi_agent),
                 then council 3-round eval on the final
  eval         → council_evaluator 3-round check on the target final MP4
  image_scout  → parallel multi-source image scout for the target prompt
  upload       → BLOCKED on purpose: YouTube uploads require Josh's manual
                 approval (standing rule) — mission is marked blocked
  script/build → left on the board for external agents (gemini/grok/...)

Missions assigned to gemini/grok/chatgpt/deepseek are external — those
agents claim them via the board; the orchestrator never touches them.

Heartbeat: orchestrator/state/heartbeat.json (pid + counters) — read by
council bot_11_orchestrator_monitor, which restarts us if we die.

Usage:
    python orchestrator/empire_orchestrator.py            # run forever
    python orchestrator/empire_orchestrator.py --once     # single pass (testing)
    python orchestrator/empire_orchestrator.py --interval 60
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Console safety (Windows cp1252 can't print ✅)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

BASE_DIR: Path = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from orchestrator.mission_board import MissionBoard, board  # noqa: E402

TAG = "[orchestrator]"
PYTHON_MAIN = Path(r"C:\Users\jjard\AppData\Local\Programs\Python\Python314\python.exe")
POLL_INTERVAL_SEC = 10
MAX_WORKERS = 12
STATE_DIR = BASE_DIR / "orchestrator" / "state"
HEARTBEAT_PATH = STATE_DIR / "heartbeat.json"

# Which assignees this process executes itself
SELF_AGENTS = ("claude", "council")

CHANNEL_RENDER_DIR: dict[str, str] = {
    "gg": "gods_glory", "lo": "little_olympus", "il": "iron_legends", "ed": "gods_glory",
}


def _log(msg: str) -> None:
    """Tagged stdout log line."""
    print(f"{TAG} {msg}", flush=True)


def _python() -> str:
    """Interpreter for child renders: pinned Windows path, else current."""
    return str(PYTHON_MAIN) if PYTHON_MAIN.exists() else sys.executable


class EmpireOrchestrator:
    """Master controller: board in, work dispatched, results back on board."""

    def __init__(self, mission_board: MissionBoard = board,
                 poll_interval: int = POLL_INTERVAL_SEC,
                 max_workers: int = MAX_WORKERS) -> None:
        self.board = mission_board
        self.poll_interval = poll_interval
        self.pool = ThreadPoolExecutor(max_workers=max_workers,
                                       thread_name_prefix="mission")
        self.futures: dict[str, Future[None]] = {}   # mission_id → worker future
        self.completed_today = 0
        self.failed_today = 0

    # ── Board helpers ─────────────────────────────────────────────────────
    def get_active_missions(self) -> list[dict[str, Any]]:
        """All in_progress missions on the board."""
        return self.board.get_by_status("in_progress")

    def update_mission(self, mission_id: str, status: str,
                       result: str = "", error: str = "") -> None:
        """Write a mission's outcome back to MISSION_BOARD.json atomically."""
        self.board.update_mission(mission_id, status=status, result=result, error=error)
        if status == "done":
            self.completed_today += 1
        elif status == "failed":
            self.failed_today += 1

    # ── Main loop ─────────────────────────────────────────────────────────
    def run(self, once: bool = False) -> None:
        """Main loop: heartbeat → reap finished threads → dispatch pending."""
        _log(f"Empire orchestrator online — pid {os.getpid()}, "
             f"poll every {self.poll_interval}s, {MAX_WORKERS} workers")
        while True:
            try:
                self._heartbeat()
                self._reap_finished()
                for mission in self.board.get_by_status("pending"):
                    if mission.get("assigned_to") in SELF_AGENTS:
                        self._launch(mission)
            except Exception as e:  # the loop never dies
                _log(f"loop error (recovering): {e}")
            if once:
                _log("--once pass complete, waiting for workers...")
                self.pool.shutdown(wait=True)
                self._reap_finished()
                return
            time.sleep(self.poll_interval)

    def _launch(self, mission: dict[str, Any]) -> None:
        """Claim a pending mission and hand it to a worker thread."""
        mid = str(mission.get("id"))
        if mid in self.futures and not self.futures[mid].done():
            return  # already running
        self.board.update_mission(mid, status="in_progress",
                                  notes=str(mission.get("notes", "")))
        _log(f"Mission {mid}: dispatched ({mission.get('type')} → "
             f"{mission.get('target')})")
        self.futures[mid] = self.pool.submit(self._run_mission_safe, mission)

    def _run_mission_safe(self, mission: dict[str, Any]) -> None:
        """Worker wrapper: absolute try/except so a mission can never crash us."""
        mid = str(mission.get("id"))
        try:
            self.dispatch_mission(mission)
        except Exception as e:
            _log(f"Mission {mid}: worker crashed — {e}")
            self.update_mission(mid, "failed", error=f"worker crash: {e}")

    def _reap_finished(self) -> None:
        """Drop completed futures from the tracking dict."""
        for mid in [m for m, f in self.futures.items() if f.done()]:
            del self.futures[mid]

    # ── Mission routing ───────────────────────────────────────────────────
    def dispatch_mission(self, mission: dict[str, Any]) -> None:
        """Route a mission to the correct handler by mission.type."""
        mtype = str(mission.get("type", "")).lower()
        handler = {
            "render": self._handle_render,
            "eval": self._handle_eval,
            "inspect": self._handle_eval,
            "image_scout": self._handle_image_scout,
            "upload": self._handle_upload,
        }.get(mtype)
        if handler is None:
            # script/build/etc. are for external agents or humans — release it
            self.board.update_mission(
                str(mission.get("id")), status="pending",
                error=f"type '{mtype}' not executable by orchestrator — left for its agent")
            _log(f"Mission {mission.get('id')}: type '{mtype}' left on board")
            return
        handler(mission)

    # ── Handlers ──────────────────────────────────────────────────────────
    def _handle_render(self, mission: dict[str, Any]) -> None:
        """Render every episode in mission.target via empire_render.py."""
        mid = str(mission.get("id"))
        channel = str(mission.get("channel", "gg")).lower()
        multi_agent = bool(mission.get("use_all_4_images") or mission.get("multi_agent"))
        episodes = [e.strip().upper() for e in str(mission.get("target", "")).split(",")
                    if e.strip()]
        if not episodes:
            self.update_mission(mid, "failed", error="render mission has no target episodes")
            return

        done: list[str] = []
        failed: list[str] = []
        for i, ep in enumerate(episodes, start=1):
            _log(f"Mission {mid}: episode {i}/{len(episodes)} — rendering {ep}"
                 + (" [multi-agent]" if multi_agent else ""))
            cmd = [_python(), str(BASE_DIR / "empire_render.py"),
                   "--channel", channel.upper(), "--episode", ep]
            if multi_agent:
                cmd.append("--multi-agent")
            try:
                proc = subprocess.run(cmd, cwd=str(BASE_DIR), capture_output=True,
                                      text=True, encoding="utf-8", errors="replace",
                                      timeout=4 * 3600)
                ok = proc.returncode == 0
            except Exception as e:
                _log(f"Mission {mid}: {ep} render subprocess error — {e}")
                ok = False

            final = (BASE_DIR / "renders" / CHANNEL_RENDER_DIR.get(channel, "gods_glory")
                     / f"{ep}_final.mp4")
            if ok and final.exists() and final.stat().st_size > 1_000_000:
                # Council 3-round eval on the finished final before accepting
                from orchestrator.agents.council_evaluator import evaluate
                verdict = evaluate(final, expected_duration_sec=0.0, tag=f"{mid} {ep}")
                if verdict.passed:
                    done.append(ep)
                    _log(f"Mission {mid}: {ep} ✅ rendered + council approved "
                         f"({final.stat().st_size // (1024 * 1024)}MB)")
                    continue
                _log(f"Mission {mid}: {ep} ❌ council rejected final — {verdict.reason}")
            failed.append(ep)

        result = f"rendered+approved: {','.join(done) or 'none'}"
        if failed:
            self.update_mission(mid, "failed", result=result,
                                error=f"failed episodes: {','.join(failed)}")
        else:
            self.update_mission(mid, "done", result=result)

    def _handle_eval(self, mission: dict[str, Any]) -> None:
        """Run council 3-round evaluation on target finals ('all' or ep list)."""
        from orchestrator.agents.council_evaluator import evaluate
        mid = str(mission.get("id"))
        channel = str(mission.get("channel", "gg")).lower()
        renders_dir = BASE_DIR / "renders" / CHANNEL_RENDER_DIR.get(channel, "gods_glory")
        target = str(mission.get("target", "all"))
        if target.lower() == "all":
            finals = sorted(renders_dir.glob("*_final.mp4"))
        else:
            finals = [renders_dir / f"{ep.strip().upper()}_final.mp4"
                      for ep in target.split(",") if ep.strip()]

        if not finals:
            self.update_mission(mid, "done", result="no finals to evaluate")
            return
        passed: list[str] = []
        rejected: list[str] = []
        for final in finals:
            if not final.exists():
                rejected.append(f"{final.stem}:missing")
                continue
            verdict = evaluate(final, expected_duration_sec=0.0, tag=f"{mid} {final.stem}")
            (passed if verdict.passed else rejected).append(
                final.stem if verdict.passed else f"{final.stem}:{verdict.reason}")
        result = f"passed {len(passed)}/{len(finals)}: {','.join(passed) or 'none'}"
        if rejected:
            self.update_mission(mid, "failed", result=result,
                                error=f"rejected: {'; '.join(rejected)}")
        else:
            self.update_mission(mid, "done", result=result)

    def _handle_image_scout(self, mission: dict[str, Any]) -> None:
        """Scout the mission target prompt across all sources in parallel."""
        from orchestrator.agents.image_scout import scout_image
        mid = str(mission.get("id"))
        prompt = str(mission.get("target", "")).strip()
        if not prompt:
            self.update_mission(mid, "failed", error="image_scout mission has no prompt")
            return
        out_dir = BASE_DIR / "output" / "image_scout" / mid
        results = scout_image(prompt, out_dir, "scout")
        if results:
            summary = "; ".join(f"{r.source}:{r.size_kb}KB:{r.path}" for r in results)
            self.update_mission(mid, "done", result=summary)
        else:
            self.update_mission(mid, "failed", error="all image sources failed")

    def _handle_upload(self, mission: dict[str, Any]) -> None:
        """Uploads are NEVER automatic — standing rule: Josh approves YouTube."""
        mid = str(mission.get("id"))
        self.board.update_mission(
            mid, status="blocked",
            error="YouTube uploads require Josh's manual approval — run "
                  "channel_uploader.py with --verify yourself, then mark done")
        _log(f"Mission {mid}: upload BLOCKED pending Josh's approval (standing rule)")

    # ── Heartbeat ─────────────────────────────────────────────────────────
    def _heartbeat(self) -> None:
        """Write liveness + counters for bot_11_orchestrator_monitor."""
        try:
            STATE_DIR.mkdir(parents=True, exist_ok=True)
            HEARTBEAT_PATH.write_text(json.dumps({
                "pid": os.getpid(),
                "ts": datetime.now(timezone.utc).isoformat(),
                "active_missions": len([f for f in self.futures.values() if not f.done()]),
                "completed_today": self.completed_today,
                "failed_today": self.failed_today,
            }, indent=2), encoding="utf-8")
        except Exception as e:
            _log(f"heartbeat write failed: {e}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Empire OS master orchestrator")
    parser.add_argument("--once", action="store_true",
                        help="Single dispatch pass then exit (testing)")
    parser.add_argument("--interval", type=int, default=POLL_INTERVAL_SEC,
                        help="Board poll interval in seconds (default 30)")
    args = parser.parse_args()
    EmpireOrchestrator(poll_interval=args.interval).run(once=args.once)


if __name__ == "__main__":
    main()
