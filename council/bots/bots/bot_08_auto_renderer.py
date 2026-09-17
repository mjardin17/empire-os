"""
bot_08_auto_renderer.py — Auto Renderer Bot
Reads the render queue and auto-triggers the unified boss tool for ALL channels:
  - GG / LO / IL episodes → empire_render.py (unified pipeline)
  - Legacy fallback       → auto_render.py, ONLY if empire_render.py is missing
Marks episodes as in-progress so other council runs don't double-trigger.
Updated by [FABLE] — unified boss-tool routing.
"""

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR, STATE_DIR

# Music paths per pipeline
GG_MUSIC_PATH  = BASE_DIR / "music" / "gg_battle_theme.mp3"
OLD_MUSIC_PATH = BASE_DIR / "music" / "battle_epic.mp3"

# Render scripts
EMPIRE_RENDER = BASE_DIR / "empire_render.py"   # Boss tool — unified GG/LO/IL pipeline
AUTO_RENDER   = BASE_DIR / "auto_render.py"     # Legacy fallback ONLY

MAX_PER_RUN = 1   # render 1 episode per council run (don't hog CPU for hours)

# Channels empire_render.py handles + where their finals land
EMPIRE_CHANNELS: dict[str, str] = {
    "GG": "gods_glory",
    "LO": "little_olympus",
    "IL": "iron_legends",
}


def _episode_channel(episode_id: str) -> str:
    """Extract the channel code from an episode ID (GG_EP012 → GG)."""
    return episode_id.upper().split("_")[0]


def _final_path(renders_dir: Path, episode_id: str) -> Path | None:
    """Locate an episode's final MP4 (channel subdir first, then flat legacy layout)."""
    channel = _episode_channel(episode_id)
    candidates = []
    if sub := EMPIRE_CHANNELS.get(channel):
        candidates.append(renders_dir / sub / f"{episode_id}_final.mp4")
    candidates.append(renders_dir / f"{episode_id}_final.mp4")
    for p in candidates:
        if p.exists() and p.stat().st_size > 1_000_000:
            return p
    return None


def _load_queue(queue_path: Path) -> list[dict]:
    if queue_path.exists():
        try:
            return json.loads(queue_path.read_text())
        except Exception:
            pass
    return []


def _save_queue(queue: list[dict], queue_path: Path):
    queue_path.write_text(json.dumps(queue, indent=2))


def _build_empire_cmd(episode_id: str, channel: str, item: dict) -> list[str] | None:
    """
    Build the empire_render.py command for an episode.
    Returns None if required inputs (e.g. Higgsfield clips dir) are missing.
    """
    cmd = [sys.executable, str(EMPIRE_RENDER), "--channel", channel, "--episode", episode_id]

    # Explicit script path from the queue item, if provided
    if script := item.get("script_path"):
        if Path(script).exists():
            cmd += ["--script", str(script)]

    # Music: GG default handled inside empire_render.py; queue may override
    if music := item.get("music"):
        if Path(music).exists():
            cmd += ["--music", str(music)]

    # LO/IL need pre-generated Higgsfield clips
    if channel in ("LO", "IL"):
        clips_dir = Path(item.get("clips_dir") or (BASE_DIR / "higgsfield_clips" / episode_id))
        if not clips_dir.exists() or not any(clips_dir.glob("scene_*.mp4")):
            return None
        cmd += ["--clips-dir", str(clips_dir)]

    return cmd


class AutoRendererBot(CouncilBot):
    name = "bot_auto_renderer"
    description = "Routes ALL channels (GG/LO/IL) → empire_render.py; auto_render.py legacy fallback (1 per run)"
    priority = 60
    auto_fix = True

    def run(self) -> BotResult:
        r = self.result
        queue_path = self.state_dir / "render_queue.json"
        queue = _load_queue(queue_path)

        pending     = [q for q in queue if q.get("status") == "pending"]
        in_progress = [q for q in queue if q.get("status") == "in_progress"]

        # Check if an in-progress render finished since last run
        for q in list(in_progress):
            if final := _final_path(self.renders_dir, q["episode_id"]):
                q["status"] = "done"
                q["completed_at"] = datetime.now().isoformat()
                r.fixed(f"{q['episode_id']}: render completed ✓ → {final.name}")
                in_progress.remove(q)
        _save_queue(queue, queue_path)

        # Don't start a new render if one is still in progress
        if in_progress:
            r.ok(f"Render in progress: {in_progress[0]['episode_id']} — waiting")
            return r

        if not pending:
            r.ok("Render queue is empty — nothing to do")
            return r

        use_empire = EMPIRE_RENDER.exists()
        if not use_empire and not AUTO_RENDER.exists():
            r.error(f"No renderer found: neither {EMPIRE_RENDER} nor {AUTO_RENDER} exists")
            return r
        if not use_empire:
            r.error(f"empire_render.py missing at {EMPIRE_RENDER} — falling back to legacy auto_render.py")

        for item in pending[:MAX_PER_RUN]:
            ep_id = item["episode_id"].upper()
            channel = _episode_channel(ep_id)

            if use_empire and channel in EMPIRE_CHANNELS:
                # ── Boss tool: empire_render.py ───────────────────────────
                cmd = _build_empire_cmd(ep_id, channel, item)
                if cmd is None:
                    r.error(f"{ep_id}: Higgsfield clips missing in higgsfield_clips/{ep_id}/ — "
                            f"run higgsfield_prep.py --episode {ep_id} and generate clips first")
                    item["status"] = "blocked"
                    item["blocked_at"] = datetime.now().isoformat()
                    continue
                self.log(f"[EMPIRE] Launching: {ep_id} via empire_render.py ({channel})")
                r.ok(f"[EMPIRE] Starting: {ep_id} — {item.get('title', '')[:40]}")
            else:
                # ── Legacy fallback: auto_render.py ───────────────────────
                cmd = [sys.executable, str(AUTO_RENDER), "--episode", ep_id]
                if OLD_MUSIC_PATH.exists():
                    cmd += ["--music", str(OLD_MUSIC_PATH)]
                self.log(f"[Legacy] Launching: {ep_id} via auto_render.py")
                r.ok(f"[Legacy] Starting: {ep_id} — {item.get('title', '')[:40]}")

            # Mark in-progress BEFORE launching so other bots see it
            item["status"] = "in_progress"
            item["started_at"] = datetime.now().isoformat()
            _save_queue(queue, queue_path)

            # Run render (blocking — this is the long part)
            try:
                result = subprocess.run(cmd, timeout=7200)  # 2 hour max per episode
                returncode = result.returncode
            except subprocess.TimeoutExpired:
                returncode = -1
                r.error(f"{ep_id}: render timed out after 2 hours")

            final = _final_path(self.renders_dir, ep_id)
            if returncode == 0 and final:
                item["status"] = "done"
                item["completed_at"] = datetime.now().isoformat()
                r.fixed(f"{ep_id}: render complete → {final.stat().st_size // 1_048_576}MB")
            elif returncode == 0:
                item["status"] = "failed"
                item["failed_at"] = datetime.now().isoformat()
                r.error(f"{ep_id}: render finished but no final MP4 found")
            else:
                item["status"] = "failed"
                item["failed_at"] = datetime.now().isoformat()
                r.error(f"{ep_id}: render exited with code {returncode}")

        _save_queue(queue, queue_path)
        return r
