"""
bot_01_guardian.py — Render Guardian Bot
Scans all episode output folders for broken scene clips and short finals.
Priority 10 — runs first so other bots know what's broken.
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

MIN_CLIP_BYTES = 500_000


def _ffprobe_dur(path: Path) -> float:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=15
        )
        return float(r.stdout.strip() or 0)
    except Exception:
        return 0.0


class GuardianBot(CouncilBot):
    name = "bot_guardian"
    description = "Scans output folders for 0KB clips and broken/missing finals"
    priority = 10
    auto_fix = False  # guardian only reports; clip_rebuilder fixes

    def run(self) -> BotResult:
        r = self.result
        broken_episodes = []
        if not self.output_dir.exists():
            r.ok(f"No output dir yet for {self.channel_name} — nothing to scan")
            return r

        all_episodes = sorted(d for d in self.output_dir.iterdir()
                              if d.is_dir() and not d.name.startswith("_"))

        for ep_dir in all_episodes:
            ep_id = ep_dir.name
            clips = sorted(ep_dir.glob("scene_[0-9][0-9].mp4"))
            bad_clips = [c for c in clips
                         if c.stat().st_size == 0 or c.stat().st_size < MIN_CLIP_BYTES]

            final = self.renders_dir / f"{ep_id}_final.mp4"
            final_ok = final.exists() and _ffprobe_dur(final) >= self.min_final_sec

            if bad_clips:
                names = [c.name for c in bad_clips]
                r.warn(f"{ep_id}: {len(bad_clips)} broken clip(s): {', '.join(names)}")
                broken_episodes.append({"episode": ep_id, "bad_clips": names})
            elif not final.exists():
                r.warn(f"{ep_id}: no final MP4 found")
                broken_episodes.append({"episode": ep_id, "bad_clips": []})
            else:
                dur = _ffprobe_dur(final)
                if dur < self.min_final_sec:
                    r.warn(f"{ep_id}: final too short ({dur:.0f}s)")
                    broken_episodes.append({"episode": ep_id, "bad_clips": []})
                else:
                    r.ok(f"{ep_id}: {len(clips)} clips, final={dur:.0f}s")

        self.save_state({"broken_episodes": broken_episodes})

        if not broken_episodes:
            r.status = "ok"
        else:
            r.next_action = "bot_clip_rebuilder"

        return r
