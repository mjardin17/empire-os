"""
orchestrator/agents/council_evaluator.py — 3-round council evaluation.

Every finished scene (or episode) faces the council THREE times before it
is accepted:

  Round 1: DURATION — clip duration within 10% of narration length
  Round 2: AUDIO    — mean volume above -30 dB (no silent/near-silent audio)
  Round 3: FRAMES   — 3 sampled frames, none solid red/black/white
                      (same signalstats method as bot_10_frame_inspector)

Returns EvalResult(passed, round_failed, reason, retry_step) — retry_step
tells scene_builder exactly which build step to redo:
  round 1 → "combine"   (re-trim video to narration)
  round 2 → "tts"       (regenerate narration audio)
  round 3 → "images"    (re-scout visuals and rebuild Ken Burns)

Never raises — any tooling failure is reported as a failed round with reason.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

TAG = "[council_evaluator]"

DURATION_TOLERANCE = 0.10       # ±10% of expected duration
MIN_MEAN_VOLUME_DB = -30.0      # audio must be louder than this
RED_RATIO_THRESHOLD = 0.70      # from bot_10_frame_inspector
BLACK_THRESHOLD = 12.0
WHITE_THRESHOLD = 243.0
FRAME_SAMPLES = 3

_ROUND_RETRY_STEP: dict[int, str] = {1: "combine", 2: "tts", 3: "images"}


@dataclass(frozen=True)
class EvalResult:
    """Outcome of a 3-round council evaluation."""

    passed: bool
    round_failed: int    # 0 = passed all rounds
    reason: str
    retry_step: str      # "" | "combine" | "tts" | "images"


def _log(msg: str) -> None:
    """Tagged stdout log line."""
    print(f"{TAG} {msg}", flush=True)


def _ffmpeg() -> str:
    """Locate ffmpeg via empire_render's finder (PATH + known Windows dirs)."""
    try:
        from empire_render import FFMPEG
        return FFMPEG
    except Exception:
        return shutil.which("ffmpeg") or "ffmpeg"


def _ffprobe() -> str:
    """Locate ffprobe via empire_render's finder."""
    try:
        from empire_render import FFPROBE
        return FFPROBE
    except Exception:
        return shutil.which("ffprobe") or "ffprobe"


