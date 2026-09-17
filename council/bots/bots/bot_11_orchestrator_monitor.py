"""
bot_11_orchestrator_monitor.py — Orchestrator Watchdog Bot
==========================================================
Runs FIRST (priority 5, before every other bot) and guarantees the Empire
OS master orchestrator is alive:

  - Reads orchestrator/state/heartbeat.json (written every poll cycle)
  - Fresh heartbeat + live pid  → reports active/completed/failed counts
  - Stale heartbeat or dead pid → restarts via START_ORCHESTRATOR.bat
  - Also summarizes MISSION_BOARD.json (pending/in_progress/done/failed)

The orchestrator writes its heartbeat every poll (default 30s); anything
older than STALE_AFTER_SEC means it crashed or was never started.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import BASE_DIR, BotResult, CouncilBot

HEARTBEAT_PATH = BASE_DIR / "orchestrator" / "state" / "heartbeat.json"
MISSION_BOARD_PATH = BASE_DIR / "MISSION_BOARD.json"
START_BAT = BASE_DIR / "START_ORCHESTRATOR.bat"
STALE_AFTER_SEC = 180  # 6 missed 30s polls = dead


def _pid_alive(pid: int) -> bool:
    """Best-effort check that a pid is a live process (Windows + POSIX)."""
    try:
        if os.name == "nt":
            r = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
                capture_output=True, text=True, timeout=15,
            )
            return str(pid) in (r.stdout or "")
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def _heartbeat_age_sec(hb: dict) -> float | None:
    """Seconds since the heartbeat timestamp, or None if unparseable."""
    try:
        ts = datetime.fromisoformat(str(hb.get("ts", "")).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds()
    except Exception:
        return None


class OrchestratorMonitorBot(CouncilBot):
    name = "bot_11_orchestrator_monitor"
    description = "Watchdog: keeps empire_orchestrator.py alive, reports mission counts"
    priority = 5      # runs first, before everything else
    auto_fix = True   # restarts the orchestrator when it's down

    def run(self) -> BotResult:
        r = self.result
        self._report_board(r)

        # ── Liveness check ────────────────────────────────────────────────
        hb: dict = {}
        if HEARTBEAT_PATH.exists():
            try:
                hb = json.loads(HEARTBEAT_PATH.read_text(encoding="utf-8"))
            except Exception as e:
                r.warn(f"heartbeat unreadable: {e}")

        age = _heartbeat_age_sec(hb) if hb else None
        pid = int(hb.get("pid", 0)) if hb else 0
        alive = (age is not None and age < STALE_AFTER_SEC
                 and pid > 0 and _pid_alive(pid))

        if alive:
            r.ok(f"orchestrator alive (pid {pid}, heartbeat {age:.0f}s ago) — "
                 f"{hb.get('active_missions', 0)} active, "
                 f"{hb.get('completed_today', 0)} completed today, "
                 f"{hb.get('failed_today', 0)} failed")
            self.save_state({"orchestrator": "alive", "pid": pid})
            return r

        # ── Down → restart ────────────────────────────────────────────────
        why = ("no heartbeat file" if not hb
               else f"heartbeat stale ({age:.0f}s)" if age is not None and age >= STALE_AFTER_SEC
               else f"pid {pid} not running")
        r.warn(f"orchestrator DOWN — {why}")

        if not START_BAT.exists():
            r.error(f"cannot restart: {START_BAT} missing")
            return r
        try:
            if os.name == "nt":
                flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                subprocess.Popen(["cmd", "/c", str(START_BAT)], cwd=str(BASE_DIR),
                                 creationflags=flags,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:  # dev/test on non-Windows
                subprocess.Popen(["bash", str(START_BAT)], cwd=str(BASE_DIR),
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            r.fixed(f"orchestrator restarted via {START_BAT.name}")
            self.save_state({"orchestrator": "restarted", "reason": why})
        except Exception as e:
            r.error(f"restart failed: {e}")
        return r

    def _report_board(self, r: BotResult) -> None:
        """Summarize MISSION_BOARD.json status counts."""
        try:
            missions = json.loads(
                MISSION_BOARD_PATH.read_text(encoding="utf-8")).get("missions", [])
            counts: dict[str, int] = {}
            for m in missions:
                s = str(m.get("status", "unknown"))
                counts[s] = counts.get(s, 0) + 1
            summary = ", ".join(f"{k}:{v}" for k, v in sorted(counts.items()))
            r.ok(f"mission board: {len(missions)} missions ({summary})")
        except Exception as e:
            r.warn(f"mission board unreadable: {e}")


if __name__ == "__main__":
    bot = OrchestratorMonitorBot()
    result = bot.run()
    for msg in result.messages:
        print(msg)
