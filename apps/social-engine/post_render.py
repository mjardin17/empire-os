#!/usr/bin/env python3
"""
post_render.py — Empire OS post-render hook
===========================================
Called by empire_render.py the moment the council APPROVES a final MP4:

  1. Writes an upload mission to MISSION_BOARD.json
     (type="upload", assigned_to="council", status="pending")
  2. Creates UPLOAD_{CHANNEL}_{EPISODE}.bat — YouTube upload (Josh approves
     manually, per standing rules) + automatic social publish afterwards
  3. Updates latest_episodes.json (website feed) with status "rendered"
  4. Prints the clear next step for Josh

Every step is best-effort: a failure here never kills a finished render.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR: Path = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from social_clips.auto_publisher import update_latest_episodes  # noqa: E402

TAG = "[post_render]"
MISSION_BOARD = BASE_DIR / "MISSION_BOARD.json"
PYTHON = r"C:\Users\jjard\AppData\Local\Programs\Python\Python314\python.exe"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_upload_mission(episode_id: str, channel: str, final_path: Path) -> None:
    try:
        board = json.loads(MISSION_BOARD.read_text(encoding="utf-8")) \
            if MISSION_BOARD.exists() else {"updated_at": _now(), "missions": []}
    except Exception:
        board = {"updated_at": _now(), "missions": []}
    missions = board.setdefault("missions", [])
    mission_id = f"upload_{episode_id.lower()}"
    entry = {
        "id": mission_id,
        "type": "upload",
        "status": "pending",
        "assigned_to": "council",
        "channel": channel.lower(),
        "target": episode_id,
        "priority": 1,
        "notes": (f"Council-approved final at {final_path}. Josh runs "
                  f"UPLOAD_{channel.upper()}_{episode_id}.bat, then social "
                  f"clips auto-post."),
        "result": "",
        "error": "",
        "updated_at": _now(),
    }
    for i, m in enumerate(missions):
        if m.get("id") == mission_id:
            missions[i] = entry
            break
    else:
        missions.append(entry)
    board["updated_at"] = _now()
    MISSION_BOARD.write_text(json.dumps(board, indent=2, ensure_ascii=False),
                             encoding="utf-8")


def _write_upload_bat(episode_id: str, channel: str) -> Path:
    """UPLOAD_{CHANNEL}_{EPISODE}.bat — YouTube upload then auto social publish."""
    channel = channel.lower()
    bat = BASE_DIR / f"UPLOAD_{channel.upper()}_{episode_id.upper()}.bat"
    bat.write_text(
        "@echo off\r\n"
        f"cd /d {BASE_DIR}\r\n"
        f"echo === Empire OS: upload {episode_id} to YouTube ({channel}) ===\r\n"
        f"\"{PYTHON}\" channel_uploader.py --channel {channel} "
        f"--episodes {episode_id}\r\n"
        "if errorlevel 1 (\r\n"
        "  echo Upload failed or aborted - social publish NOT run.\r\n"
        "  pause\r\n"
        "  exit /b 1\r\n"
        ")\r\n"
        "echo === YouTube done - auto-posting social clips ===\r\n"
        f"\"{PYTHON}\" social_clips\\auto_publisher.py "
        f"--episode {episode_id} --channel {channel}\r\n"
        "pause\r\n",
        encoding="utf-8",
    )
    return bat


def on_council_approved(channel: str, episode_id: str, final_path: Path,
                        title: str = "") -> None:
    """Post-render hook — call after council QC passes. Never raises."""
    episode_id = episode_id.upper()
    channel_key = channel.lower()
    try:
        _write_upload_mission(episode_id, channel_key, final_path)
    except Exception as e:
        print(f"{TAG} mission board write failed (non-fatal): {e}", file=sys.stderr)
    bat_name = f"UPLOAD_{channel_key.upper()}_{episode_id}.bat"
    try:
        bat = _write_upload_bat(episode_id, channel_key)
        bat_name = bat.name
    except Exception as e:
        print(f"{TAG} upload bat write failed (non-fatal): {e}", file=sys.stderr)
    try:
        update_latest_episodes(episode_id, channel_key, title=title,
                               status="rendered")
    except Exception as e:
        print(f"{TAG} latest_episodes.json update failed (non-fatal): {e}",
              file=sys.stderr)
    print(f"[empire_render] ✅ Ready to upload. Run: {bat_name} to post to "
          f"YouTube, then social clips auto-post.")
