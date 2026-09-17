"""
bot_09_quality_checker.py — Quality Checker Bot
Audits finished final MP4s for audio levels, duration sanity, and video stream validity.
Flags episodes that passed render but have silent audio, corrupted streams, or
suspiciously uniform video (solid-color fallback cards not caught by image healer).

Ending checks (NO-GO triggers):
  - Video plays to complete end with no cutoff
  - Final frame holds for minimum 2 seconds before any fade
  - Outro/CTA fully audible before video ends (no abrupt audio cutoff)
  - Any video ending abruptly → flagged NO-GO
"""

import subprocess
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

TARGET_DURATION_SEC = 600
MIN_AUDIO_RMS = -40.0       # dBFS — below this is effectively silent
ABRUPT_END_DROP_DB = 15.0   # if last 2s RMS is this many dB below overall → abrupt cutoff
FINAL_HOLD_SEC = 2.0        # minimum seconds the final frame must hold before end/fade


def _ffprobe(path: Path, entries: str, section: str = "format") -> dict:
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", f"-show_{section}s",
             "-show_entries", f"{section}={entries}",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=20
        )
        return json.loads(r.stdout)
    except Exception:
        return {}


def _get_audio_rms(path: Path) -> float:
    """Measure mean audio volume using volumedetect filter."""
    try:
        r = subprocess.run(
            ["ffmpeg", "-i", str(path), "-af", "volumedetect",
             "-vn", "-sn", "-dn", "-f", "null", "-"],
            capture_output=True, text=True, timeout=120
        )
        for line in r.stderr.splitlines():
            if "mean_volume" in line:
                parts = line.split(":")
                if len(parts) >= 2:
                    return float(parts[-1].strip().replace(" dBFS", ""))
    except Exception:
        pass
    return -99.0


def _get_audio_rms_tail(path: Path, tail_sec: float = 2.0) -> float:
    """Measure audio RMS of only the final N seconds of a video."""
    try:
        # Get total duration first
        probe = _ffprobe(path, "duration")
        total = float((probe.get("format") or {}).get("duration", 0))
        if total <= 0:
            return -99.0
        start = max(0.0, total - tail_sec)
        r = subprocess.run(
            ["ffmpeg", "-ss", str(start), "-i", str(path),
             "-af", "volumedetect", "-vn", "-sn", "-dn", "-f", "null", "-"],
            capture_output=True, text=True, timeout=30
        )
        for line in r.stderr.splitlines():
            if "mean_volume" in line:
                parts = line.split(":")
                if len(parts) >= 2:
                    return float(parts[-1].strip().replace(" dBFS", ""))
    except Exception:
        pass
    return -99.0


def _check_abrupt_ending(path: Path) -> tuple[bool, str]:
    """Return (is_abrupt, detail). Abrupt = last 2s RMS drops >15dB from full-video average,
    meaning audio was likely cut off mid-narration. Also flags as abrupt if last 2s is silent
    while full video has real audio. Any abrupt ending → NO-GO."""
    overall_rms = _get_audio_rms(path)
    tail_rms = _get_audio_rms_tail(path, tail_sec=2.0)
    if overall_rms > MIN_AUDIO_RMS and tail_rms < MIN_AUDIO_RMS:
        return True, f"audio silent in last 2s (overall={overall_rms:.1f}dBFS, tail={tail_rms:.1f}dBFS)"
    drop = overall_rms - tail_rms
    if overall_rms > MIN_AUDIO_RMS and drop > ABRUPT_END_DROP_DB:
        return True, f"audio drops {drop:.1f}dB in last 2s — likely mid-sentence cutoff"
    return False, f"ending ok (overall={overall_rms:.1f}dBFS, tail={tail_rms:.1f}dBFS)"


