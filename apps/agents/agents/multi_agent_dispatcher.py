"""
orchestrator/agents/multi_agent_dispatcher.py — Race every capable agent,
keep the best result.

Three dispatch patterns:

  1. best_image(prompt, ...)            — Gemini + Pollinations generate at the
     same time; the larger/better image wins.
  2. dispatch_script_improvement(...)   — writes TWO missions to
     MISSION_BOARD.json (assigned_to gemini AND grok), waits for both agents
     to write results back, council picks the winner (longest substantive
     result; first non-empty if only one delivers).
  3. first_video(prompt, ...)           — FAL + Replicate generate
     simultaneously; whichever finishes FIRST with valid output wins, the
     loser is abandoned.

Never raises — every path returns a result or None.
"""

from __future__ import annotations

import sys
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Optional

BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from orchestrator.agents.image_scout import ImageResult, scout_image  # noqa: E402
from orchestrator.mission_board import board  # noqa: E402

TAG = "[multi_agent_dispatcher]"
MAX_WORKERS = 4
SCRIPT_WAIT_TIMEOUT_SEC = 1800.0   # 30 min for external agents to answer
SCRIPT_POLL_INTERVAL_SEC = 20.0
VIDEO_RACE_TIMEOUT_SEC = 600.0


def _log(msg: str) -> None:
    """Tagged stdout log line."""
    print(f"{TAG} {msg}", flush=True)


# ── Pattern 1: parallel image generation, best wins ───────────────────────────
def best_image(prompt: str, work_dir: Path, tag: str) -> Optional[ImageResult]:
    """
    Generate `prompt` with Gemini AND Pollinations simultaneously and return
    the larger/better image (image_scout already ranks by size).
    """
    results = scout_image(prompt, work_dir, tag, sources=["gemini", "pollinations"])
    if not results:
        _log(f"{tag}: no generator produced an image")
        return None
    winner = results[0]
    _log(f"{tag}: winner {winner.source} ({winner.size_kb}KB) "
         f"over {len(results) - 1} rival(s)")
    return winner


# ── Pattern 2: script improvement via mission board (gemini vs grok) ──────────
def dispatch_script_improvement(task_description: str, target: str,
                                channel: str = "gg",
                                timeout_sec: float = SCRIPT_WAIT_TIMEOUT_SEC,
                                ) -> Optional[dict[str, str]]:
    """
    Post the same script task to gemini AND grok on MISSION_BOARD.json, wait
    for both to write results back, and let the council pick the winner.

    External agents (Gemini/Grok sessions Josh runs) claim missions by
    setting status="done" and filling `result`.

    Returns {"agent": winner, "result": text, "mission_id": id} or None on
    timeout with no results.
    """
    mission_ids: dict[str, str] = {}
    for agent in ("gemini", "grok"):
        mission = board.write_mission({
            "type": "script",
            "status": "pending",
            "assigned_to": agent,
            "channel": channel,
            "target": target,
            "priority": 5,
            "notes": f"[dispatcher race] {task_description}",
        })
        mission_ids[agent] = str(mission["id"])
        _log(f"script race: mission {mission['id']} posted for {agent}")

    deadline = time.monotonic() + timeout_sec
    results: dict[str, str] = {}
    while time.monotonic() < deadline and len(results) < len(mission_ids):
        for agent, mid in mission_ids.items():
            if agent in results:
                continue
            mission = board.get_mission(mid)
            if mission and mission.get("status") == "done" and str(mission.get("result", "")).strip():
                results[agent] = str(mission["result"])
                _log(f"script race: {agent} delivered ({len(results[agent])} chars)")
        if len(results) < len(mission_ids):
            time.sleep(SCRIPT_POLL_INTERVAL_SEC)

    if not results:
        _log("script race: NO agent delivered before timeout")
        for mid in mission_ids.values():
            board.update_mission(mid, status="failed", error="dispatcher race timeout")
        return None

    # Council pick: longest substantive result wins (more complete script work)
    winner_agent = max(results, key=lambda a: len(results[a]))
    _log(f"script race: council picks {winner_agent} "
         f"({len(results[winner_agent])} chars vs "
         f"{ {a: len(r) for a, r in results.items()} })")
    return {"agent": winner_agent, "result": results[winner_agent],
            "mission_id": mission_ids[winner_agent]}


# ── Pattern 3: video race — first valid output wins ───────────────────────────
def _try_provider_video(provider_name: str, prompt: str, duration_sec: int,
                        dest: Path) -> Optional[Path]:
    """Run one named video provider end-to-end. Returns clip path or None."""
    try:
        from providers.waterfall import _run_video_provider
        if provider_name == "fal_video":
            from providers.fal_video import FalVideoProvider
            provider = FalVideoProvider()
        elif provider_name == "replicate":
            from providers.replicate_video import ReplicateVideoProvider
            provider = ReplicateVideoProvider()
        else:
            return None
        if not provider.is_connected():
            return None
        return _run_video_provider(provider, provider_name, prompt, duration_sec,
                                   "16:9", dest)
    except Exception as e:
        _log(f"{provider_name}: error — {e}")
        return None


def first_video(prompt: str, duration_sec: int, work_dir: Path,
                tag: str) -> Optional[Path]:
    """
    Race FAL and Replicate simultaneously; return whichever finishes FIRST
    with a valid (>10KB) clip. Returns None if both fail/time out.
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures: dict[Future[Optional[Path]], str] = {
            pool.submit(_try_provider_video, name, prompt, duration_sec,
                        work_dir / f"{tag}_{name}.mp4"): name
            for name in ("fal_video", "replicate")
        }
        pending = set(futures)
        deadline = time.monotonic() + VIDEO_RACE_TIMEOUT_SEC
        while pending and time.monotonic() < deadline:
            done, pending = wait(pending, timeout=10.0, return_when=FIRST_COMPLETED)
            for future in done:
                name = futures[future]
                try:
                    clip = future.result()
                except Exception as e:
                    _log(f"{tag}: {name} crashed — {e}")
                    continue
                if clip is not None and clip.exists() and clip.stat().st_size > 10_000:
                    _log(f"{tag}: {name} wins the race ✅ "
                         f"({clip.stat().st_size // 1024}KB)")
                    for p in pending:
                        p.cancel()  # abandon the loser
                    return clip
                _log(f"{tag}: {name} finished with no valid clip")
    _log(f"{tag}: video race — both providers failed")
    return None
