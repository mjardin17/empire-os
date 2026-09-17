#!/usr/bin/env python3
"""
clip_generator.py — Empire OS Auto Social Clip Generator
========================================================
After an episode renders, creates platform-specific clips from the final MP4:

  make_youtube_short()    → 60s  1080x1920 vertical, captions burned in
  make_instagram_reel()   → 60s  1080x1080 square,  captions burned in
  make_tiktok_clip()      → 60s  1080x1920 vertical, animated Gemini hook text
  make_facebook_video()   → 90s  1280x720  horizontal
  make_pinterest_pin()    → best-frame thumbnail JPG + title overlay (1000x1500)

Clip selection: the most dramatic window = highest sliding audio-RMS window.
Captions: narration from the episode JSON script, word-rate synced to audio,
burned via the ffmpeg subtitles filter (white text, black outline, bottom).

Output: social_clips/{episode_id}/
  {episode_id}_short.mp4      (YouTube Shorts)
  {episode_id}_reel.mp4       (Instagram)
  {episode_id}_tiktok.mp4     (TikTok)
  {episode_id}_facebook.mp4   (Facebook)
  {episode_id}_pinterest.jpg  (Pinterest thumbnail)

Usage:
  python social_clips/clip_generator.py --episode GG_EP002
  python social_clips/clip_generator.py --episode GG_EP002 --mp4 renders/gods_glory/GG_EP002_final.mp4

Never crashes the pipeline: every public function returns Path | None and
logs its own failures.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

# ── Console safety (Windows cp1252) ───────────────────────────────────────────
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

BASE_DIR: Path = Path(__file__).resolve().parent.parent   # video-bot-pipeline/
CLIPS_DIR: Path = Path(__file__).resolve().parent          # social_clips/
PROMPTS_DIR: Path = BASE_DIR / "prompts"
RENDERS_DIR: Path = BASE_DIR / "renders"

TAG = "[clip_generator]"

# Gemini text models tried in order (same order as empire_render.py)
GEMINI_TEXT_MODELS: tuple[str, ...] = ("gemini-2.5-flash", "gemini-2.0-flash")

# Kokoro narration pace fallback (words/sec) when audio duration is unknown
NARRATION_WORDS_PER_SEC = 2.5

FONT_BOLD = "C\\:/Windows/Fonts/arialbd.ttf"   # escaped for ffmpeg filtergraph


# ── .env + ffmpeg discovery ───────────────────────────────────────────────────
def load_env() -> None:
    """Lightweight .env loader — no external deps."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def find_ffmpeg() -> str:
    """Locate ffmpeg: PATH first, then known Windows install locations."""
    if f := shutil.which("ffmpeg"):
        return f
    for candidate in (
        Path(r"C:\ffmpeg\ffmpeg-8.1.2-essentials_build\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
        BASE_DIR / "ffmpeg_bin" / "ffmpeg.exe",
    ):
        if candidate.exists():
            return str(candidate)
    raise RuntimeError("ffmpeg not found — install it or add to PATH")


def find_ffprobe(ffmpeg: str) -> str:
    if ffmpeg.lower().endswith("ffmpeg.exe"):
        probe = ffmpeg[: -len("ffmpeg.exe")] + "ffprobe.exe"
        if Path(probe).exists():
            return probe
    return shutil.which("ffprobe") or "ffprobe"


def _ffmpeg_bin() -> tuple[str, str]:
    ffmpeg = find_ffmpeg()
    return ffmpeg, find_ffprobe(ffmpeg)


def run_ffmpeg(args: list[str], label: str, cwd: Path | None = None) -> bool:
    """Run an ffmpeg command; log stderr tail on failure. Returns success."""
    ffmpeg, _ = _ffmpeg_bin()
    result = subprocess.run([ffmpeg, "-y", *args], capture_output=True, text=True,
                            encoding="utf-8", errors="replace",
                            cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        print(f"{TAG} ffmpeg failed ({label}):\n{(result.stderr or '')[-500:]}",
              file=sys.stderr)
        return False
    return True


def probe_duration(media_path: Path) -> float | None:
    _, ffprobe = _ffmpeg_bin()
    result = subprocess.run(
        [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(media_path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    try:
        return float(result.stdout.strip())
    except (ValueError, AttributeError):
        return None


# ── Gemini text helper (shared with auto_publisher) ───────────────────────────
def gemini_text(prompt: str) -> str | None:
    """One synchronous Gemini completion. Returns stripped text or None. Never raises."""
    load_env()
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return None
    payload = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    for model in GEMINI_TEXT_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            for candidate in result.get("candidates", []):
                for part in (candidate.get("content") or {}).get("parts", []):
                    text = (part.get("text") or "").strip()
                    if text:
                        return text
        except Exception as e:
            print(f"{TAG} Gemini ({model}) failed: {e}", file=sys.stderr)
    return None


# ── Episode script metadata ───────────────────────────────────────────────────
def find_episode_script(episode_id: str) -> Path | None:
    """Locate the canonical episode JSON anywhere under prompts/ (canonical name wins)."""
    ep_lower = episode_id.lower()
    candidates = [p for p in PROMPTS_DIR.rglob("*.json") if ep_lower in p.name.lower()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: (
        (not p.name.lower().startswith(ep_lower)),
        ("final" not in p.name.lower()),
        len(p.name),
    ))
    return candidates[0]


def episode_meta(episode_id: str) -> dict:
    """Return {'title': str, 'narration': str} from the episode script (best effort)."""
    script = find_episode_script(episode_id)
    if not script:
        return {"title": episode_id, "narration": ""}
    try:
        data = json.loads(script.read_text(encoding="utf-8"))
    except Exception:
        return {"title": episode_id, "narration": ""}
    scenes = sorted(data.get("scenes", []), key=lambda s: int(s.get("scene_number", 0)))
    narration = " ".join((s.get("narration") or "").strip() for s in scenes).strip()
    return {"title": data.get("title", episode_id), "narration": narration}


def find_final_mp4(episode_id: str) -> Path | None:
    """Locate the final render for an episode (root renders/ and channel subdirs)."""
    name = f"{episode_id.upper()}_final.mp4"
    for candidate in [RENDERS_DIR / name, *RENDERS_DIR.glob(f"*/{name}")]:
        if candidate.exists() and candidate.stat().st_size > 1_000_000:
            return candidate
    return None


# ── Audio RMS peak detection ──────────────────────────────────────────────────
def _per_second_rms(mp4_path: Path) -> list[float]:
    """Decode audio to mono 8kHz s16le and return one RMS value per second."""
    ffmpeg, _ = _ffmpeg_bin()
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "audio.s16le"
        result = subprocess.run(
            [ffmpeg, "-y", "-i", str(mp4_path), "-vn", "-ac", "1", "-ar", "8000",
             "-f", "s16le", str(raw)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if result.returncode != 0 or not raw.exists():
            return []
        samples = array.array("h")
        samples.frombytes(raw.read_bytes())
    per_sec: list[float] = []
    step = 4  # subsample for speed; RMS shape is what matters
    for i in range(0, len(samples), 8000):
        chunk = samples[i:i + 8000:step]
        if not chunk:
            break
        per_sec.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)))
    return per_sec


def find_peak_window(mp4_path: Path, window_sec: int = 60) -> float:
    """
    Return the start time (seconds) of the loudest `window_sec` window —
    the most dramatic stretch of the episode by audio energy.
    Falls back to 0.0 if audio can't be analyzed.
    """
    rms = _per_second_rms(mp4_path)
    if len(rms) <= window_sec:
        return 0.0
    window_sum = sum(rms[:window_sec])
    best_sum, best_start = window_sum, 0
    for start in range(1, len(rms) - window_sec):
        window_sum += rms[start + window_sec - 1] - rms[start - 1]
        if window_sum > best_sum:
            best_sum, best_start = window_sum, start
    return float(best_start)


def peak_second(mp4_path: Path) -> float:
    """Return the single loudest second of the episode (for the Pinterest frame)."""
    rms = _per_second_rms(mp4_path)
    if not rms:
        return 1.0
    return float(max(range(len(rms)), key=lambda i: rms[i]))


# ── Captions (word-rate synced SRT) ───────────────────────────────────────────
def _fmt_srt_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}"


def build_caption_srt(narration: str, episode_duration: float,
                      clip_start: float, clip_duration: float,
                      out_srt: Path, words_per_caption: int = 6) -> bool:
    """
    Word-rate time-sync: every word in the full narration gets a timestamp
    (total_words / episode_duration words per second). Words inside the clip
    window become SRT captions relative to the clip start.
    """
    words = narration.split()
    if not words or episode_duration <= 0:
        return False
    sec_per_word = episode_duration / len(words)
    clip_end = clip_start + clip_duration

    entries: list[tuple[float, float, str]] = []
    for i in range(0, len(words), words_per_caption):
        group = words[i:i + words_per_caption]
        t0 = i * sec_per_word
        t1 = (i + len(group)) * sec_per_word
        if t1 < clip_start or t0 > clip_end:
            continue
        rel0 = max(0.0, t0 - clip_start)
        rel1 = min(clip_duration, t1 - clip_start)
        if rel1 - rel0 < 0.2:
            continue
        entries.append((rel0, rel1, " ".join(group)))

    if not entries:
        return False
    lines: list[str] = []
    for n, (t0, t1, text) in enumerate(entries, start=1):
        lines += [str(n), f"{_fmt_srt_time(t0)} --> {_fmt_srt_time(t1)}", text, ""]
    out_srt.write_text("\n".join(lines), encoding="utf-8")
    return True


SUBTITLE_STYLE = ("force_style='FontName=Arial,FontSize=14,Bold=1,"
                  "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                  "Outline=2,Shadow=0,Alignment=2,MarginV=48'")


def _drawtext_safe(text: str) -> str:
    """Sanitize text for the ffmpeg drawtext filter (ASCII-safe, no filter metachars)."""
    text = text.encode("ascii", errors="ignore").decode("ascii")
    for bad, repl in (("\\", ""), ("'", ""), ('"', ""), (":", " -"),
                      ("%", " percent"), (";", ","), ("\n", " ")):
        text = text.replace(bad, repl)
    return " ".join(text.split())[:60]


# ── Clip makers ───────────────────────────────────────────────────────────────
def _out_dir(episode_id: str) -> Path:
    d = CLIPS_DIR / episode_id.upper()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _make_captioned_clip(mp4_path: Path, episode_id: str, out_name: str,
                         vf_geometry: str, duration: int,
                         extra_vf: str = "") -> Path | None:
    """Shared core: cut peak window, apply geometry + captions (+extras)."""
    mp4_path = Path(mp4_path)
    out_dir = _out_dir(episode_id)
    out = out_dir / out_name
    ep_dur = probe_duration(mp4_path)
    if not ep_dur:
        print(f"{TAG} cannot probe {mp4_path}", file=sys.stderr)
        return None
    start = find_peak_window(mp4_path, duration)
    clip_dur = min(duration, ep_dur - start)

    meta = episode_meta(episode_id)
    srt_name = out_name.rsplit(".", 1)[0] + ".srt"
    have_captions = build_caption_srt(meta["narration"], ep_dur, start, clip_dur,
                                      out_dir / srt_name)

    vf_parts = [vf_geometry]
    if have_captions:
        # cwd trick: relative srt filename dodges Windows path escaping in filtergraphs
        vf_parts.append(f"subtitles={srt_name}:{SUBTITLE_STYLE}")
    if extra_vf:
        vf_parts.append(extra_vf)

    ok = run_ffmpeg(
        ["-ss", f"{start:.2f}", "-t", f"{clip_dur:.2f}", "-i", str(mp4_path),
         "-vf", ",".join(vf_parts),
         "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k",
         out_name],
        out_name, cwd=out_dir,
    )
    if ok and out.exists() and out.stat().st_size > 100_000:
        print(f"{TAG} {out_name} OK ({out.stat().st_size // 1024}KB, "
              f"peak window @ {start:.0f}s)")
        return out
    print(f"{TAG} {out_name} FAILED", file=sys.stderr)
    return None


VERTICAL_916 = "crop=ih*9/16:ih,scale=1080:1920,setsar=1"
SQUARE_11 = "crop=ih:ih,scale=1080:1080,setsar=1"
HORIZONTAL_169 = "scale=1280:720,setsar=1"


def make_youtube_short(mp4_path: Path | str, episode_id: str) -> Path | None:
    """Most dramatic 60s → 1080x1920 vertical with burned captions."""
    return _make_captioned_clip(Path(mp4_path), episode_id,
                                f"{episode_id.upper()}_short.mp4",
                                VERTICAL_916, 60)


def make_instagram_reel(mp4_path: Path | str, episode_id: str) -> Path | None:
    """Same 60s window → 1080x1080 square crop with burned captions."""
    return _make_captioned_clip(Path(mp4_path), episode_id,
                                f"{episode_id.upper()}_reel.mp4",
                                SQUARE_11, 60)


def get_tiktok_hook(episode_title: str) -> str:
    """Gemini 6-word shock hook. Fallback: title itself. Never raises."""
    text = gemini_text(
        f"Write a 6-word hook for a TikTok video about: {episode_title}. "
        "Use an emoji. Make it shocking. Reply with ONLY the hook, nothing else."
    )
    return (text or episode_title).splitlines()[0].strip()


def make_tiktok_clip(mp4_path: Path | str, episode_id: str) -> Path | None:
    """Same 60s window → 1080x1920 vertical + animated text hook at top."""
    hook = _drawtext_safe(get_tiktok_hook(episode_meta(episode_id)["title"]))
    extra = ""
    if hook:
        extra = (
            f"drawtext=fontfile='{FONT_BOLD}':text='{hook}':"
            "fontsize=58:fontcolor=white:borderw=4:bordercolor=black:"
            "x=(w-text_w)/2:y=110+12*sin(2*PI*t/1.5)"
        )
    return _make_captioned_clip(Path(mp4_path), episode_id,
                                f"{episode_id.upper()}_tiktok.mp4",
                                VERTICAL_916, 60, extra_vf=extra)


def make_facebook_video(mp4_path: Path | str, episode_id: str) -> Path | None:
    """Most dramatic 90s → 1280x720 horizontal with burned captions."""
    return _make_captioned_clip(Path(mp4_path), episode_id,
                                f"{episode_id.upper()}_facebook.mp4",
                                HORIZONTAL_169, 90)


def make_pinterest_pin(mp4_path: Path | str, episode_id: str) -> Path | None:
    """Best (loudest-moment) frame → 1000x1500 pin JPG with title overlay."""
    mp4_path = Path(mp4_path)
    out_dir = _out_dir(episode_id)
    out = out_dir / f"{episode_id.upper()}_pinterest.jpg"
    at = peak_second(mp4_path)
    title = _drawtext_safe(episode_meta(episode_id)["title"])
    vf = "crop=ih*2/3:ih,scale=1000:1500"
    if title:
        vf += (
            f",drawtext=fontfile='{FONT_BOLD}':text='{title}':"
            "fontsize=52:fontcolor=white:borderw=4:bordercolor=black:"
            "x=(w-text_w)/2:y=h-220"
        )
    ok = run_ffmpeg(
        ["-ss", f"{at:.2f}", "-i", str(mp4_path), "-frames:v", "1",
         "-vf", vf, "-q:v", "2", str(out)],
        out.name,
    )
    if ok and out.exists() and out.stat().st_size > 10_000:
        print(f"{TAG} {out.name} OK (frame @ {at:.0f}s)")
        return out
    print(f"{TAG} {out.name} FAILED", file=sys.stderr)
    return None


# ── Orchestration ─────────────────────────────────────────────────────────────
def generate_all(mp4_path: Path | str, episode_id: str) -> dict[str, Path | None]:
    """Generate every platform clip. Per-clip failures never stop the rest."""
    episode_id = episode_id.upper()
    mp4_path = Path(mp4_path)
    if not mp4_path.exists():
        print(f"{TAG} source MP4 missing: {mp4_path}", file=sys.stderr)
        return {}
    print(f"{TAG} === {episode_id}: generating social clips from {mp4_path.name} ===")
    makers = {
        "youtube_short": make_youtube_short,
        "instagram": make_instagram_reel,
        "tiktok": make_tiktok_clip,
        "facebook": make_facebook_video,
        "pinterest": make_pinterest_pin,
    }
    results: dict[str, Path | None] = {}
    for platform, maker in makers.items():
        try:
            results[platform] = maker(mp4_path, episode_id)
        except Exception as e:  # never crash the pipeline
            print(f"{TAG} {platform} generator crashed: {e}", file=sys.stderr)
            results[platform] = None
    done = sum(1 for v in results.values() if v)
    print(f"{TAG} === {episode_id}: {done}/{len(makers)} clips generated ===")
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description="Empire OS social clip generator")
    ap.add_argument("--episode", required=True, help="Episode ID e.g. GG_EP002")
    ap.add_argument("--mp4", default=None, help="Explicit final MP4 (auto-located if omitted)")
    args = ap.parse_args()

    episode_id = args.episode.upper()
    mp4 = Path(args.mp4) if args.mp4 else find_final_mp4(episode_id)
    if not mp4 or not mp4.exists():
        print(f"{TAG} No final MP4 found for {episode_id} in renders/", file=sys.stderr)
        sys.exit(1)
    results = generate_all(mp4, episode_id)
    sys.exit(0 if any(results.values()) else 1)


if __name__ == "__main__":
    main()