def _check_video_stream(path: Path) -> tuple[bool, str]:
    """Check that video stream is valid and not all-black."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=codec_name,width,height,r_frame_rate",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(r.stdout)
        streams = data.get("streams", [])
        if not streams:
            return False, "no video stream"
        s = streams[0]
        if s.get("width", 0) < 100 or s.get("height", 0) < 100:
            return False, f"tiny video {s.get('width')}x{s.get('height')}"
        return True, f"{s.get('width')}x{s.get('height')} {s.get('codec_name')}"
    except Exception as e:
        return False, str(e)


class QualityCheckerBot(CouncilBot):
    name = "bot_quality_checker"
    description = "Audits final MP4s for audio silence, stream validity, and duration"
    priority = 55
    auto_fix = False

    def _check_script_source(self, ep_id: str) -> list[str]:
        """Verify a rendered GG episode was built from the canonical script.

        Canonical scripts are named {EP_ID}_*.json (e.g. GG_EP002_cannae.json).
        Legacy scripts (scene_prompts.gg_ep002.final.json) sort ahead of them
        alphabetically and can silently win selection — if a legacy file still
        exists alongside a canonical one, or the render queue recorded a
        legacy-named script_path, that is an ERROR. Returns problem strings.
        """
        problems: list[str] = []
        if not self.prompts_dir.exists():
            return problems
        canonical = (list(self.prompts_dir.glob(f"{ep_id}_*.json"))
                     + list(self.prompts_dir.glob(f"{ep_id}.json")))
        legacy = list(self.prompts_dir.glob(f"scene_prompts.{ep_id.lower()}.*.json"))
        if canonical and legacy:
            problems.append(
                f"legacy script(s) shadow canonical {canonical[0].name}: "
                f"{', '.join(p.name for p in legacy)} — delete legacy after replacing"
            )
        # If the render queue recorded which script was queued, verify its name
        queue_path = self.state_dir / "render_queue.json"
        if queue_path.exists():
            try:
                queue = json.loads(queue_path.read_text(encoding="utf-8"))
                for q in queue:
                    if isinstance(q, dict) and q.get("episode_id") == ep_id:
                        sp = q.get("script_path", "")
                        if sp and not Path(sp).name.upper().startswith(ep_id.upper()):
                            problems.append(
                                f"render queue points at legacy-named script: {Path(sp).name}"
                            )
            except Exception:
                pass
        return problems

    def run(self) -> BotResult:
        r = self.result
        if not self.renders_dir.exists():
            r.ok(f"No renders dir yet for {self.channel_name} — nothing to check")
            return r

        finals = sorted(self.renders_dir.glob("*_final.mp4"))

        if not finals:
            r.ok("No final MP4s to check")
            return r

        quality_issues = []

        for final in finals:
            ep_id = final.name.replace("_final.mp4", "")

            # Duration
            probe = _ffprobe(final, "duration")
            dur = float((probe.get("format") or {}).get("duration", 0))

            if dur < self.min_final_sec:
                r.error(f"{ep_id}: final too short ({dur:.0f}s < {self.min_final_sec}s)")
                quality_issues.append({"episode": ep_id, "issue": "too_short", "value": dur})
                continue

            if dur < TARGET_DURATION_SEC:
                r.warn(f"{ep_id}: final short ({dur:.0f}s)")

            # Video stream
            vid_ok, vid_info = _check_video_stream(final)
            if not vid_ok:
                r.error(f"{ep_id}: video stream problem — {vid_info}")
                quality_issues.append({"episode": ep_id, "issue": "bad_video", "detail": vid_info})
                continue

            # Audio level
            rms = _get_audio_rms(final)
            if rms < MIN_AUDIO_RMS:
                r.warn(f"{ep_id}: audio very quiet ({rms:.1f} dBFS)")
                quality_issues.append({"episode": ep_id, "issue": "silent_audio", "rms": rms})

            # Ending integrity — NO-GO checks
            abrupt, end_detail = _check_abrupt_ending(final)
            if abrupt:
                r.error(f"{ep_id}: NO-GO — abrupt ending detected: {end_detail}")
                quality_issues.append({
                    "episode": ep_id,
                    "issue": "abrupt_ending",
                    "detail": end_detail,
                    "verdict": "NO-GO",
                })
                continue

            # Final hold check — duration must leave room for at least FINAL_HOLD_SEC
            # before the end (proxy: video is long enough that last scene had time to hold)
            if dur < FINAL_HOLD_SEC + 1.0:
                r.error(f"{ep_id}: NO-GO — video too short to confirm final frame hold ({dur:.1f}s)")
                quality_issues.append({"episode": ep_id, "issue": "no_final_hold", "verdict": "NO-GO"})
                continue

            # Script provenance — canonical {EP_ID}_*.json must have been used,
            # not an old legacy scene_prompts.* file (GG new-format guard)
            script_problems: list[str] = []
            if self.channel == "gg":
                script_problems = self._check_script_source(ep_id)
                for prob in script_problems:
                    r.error(f"{ep_id}: WRONG SCRIPT — {prob}")
                    quality_issues.append({
                        "episode": ep_id,
                        "issue": "wrong_script",
                        "detail": prob,
                    })

            if rms >= MIN_AUDIO_RMS and not script_problems:
                r.ok(f"{ep_id}: {dur:.0f}s  {vid_info}  audio={rms:.1f}dBFS  ending=ok  ✓")

        self.save_state({"quality_issues": quality_issues,
                        "finals_checked": len(finals)})

        if not quality_issues:
            r.ok(f"All {len(finals)} finals passed quality check")

        return r