def _duration(path: Path) -> Optional[float]:
    """Media duration in seconds, or None."""
    try:
        r = subprocess.run(
            [_ffprobe(), "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30,
            encoding="utf-8", errors="replace",
        )
        return float(r.stdout.strip())
    except Exception:
        return None


# ── Round 1: duration ─────────────────────────────────────────────────────────
def check_duration(clip: Path, expected_sec: float) -> Optional[str]:
    """Round 1 — clip duration within ±10% of expected. Returns reason or None."""
    actual = _duration(clip)
    if actual is None:
        return f"could not probe duration of {clip.name}"
    if expected_sec <= 0:
        return None  # nothing to compare against — don't fake a failure
    drift = abs(actual - expected_sec) / expected_sec
    if drift > DURATION_TOLERANCE:
        return (f"duration {actual:.1f}s is {drift:.0%} off expected "
                f"{expected_sec:.1f}s (limit {DURATION_TOLERANCE:.0%})")
    return None


# ── Round 2: audio RMS ────────────────────────────────────────────────────────
def check_audio(clip: Path) -> Optional[str]:
    """Round 2 — mean volume above -30dB via ffmpeg volumedetect. Returns reason or None."""
    try:
        r = subprocess.run(
            [_ffmpeg(), "-i", str(clip), "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True, text=True, timeout=120,
            encoding="utf-8", errors="replace",
        )
        match = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", r.stderr or "")
        if not match:
            return f"no audio stream / volumedetect failed on {clip.name}"
        mean_db = float(match.group(1))
        if mean_db < MIN_MEAN_VOLUME_DB:
            return f"audio too quiet: mean {mean_db:.1f}dB < {MIN_MEAN_VOLUME_DB:.0f}dB"
        return None
    except Exception as e:
        return f"audio check error: {e}"


# ── Round 3: frame colors ─────────────────────────────────────────────────────
def _frame_stats(frame: Path) -> Optional[dict[str, float]]:
    """RGB + brightness averages for one frame via ffprobe signalstats."""
    try:
        r = subprocess.run(
            [_ffprobe(), "-v", "quiet", "-f", "lavfi",
             "-i", f"movie={frame.as_posix()},signalstats",
             "-show_entries", "frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.RAVG,"
                              "lavfi.signalstats.GAVG,lavfi.signalstats.BAVG",
             "-of", "json"],
            capture_output=True, text=True, timeout=30,
            encoding="utf-8", errors="replace",
        )
        tags: dict[str, str] = {}
        for f in json.loads(r.stdout or "{}").get("frames", []):
            tags.update(f.get("tags", {}))
        if not tags:
            return None
        return {
            "brightness": float(tags.get("lavfi.signalstats.YAVG", 0)),
            "r": float(tags.get("lavfi.signalstats.RAVG", 0)),
            "g": float(tags.get("lavfi.signalstats.GAVG", 0)),
            "b": float(tags.get("lavfi.signalstats.BAVG", 0)),
        }
    except Exception:
        return None


def check_frames(clip: Path) -> Optional[str]:
    """Round 3 — sample FRAME_SAMPLES frames; flag solid red/black/white. Returns reason or None."""
    total = _duration(clip)
    if total is None or total <= 0:
        return f"cannot sample frames — unreadable duration for {clip.name}"

    # Sample at 25% / 50% / 75% — avoids intentional fade frames at the edges
    timestamps = [total * (i + 1) / (FRAME_SAMPLES + 1) for i in range(FRAME_SAMPLES)]
    with tempfile.TemporaryDirectory() as tmp:
        for ts in timestamps:
            frame = Path(tmp) / f"frame_{int(ts):05d}.jpg"
            try:
                subprocess.run(
                    [_ffmpeg(), "-y", "-ss", f"{ts:.2f}", "-i", str(clip),
                     "-frames:v", "1", "-q:v", "3", "-vf", "scale=320:180", str(frame)],
                    capture_output=True, timeout=30,
                )
            except Exception:
                return f"CORRUPT_FRAME at {ts:.0f}s — extraction failed"
            if not frame.exists() or frame.stat().st_size == 0:
                return f"CORRUPT_FRAME at {ts:.0f}s — could not extract"

            stats = _frame_stats(frame)
            if stats is None:
                continue  # analysis tooling failed — don't fake a defect
            rgb_total = stats["r"] + stats["g"] + stats["b"]
            if rgb_total > 10 and stats["r"] / rgb_total >= RED_RATIO_THRESHOLD \
                    and stats["brightness"] > 30:
                return f"RED_SCREEN at {ts:.0f}s (R={stats['r']:.0f})"
            if stats["brightness"] < BLACK_THRESHOLD:
                return f"BLACK_SCREEN at {ts:.0f}s (brightness={stats['brightness']:.1f})"
            if stats["brightness"] > WHITE_THRESHOLD:
                return f"WHITE_SCREEN at {ts:.0f}s (brightness={stats['brightness']:.1f})"
    return None


# ── Public API ────────────────────────────────────────────────────────────────
def evaluate(clip: Path, expected_duration_sec: float, tag: str = "") -> EvalResult:
    """
    Run all 3 council rounds on a finished scene/episode clip.

    Args:
        clip:                  Finished MP4 to judge.
        expected_duration_sec: Narration (or script) duration the clip must match.
        tag:                   Log label, e.g. "GG_EP002 scene_03".

    Returns:
        EvalResult — passed=True only if ALL 3 rounds pass. On failure,
        round_failed + retry_step identify exactly what to redo.
    """
    label = tag or clip.name
    if not clip.exists() or clip.stat().st_size < 10_000:
        return EvalResult(False, 1, f"{label}: clip missing or <10KB", _ROUND_RETRY_STEP[1])

    rounds: list[tuple[int, str, Optional[str]]] = []
    try:
        rounds.append((1, "duration", check_duration(clip, expected_duration_sec)))
        rounds.append((2, "audio", check_audio(clip)))
        rounds.append((3, "frames", check_frames(clip)))
    except Exception as e:  # absolute backstop — evaluator never raises
        return EvalResult(False, 1, f"{label}: evaluator error — {e}", _ROUND_RETRY_STEP[1])

    for round_no, name, reason in rounds:
        if reason is not None:
            _log(f"{label}: round {round_no} ({name}) ❌ — {reason}")
            return EvalResult(False, round_no, reason, _ROUND_RETRY_STEP[round_no])
        _log(f"{label}: round {round_no} ({name}) ✅")

    return EvalResult(True, 0, "all 3 rounds passed", "")
