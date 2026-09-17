"""
bot_06_render_queue.py — Render Queue Bot
Maintains a queue of episodes that need full renders.
Detects episodes where the script is full but no output exists yet.
Can trigger auto_render.py for queued episodes.
"""

import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import (CouncilBot, BotResult, BASE_DIR, STATE_DIR,
                              estimate_scenes_duration)

MIN_FULL_DURATION = 600


def _load_queue(queue_path: Path) -> list[dict]:
    if queue_path.exists():
        try:
            return json.loads(queue_path.read_text())
        except Exception:
            pass
    return []


def _save_queue(queue: list[dict], queue_path: Path):
    queue_path.parent.mkdir(parents=True, exist_ok=True)
    queue_path.write_text(json.dumps(queue, indent=2))


def _scan_full_scripts(prompts_dir: Path, ep_prefix: str) -> dict[str, dict]:
    """Find all full scripts (>= 600s) in a channel's prompts directory."""
    full_scripts: dict[str, dict] = {}
    if not prompts_dir.exists():
        return full_scripts
    for p in sorted(prompts_dir.rglob("*.json")):
        if any(part.startswith("_") for part in p.relative_to(prompts_dir).parts[:-1]):
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        scenes = data.get("scenes", [])
        ep_id = data.get("episode_id", "")
        if not ep_id:
            stem = p.stem.lower()
            prefix_lower = ep_prefix.lower()
            idx = stem.find(prefix_lower)
            if idx != -1:
                ep_id = stem[idx:].split(".")[0].upper()
        if not ep_id:
            continue
        total_dur = estimate_scenes_duration(scenes)
        if total_dur >= MIN_FULL_DURATION:
            # Canonical scripts are named {EP_ID}_*.json (e.g. GG_EP002_cannae.json).
            # They ALWAYS beat legacy names (scene_prompts.gg_ep002.final.json),
            # regardless of duration — legacy files must never win selection.
            canonical = p.stem.upper().startswith(ep_id.upper())
            prev = full_scripts.get(ep_id)
            if prev is None or (canonical, total_dur) > (prev["canonical_name"],
                                                         prev["total_duration_sec"]):
                full_scripts[ep_id] = {
                    "episode_id": ep_id,
                    "script_path": str(p),
                    "scene_count": len(scenes),
                    "total_duration_sec": total_dur,
                    "title": data.get("title", "?"),
                    "canonical_name": canonical,
                }
    return full_scripts


class RenderQueueBot(CouncilBot):
    name = "bot_render_queue"
    description = "Tracks which episodes have scripts but no renders; manages render queue"
    priority = 30
    auto_fix = False  # queue management only; set auto_fix=True to auto-trigger renders

    def run(self) -> BotResult:
        r = self.result
        queue_path = self.state_dir / "render_queue.json"
        full_scripts = _scan_full_scripts(self.prompts_dir, self.ep_prefix)
        queue = _load_queue(queue_path)
        queued_ids = {q["episode_id"] for q in queue}

        newly_queued = []
        already_rendered = []
        in_queue = []

        for ep_id, script_info in sorted(full_scripts.items()):
            # Check if rendered
            final = self.renders_dir / f"{ep_id}_final.mp4"
            has_output = (self.output_dir / ep_id).exists() if self.output_dir.exists() else False

            if final.exists() and final.stat().st_size > 1_000_000:
                already_rendered.append(ep_id)
                # Remove from queue if it was there
                queue = [q for q in queue if q["episode_id"] != ep_id]
                continue

            if ep_id in queued_ids:
                in_queue.append(ep_id)
                r.ok(f"{ep_id}: already queued — {script_info['title'][:40]}")
                continue

            # Needs rendering
            queue.append({
                "episode_id": ep_id,
                "title": script_info["title"],
                "script_path": script_info["script_path"],
                "scene_count": script_info["scene_count"],
                "total_duration_sec": script_info["total_duration_sec"],
                "queued_at": datetime.now().isoformat(),
                "status": "pending",
                "has_partial_output": has_output,
            })
            newly_queued.append(ep_id)
            r.warn(f"{ep_id}: QUEUED for render — {script_info['title'][:40]}")

        _save_queue(queue, queue_path)

        r.ok(f"{len(already_rendered)} rendered, {len(in_queue)} in queue, {len(newly_queued)} newly queued")

        pending = [q for q in queue if q.get("status") == "pending"]
        if pending:
            r.ok(f"Render queue: {len(pending)} episode(s) waiting")
            for q in pending[:5]:
                r.ok(f"  → {q['episode_id']}: {q['title'][:40]}")
            if len(pending) > 5:
                r.ok(f"  ... and {len(pending)-5} more")
            r.next_action = (f"py auto_render.py --episode {pending[0]['episode_id']} "
                             f"--channel {self.channel}")

        self.save_state({
            "total_full_scripts": len(full_scripts),
            "rendered": len(already_rendered),
            "queued": len(pending),
        })

        return r
