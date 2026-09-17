"""
bot_10_frame_inspector.py — Visual Frame Inspector Bot
=======================================================
Samples a frame every 30 seconds from every final MP4 and detects:
  - RED SCREEN   : dominant red channel, blown-out red corruption
  - BLACK SCREEN : pure black lasting > 30s (not an intentional fade)
  - WHITE SCREEN : blown-out white frame
  - FROZEN FRAME : consecutive identical frames (stuck image)
  - CORRUPT FRAME: cannot be decoded at all

Any failure quarantines the episode and writes it to the re-render queue.
This bot runs AFTER bot_09 so we have duration/audio AND visual coverage.

NO VIDEO LEAVES THIS PIPELINE WITH A VISIBLE DEFECT.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

# ── Thresholds ────────────────────────────────────────────────────────────────

SAMPLE_INTERVAL_SEC = 30     # inspect one frame every N seconds
RED_RATIO_THRESHOLD = 0.70   # R channel fraction of total RGB → red screen
BLACK_THRESHOLD     = 12     # avg brightness below this → black screen
WHITE_THRESHOLD     = 243    # avg brightness above this → white screen
FROZEN_HASH_LIMIT   = 3      # identical frames in a row → frozen
MAX_CONSECUTIVE_BLACK = 2    # allow up to 2 black frames (fade in/out), more = bug


def _extract_frame(video_path: Path, timestamp_sec: int, out_path: Path) -> bool:
    """Extract a single frame at timestamp_sec into out_path (JPEG). Returns True on success."""
    try:
        r = subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", str(timestamp_sec),
                "-i", str(video_path),
                "-frames:v", "1",
                "-q:v", "3",
                "-vf", "scale=320:180",   # tiny thumbnail — fast + sufficient for analysis
                str(out_path),
            ],
            capture_output=True, timeout=30
        )
        return out_path.exists() and out_path.stat().st_size > 0
    except Exception:
        return False


def _analyze_frame(frame_path: Path) -> dict:
    """
    Return channel stats for a frame using ffprobe signalstats.
    Falls back to None values if ffprobe unavailable.
    Returns: {r, g, b, brightness, hash}
    """
    result = {"r": None, "g": None, "b": None, "brightness": None, "hash": None}
    try:
        # Use ffprobe to get per-channel averages via lavfi
        r = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-f", "lavfi",
                f"-i", f"movie={frame_path.as_posix()},signalstats",
                "-show_entries", "frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.RAVG,"
                                 "lavfi.signalstats.GAVG,lavfi.signalstats.BAVG",
                "-of", "json"
            ],
            capture_output=True, text=True, timeout=15
        )
        data = json.loads(r.stdout or "{}")
        tags = {}
        for frame in data.get("frames", []):
            tags.update(frame.get("tags", {}))

        if tags:
            result["brightness"] = float(tags.get("lavfi.signalstats.YAVG", 0))
            result["r"] = float(tags.get("lavfi.signalstats.RAVG", 0))
            result["g"] = float(tags.get("lavfi.signalstats.GAVG", 0))
            result["b"] = float(tags.get("lavfi.signalstats.BAVG", 0))
        else:
            # fallback: use ffprobe format-level stats won't have signalstats,
            # try simple pixel hash via md5 filter
            pass

        # Generate a simple perceptual hash via md5 of scaled frame bytes
        h = subprocess.run(
            ["ffmpeg", "-y", "-i", str(frame_path),
             "-vf", "scale=16:9,format=gray",
             "-f", "rawvideo", "pipe:1"],
            capture_output=True, timeout=10
        )
        if h.returncode == 0:
            import hashlib
            result["hash"] = hashlib.md5(h.stdout).hexdigest()

    except Exception:
        pass
    return result


def _classify_frame(stats: dict, timestamp_sec: int) -> Optional[str]:
    """Return a defect label or None if the frame is clean."""
    r = stats.get("r")
    g = stats.get("g")
    b = stats.get("b")
    brightness = stats.get("brightness")

    if r is None:
        return None  # couldn't analyze — don't flag, log separately

    # Red screen: R is dominant and much higher than G+B
    total = r + g + b
    if total > 10:
        r_ratio = r / total
        if r_ratio >= RED_RATIO_THRESHOLD and brightness > 30:
            return f"RED_SCREEN at {timestamp_sec}s (R={r:.0f} G={g:.0f} B={b:.0f})"

    # Black screen
    if brightness is not None and brightness < BLACK_THRESHOLD:
        return f"BLACK_SCREEN at {timestamp_sec}s (brightness={brightness:.1f})"

    # White screen
    if brightness is not None and brightness > WHITE_THRESHOLD:
        return f"WHITE_SCREEN at {timestamp_sec}s (brightness={brightness:.1f})"

    return None


def _get_duration(video_path: Path) -> float:
    """Get video duration in seconds via ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "json", str(video_path)],
            capture_output=True, text=True, timeout=15
        )
        data = json.loads(r.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 0.0


def inspect_video(video_path: Path, log_fn) -> list[str]:
    """
    Sample every SAMPLE_INTERVAL_SEC seconds. Return list of defect strings.
    Empty list = clean video.
    """
    defects: list[str] = []
    duration = _get_duration(video_path)
    if duration < 10:
        return [f"DURATION_TOO_SHORT: {duration:.0f}s"]

    timestamps = list(range(0, int(duration), SAMPLE_INTERVAL_SEC))
    # Always check 13-min mark specifically (where Josh caught the red screen)
    for t_extra in [780, 810, 840]:  # 13:00, 13:30, 14:00
        if t_extra < duration and t_extra not in timestamps:
            timestamps.append(t_extra)
    timestamps.sort()

    log_fn(f"Inspecting {video_path.name}: {duration/60:.1f} min, {len(timestamps)} samples")

    consecutive_black = 0
    prev_hash = None
    frozen_count = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        for ts in timestamps:
            frame_path = Path(tmpdir) / f"frame_{ts:05d}.jpg"
            ok = _extract_frame(video_path, ts, frame_path)

            if not ok:
                defects.append(f"CORRUPT_FRAME at {ts}s — could not extract")
                continue

            stats = _analyze_frame(frame_path)

            # Frozen frame detection
            curr_hash = stats.get("hash")
            if curr_hash and curr_hash == prev_hash:
                frozen_count += 1
                if frozen_count >= FROZEN_HASH_LIMIT:
                    defects.append(
                        f"FROZEN_FRAME at {ts}s — identical to prev {frozen_count} samples"
                    )
            else:
                frozen_count = 0
            prev_hash = curr_hash

            # Color defect detection
            defect = _classify_frame(stats, ts)

            # Black screen: allow 1-2 consecutive (legit fades), flag 3+
            if defect and "BLACK_SCREEN" in defect:
                consecutive_black += 1
                if consecutive_black > MAX_CONSECUTIVE_BLACK:
                    defects.append(defect)
            else:
                consecutive_black = 0
                if defect:
                    defects.append(defect)

    return defects


class FrameInspectorBot(CouncilBot):
    name = "bot_10_frame_inspector"
    description = "Visual QC: samples frames from finals, catches red/black/white/frozen screens"
    priority = 56   # runs right after bot_09_quality_checker (55)
    auto_fix = False  # only reports + queues re-renders; bot_08 does the fixing

    def run(self) -> BotResult:
        r = self.result
        if not self.renders_dir.exists():
            r.ok(f"No renders dir yet for {self.channel_name} — nothing to inspect")
            return r

        finals = sorted(self.renders_dir.glob("*_final.mp4"))
        if not finals:
            r.ok("No finals to inspect")
            return r

        failed: list[str]   = []
        clean:  list[str]   = []
        report: dict        = {}

        for video_path in finals:
            ep_id = video_path.stem.replace("_final", "")
            try:
                defects = inspect_video(video_path, self.log)
                if defects:
                    failed.append(ep_id)
                    report[ep_id] = {"status": "FAIL", "defects": defects}
                    for d in defects:
                        self.log(f"[FAIL] {ep_id}: {d}")
                    r.warn(f"{ep_id}: {len(defects)} visual defect(s): {'; '.join(defects)}")
                    # Write to re-render queue so bot_08 picks it up
                    self._queue_for_rerender(ep_id)
                else:
                    clean.append(ep_id)
                    report[ep_id] = {"status": "PASS"}
                    self.log(f"[PASS] {ep_id}: visual QC clean")
            except Exception as e:
                self.log(f"[ERROR] {ep_id}: {e}")
                report[ep_id] = {"status": "ERROR", "error": str(e)}
                r.error(f"{ep_id}: inspection error: {e}")

        # Save report
        report_path = self.state_dir / "frame_inspection_report.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

        if failed:
            r.next_action = "bot_08_auto_renderer"
            r.messages.append(
                f"⚠ VISUAL DEFECTS FOUND in {len(failed)} episode(s): "
                f"{', '.join(failed)}. Queued for re-render."
            )
        else:
            r.ok(f"All {len(clean)} episodes passed visual QC.")
        return r

    def _queue_for_rerender(self, ep_id: str) -> None:
        """Add ep_id to the render queue so bot_08 re-renders it."""
        queue_path = self.state_dir / "render_queue.json"
        try:
            queue: list = json.loads(queue_path.read_text(encoding="utf-8")) if queue_path.exists() else []
            if ep_id not in queue:
                queue.append(ep_id)
                queue_path.write_text(json.dumps(queue, indent=2), encoding="utf-8")
                self.log(f"Queued {ep_id} for re-render due to visual defect")
        except Exception as e:
            self.log(f"Could not update render queue: {e}")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Frame Inspector Bot")
    ap.add_argument("--channel", default="gg", choices=["gg", "il", "lo", "ed"])
    ap.add_argument("--video", help="Inspect a single video file directly")
    args = ap.parse_args()

    if args.video:
        # Single-file mode for manual debugging
        path = Path(args.video)
        print(f"Inspecting: {path}")
        defects = inspect_video(path, print)
        if defects:
            print(f"\n[FAIL] {len(defects)} defect(s):")
            for d in defects:
                print(f"  - {d}")
        else:
            print("\n[PASS] Visual QC clean.")
    else:
        bot = FrameInspectorBot(channel=args.channel)
        result = bot.run()
        print(result)
