"""
bot_04_clip_rebuilder.py — Clip Rebuilder Bot
Fixes 0KB or tiny scene clips by re-rendering from audio + images.
Reads guardian state to know which episodes need attention.
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR, STATE_DIR

MIN_CLIP_BYTES = 500_000
W, H = 1920, 1080


def _find_ffmpeg() -> str:
    for c in ["ffmpeg", r"C:\ffmpeg\bin\ffmpeg.exe",
              r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"]:
        try:
            subprocess.run([c, "-version"], capture_output=True, check=True)
            return c
        except Exception:
            continue
    return "ffmpeg"


def _find_ffprobe() -> str:
    for c in ["ffprobe", r"C:\ffmpeg\bin\ffprobe.exe",
              r"C:\Program Files\ffmpeg\bin\ffprobe.exe"]:
        try:
            subprocess.run([c, "-version"], capture_output=True, check=True)
            return c
        except Exception:
            continue
    return "ffprobe"


def _audio_duration(audio: Path, ffprobe: str) -> float:
    try:
        r = subprocess.run(
            [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(audio)],
            capture_output=True, text=True, timeout=10
        )
        return float(r.stdout.strip() or 30)
    except Exception:
        return 30.0


def _rebuild_clip(ep_dir: Path, clip: Path, ffmpeg: str, ffprobe: str) -> bool:
    """Re-render a single scene clip from its audio and images."""
    num = clip.stem.replace("scene_", "")
    audio = ep_dir / f"scene_{num}.mp3"
    if not audio.exists() or audio.stat().st_size == 0:
        return False

    images = []
    for i in range(1, 5):
        for ext in ("jpg", "png"):
            img = ep_dir / f"scene_{num}_{i}.{ext}"
            if img.exists() and img.stat().st_size > 20_000:
                images.append(img)
                break

    if not images:
        return False

    total_dur = _audio_duration(audio, ffprobe)
    seg_dur = total_dur / len(images)
    fps = 25
    frames = max(1, int(seg_dur * fps))

    # Build zoompan filter for each image
    inputs = []
    for img in images:
        inputs += ["-loop", "1", "-t", f"{seg_dur:.3f}", "-i", str(img)]

    filter_parts = []
    for idx in range(len(images)):
        filter_parts.append(
            f"[{idx}:v]scale=8000:-1,"
            f"zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={frames}:s={W}x{H}:fps={fps}[v{idx}]"
        )
    concat_in = "".join(f"[v{i}]" for i in range(len(images)))
    filter_parts.append(f"{concat_in}concat=n={len(images)}:v=1:a=0[vout]")

    cmd = (
        [ffmpeg, "-y"]
        + inputs
        + ["-i", str(audio),
           "-filter_complex", ";".join(filter_parts),
           "-map", "[vout]", "-map", f"{len(images)}:a",
           "-c:v", "libx264", "-preset", "fast", "-crf", "23",
           "-c:a", "aac", "-shortest", str(clip)]
    )

    result = subprocess.run(cmd, capture_output=True, timeout=300)
    return (result.returncode == 0 and clip.exists()
            and clip.stat().st_size > MIN_CLIP_BYTES)


class ClipRebuilderBot(CouncilBot):
    name = "bot_clip_rebuilder"
    description = "Re-renders 0KB or tiny scene clips from audio + images"
    priority = 40
    auto_fix = True

    def run(self) -> BotResult:
        r = self.result
        ffmpeg = _find_ffmpeg()
        ffprobe = _find_ffprobe()

        if not self.output_dir.exists():
            r.ok(f"No output dir yet for {self.channel_name} — nothing to rebuild")
            return r

        # Read guardian state (channel-scoped) to know which episodes to check
        guardian_state = {}
        guardian_state_path = self.state_dir / "bot_guardian.json"
        if guardian_state_path.exists():
            import json
            try:
                guardian_state = json.loads(guardian_state_path.read_text())
            except Exception:
                pass

        broken = guardian_state.get("broken_episodes", [])
        if broken:
            ep_ids = [b["episode"] for b in broken]
            r.ok(f"Guardian flagged {len(ep_ids)} episode(s): {', '.join(ep_ids)}")
        else:
            # Fallback: scan all
            ep_ids = [d.name for d in sorted(self.output_dir.iterdir())
                     if d.is_dir() and not d.name.startswith("_")]

        episodes_rebuilt = []
        for ep_id in ep_ids:
            ep_dir = self.output_dir / ep_id
            if not ep_dir.exists():
                continue

            bad_clips = [
                c for c in sorted(ep_dir.glob("scene_[0-9][0-9].mp4"))
                if c.stat().st_size < MIN_CLIP_BYTES
            ]

            if not bad_clips:
                continue

            r.warn(f"{ep_id}: {len(bad_clips)} clip(s) need rebuild")
            rebuilt = 0
            for clip in bad_clips:
                self.log(f"Rebuilding {ep_id}/{clip.name}…")
                if _rebuild_clip(ep_dir, clip, ffmpeg, ffprobe):
                    r.fixed(f"{ep_id}/{clip.name} rebuilt")
                    rebuilt += 1
                else:
                    r.error(f"{ep_id}/{clip.name}: rebuild failed (missing audio/images?)")

            if rebuilt > 0:
                episodes_rebuilt.append(ep_id)

        self.save_state({"episodes_rebuilt": episodes_rebuilt})
        if episodes_rebuilt:
            r.next_action = "bot_final_assembler"

        return r
