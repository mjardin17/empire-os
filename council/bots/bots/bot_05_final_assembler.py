"""
bot_05_final_assembler.py — Final Assembler Bot
Rebuilds final MP4s for episodes where clips changed or final is missing/broken.
Reads state from clip_rebuilder and image_healer to know what to reassemble.
"""

import subprocess
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR, STATE_DIR

MUSIC_DIR = BASE_DIR / "music"
MIN_FINAL_SECONDS = 300


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
    for c in ["ffprobe", r"C:\ffmpeg\bin\ffprobe.exe"]:
        try:
            subprocess.run([c, "-version"], capture_output=True, check=True)
            return c
        except Exception:
            continue
    return "ffprobe"


def _get_duration(path: Path, ffprobe: str) -> float:
    try:
        r = subprocess.run(
            [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=15
        )
        return float(r.stdout.strip() or 0)
    except Exception:
        return 0.0


def _find_music() -> str | None:
    for name in ["battle_epic.mp3", "epic.mp3", "background.mp3"]:
        p = MUSIC_DIR / name
        if p.exists():
            return str(p)
    candidates = list(MUSIC_DIR.glob("*.mp3"))
    return str(candidates[0]) if candidates else None


def _assemble_final(ep_id: str, ep_dir: Path, ffmpeg: str, ffprobe: str,
                    renders_dir: Path) -> tuple[bool, str]:
    """Concat all scene clips and mix with music. Returns (success, message)."""
    clips = sorted(ep_dir.glob("scene_[0-9][0-9].mp4"),
                   key=lambda p: int(p.stem.split("_")[1]))
    valid_clips = [c for c in clips if c.stat().st_size > 500_000]

    if not valid_clips:
        return False, "no valid clips to assemble"

    # Write concat list
    concat_list = ep_dir / "concat_list.txt"
    concat_list.write_text(
        "\n".join(f"file '{c}'" for c in valid_clips),
        encoding="utf-8"
    )

    raw_mp4 = ep_dir / f"{ep_id}_raw.mp4"
    # Step 1: concat clips
    cmd_concat = [
        ffmpeg, "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list),
        "-c", "copy", str(raw_mp4)
    ]
    r = subprocess.run(cmd_concat, capture_output=True, timeout=600)
    if r.returncode != 0 or not raw_mp4.exists() or raw_mp4.stat().st_size == 0:
        return False, f"concat failed: {r.stderr.decode(errors='replace')[:200]}"

    # Step 2: mix with music
    renders_dir.mkdir(exist_ok=True)
    final_mp4 = renders_dir / f"{ep_id}_final.mp4"
    music = _find_music()

    if music:
        vid_dur = _get_duration(raw_mp4, ffprobe)
        cmd_mix = [
            ffmpeg, "-y",
            "-i", str(raw_mp4),
            "-stream_loop", "-1", "-i", music,
            "-filter_complex",
            f"[1:a]volume=0.08,atrim=0:duration={vid_dur}[bg];"
            f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-shortest",
            str(final_mp4)
        ]
    else:
        cmd_mix = [
            ffmpeg, "-y", "-i", str(raw_mp4),
            "-c", "copy", str(final_mp4)
        ]

    r2 = subprocess.run(cmd_mix, capture_output=True, timeout=600)
    if r2.returncode != 0 or not final_mp4.exists():
        return False, f"music mix failed: {r2.stderr.decode(errors='replace')[:200]}"

    dur = _get_duration(final_mp4, ffprobe)
    return True, f"{len(valid_clips)} clips → {dur:.0f}s final"


class FinalAssemblerBot(CouncilBot):
    name = "bot_final_assembler"
    description = "Rebuilds final MP4s after clips are repaired or when finals are missing"
    priority = 50
    auto_fix = True

    def run(self) -> BotResult:
        r = self.result
        ffmpeg = _find_ffmpeg()
        ffprobe = _find_ffprobe()

        import json

        if not self.output_dir.exists():
            r.ok(f"No output dir yet for {self.channel_name} — nothing to assemble")
            return r

        # Collect episodes flagged by upstream bots (channel-scoped state)
        episodes_to_assemble = set()
        for state_file in ["bot_clip_rebuilder.json", "bot_image_healer.json"]:
            state_path = self.state_dir / state_file
            if state_path.exists():
                try:
                    state = json.loads(state_path.read_text())
                    for key in ["episodes_rebuilt", "episodes_needing_clip_rebuild"]:
                        episodes_to_assemble.update(state.get(key, []))
                except Exception:
                    pass

        # Also check for episodes with no final at all
        for ep_dir in sorted(self.output_dir.iterdir()):
            if not ep_dir.is_dir() or ep_dir.name.startswith("_"):
                continue
            final = self.renders_dir / f"{ep_dir.name}_final.mp4"
            if not final.exists():
                episodes_to_assemble.add(ep_dir.name)

        if not episodes_to_assemble:
            r.ok("No episodes need final assembly")
            return r

        for ep_id in sorted(episodes_to_assemble):
            ep_dir = self.output_dir / ep_id
            if not ep_dir.exists():
                r.warn(f"{ep_id}: output directory not found")
                continue

            self.log(f"Assembling final for {ep_id}…")
            success, msg = _assemble_final(ep_id, ep_dir, ffmpeg, ffprobe,
                                           renders_dir=self.renders_dir)
            if success:
                r.fixed(f"{ep_id}: {msg}")
            else:
                r.error(f"{ep_id}: {msg}")

        return r
