"""
orchestrator/mission_board.py — Thread-safe MISSION_BOARD.json manager.

MISSION_BOARD.json is the central coordination file for the whole empire:
every agent (claude / gemini / grok / chatgpt / deepseek / council) reads
missions from it and writes results back to it.

This module is the ONLY sanctioned way for Python code to touch the board:
  - read()                     — load current board (dict)
  - write_mission(mission)     — append a new mission (auto-id if missing)
  - update_mission(id, **kw)   — atomically update fields on one mission
  - get_by_status(status)      — filter missions by status
  - get_by_agent(agent)        — filter missions by assigned_to

Safety:
  - In-process:  threading.RLock around every read-modify-write
  - Cross-process: filelock (if installed) via MISSION_BOARD.json.lock;
    graceful fallback to in-process lock only when filelock is absent
  - Atomic writes: temp file + os.replace — a crash mid-write can never
    leave a half-written board on disk
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

BASE_DIR: Path = Path(__file__).resolve().parent.parent
BOARD_PATH: Path = BASE_DIR / "MISSION_BOARD.json"

MISSION_TYPES: tuple[str, ...] = ("render", "upload", "script", "image_scout", "eval", "build")
AGENTS: tuple[str, ...] = ("claude", "gemini", "grok", "chatgpt", "deepseek", "council")
STATUSES: tuple[str, ...] = ("pending", "in_progress", "done", "failed", "blocked")

TAG = "[mission_board]"

# Optional cross-process lock (filelock library). Fallback: in-process only.
try:
    from filelock import FileLock  # type: ignore

    _FILE_LOCK: Optional["FileLock"] = FileLock(str(BOARD_PATH) + ".lock", timeout=30)
except Exception:  # filelock not installed — threading lock still protects us
    _FILE_LOCK = None

_THREAD_LOCK = threading.RLock()


class _BoardLock:
    """Combined in-process + (optional) cross-process lock context manager."""

    def __enter__(self) -> "_BoardLock":
        _THREAD_LOCK.acquire()
        if _FILE_LOCK is not None:
            try:
                _FILE_LOCK.acquire()
            except Exception:
                pass  # never deadlock the pipeline over a lock file
        return self

    def __exit__(self, *exc: object) -> None:
        if _FILE_LOCK is not None:
            try:
                _FILE_LOCK.release()
            except Exception:
                pass
        _THREAD_LOCK.release()


def _now_iso() -> str:
    """Current UTC time in ISO-8601 with Z suffix."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class MissionBoard:
    """Thread-safe manager for MISSION_BOARD.json."""

    def __init__(self, board_path: Path = BOARD_PATH) -> None:
        self.board_path = board_path

    # ── Core I/O ──────────────────────────────────────────────────────────
    def read(self) -> dict[str, Any]:
        """Load the current board. Returns an empty board if missing/corrupt."""
        with _BoardLock():
            return self._read_unlocked()

    def _read_unlocked(self) -> dict[str, Any]:
        """Read board without acquiring locks (caller must hold _BoardLock)."""
        try:
            with open(self.board_path, "r", encoding="utf-8") as f:
                board = json.load(f)
            if not isinstance(board.get("missions"), list):
                board["missions"] = []
            return board
        except FileNotFoundError:
            return {"updated_at": _now_iso(), "missions": []}
        except Exception as e:
            print(f"{TAG} board corrupt ({e}) — returning empty board", flush=True)
            return {"updated_at": _now_iso(), "missions": []}

    def _write_unlocked(self, board: dict[str, Any]) -> None:
        """Atomic write: temp file + os.replace (caller must hold _BoardLock)."""
        board["updated_at"] = _now_iso()
        tmp = self.board_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(board, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.board_path)

    # ── Public API ────────────────────────────────────────────────────────
    def write_mission(self, mission_dict: dict[str, Any]) -> dict[str, Any]:
        """
        Append a new mission. Fills in id (m###, next free), status (pending),
        created_at, result, error if missing. Returns the stored mission.
        """
        with _BoardLock():
            board = self._read_unlocked()
            missions: list[dict[str, Any]] = board["missions"]
            mission = dict(mission_dict)
            if not mission.get("id"):
                mission["id"] = self._next_id(missions)
            mission.setdefault("status", "pending")
            mission.setdefault("result", "")
            mission.setdefault("error", "")
            mission.setdefault("created_at", _now_iso())
            missions.append(mission)
            self._write_unlocked(board)
            return mission

    def update_mission(self, mission_id: str, **kwargs: Any) -> bool:
        """
        Atomically update fields on one mission (read-modify-write under lock).
        Returns True if the mission was found and updated.
        """
        with _BoardLock():
            board = self._read_unlocked()
            for mission in board["missions"]:
                if mission.get("id") == mission_id:
                    mission.update(kwargs)
                    mission["last_updated"] = _now_iso()
                    self._write_unlocked(board)
                    return True
        print(f"{TAG} update_mission: id '{mission_id}' not found", flush=True)
        return False

    def get_mission(self, mission_id: str) -> Optional[dict[str, Any]]:
        """Return one mission by id, or None."""
        for mission in self.read()["missions"]:
            if mission.get("id") == mission_id:
                return mission
        return None

    def get_by_status(self, status: str) -> list[dict[str, Any]]:
        """All missions with the given status."""
        return [m for m in self.read()["missions"] if m.get("status") == status]

    def get_by_agent(self, agent: str) -> list[dict[str, Any]]:
        """All missions assigned to the given agent."""
        return [m for m in self.read()["missions"] if m.get("assigned_to") == agent]

    # ── Helpers ───────────────────────────────────────────────────────────
    @staticmethod
    def _next_id(missions: list[dict[str, Any]]) -> str:
        """Next free m### id."""
        highest = 0
        for m in missions:
            mid = str(m.get("id", ""))
            if mid.startswith("m") and mid[1:].isdigit():
                highest = max(highest, int(mid[1:]))
        return f"m{highest + 1:03d}"


# Module-level singleton — every agent shares one manager (one lock).
board = MissionBoard()
