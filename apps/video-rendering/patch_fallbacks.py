"""
patch_fallbacks.py — surgical fallback-card repair for Gods & Glory episodes.

Scans finished episode output folders, finds any scene image that looks like a
flat-color fallback card (< FALLBACK_SIZE_BYTES), re-fetches it one at a time
(no concurrency, Gemini serialised), then re-renders only the affected scene
clips and rebuilds the episode final.mp4.

Usage:
    py patch_fallbacks.py                          # scan all GG episodes
    py patch_fallbacks.py --episode GG_EP006       # one episode only
    py patch_fallbacks.py --images-only            # re-fetch images, skip video re-render
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
import base64
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
BASE_DIR       = Path(__file__).resolve().parent
OUTPUT_DIR     = BASE_DIR / "output"
RENDERS_DIR    = BASE_DIR / "renders"
PROMPTS_DIR    = BASE_DIR / "prompts"

# Images below this size are treated as fallback cards (real images run 40+ KB)
FALLBACK_SIZE_BYTES = 20_000

# Gemini pacing — one request every N seconds so we don't hit RPM cap
GEMINI_MIN_INTERVAL = 6.0

GEMINI_IMAGE_MODEL = "gemini-2.5-flash-preview-04-17"
GEMINI_URL_TMPL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_IMAGE_MODEL}:generateContent?key={{api_key}}"
)

STYLE_SUFFIX = {
    "gods_glory":    "dramatic oil painting, epic battle scene, cinematic lighting",
    "mech_legends":  "futuristic mech concept art, metallic detail, battle-scarred",
    "little_olympus":"colourful illustrated mythology, storybook style, vibrant",
}
DEFAULT_STYLE = "dramatic oil painting, cinematic lighting, highly detailed"

W, H = 1920, 1080   # all GG episodes are landscape 1080p

# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_dotenv() -> None:
    env = BASE_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def find_ffmpeg() -> str:
    for candidate in ["ffmpeg", r"C:\ffmpeg\bin\ffmpeg.exe"]:
        try:
            subprocess.run([candidate, "-version"], capture_output=True, timeout=5)
            return candidate
        except Exception:
            pass
    sys.exit("ffmpeg not found — install it or add it to PATH")


def find_episode_json(episode_id: str) -> Path | None:
    eid_low = episode_id.lower()
    candidates = [
        p for p in PROMPTS_DIR.rglob("*.json")
        if not any(part.startswith("_") for part in p.relative_to(PROMPTS_DIR).parts[:-1])
    ]
    for p in sorted(candidates):
        if p.stem.lower() == eid_low:
            return p
    for p in sorted(candidates):
        if eid_low in p.stem.lower():
            return p
    return None


def load_scenes(episode_id: str) -> list[dict]:
    p = find_episode_json(episode_id)
    if not p:
        print(f"  [WARN] No JSON found for {episode_id} — skipping")
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    return data.get("scenes", [])


_gemini_last = 0.0

def fetch_via_gemini(prompt: str, out_path: Path, api_key: str) -> bool:
    global _gemini_last
    wait = GEMINI_MIN_INTERVAL - (time.time() - _gemini_last)
    if wait > 0:
        time.sleep(wait)

    full_prompt = (
        f"{prompt}, {DEFAULT_STYLE}. "
        f"Landscape {W}x{H} composition."
    )
    url  = GEMINI_URL_TMPL.format(api_key=api_key)
    body = json.dumps({"contents": [{"parts": [{"text": full_prompt}]}]}).encode()
    try:
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        parts = result["candidates"][0]["content"]["parts"]
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                data = base64.b64decode(inline["data"])
                out_path.write_bytes(data)
                print(f"         ✓ Gemini ({len(data)//1024} KB)")
                return True
        print("         ✗ Gemini: no image in response")
        return False
    except Exception as e:
        print(f"         ✗ Gemini failed: {e}")
        return False
    finally:
        _gemini_last = time.time()


def fetch_via_pollinations(prompt: str, out_path: Path, seed: int) -> bool:
    import urllib.parse
    safe = urllib.parse.quote(prompt[:400])
    url  = f"https://image.pollinations.ai/prompt/{safe}?width={W}&height={H}&seed={seed}&nologo=true"
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read()
            if len(data) > FALLBACK_SIZE_BYTES:
                out_path.write_bytes(data)
                print(f"         ✓ Pollinations ({len(data)//1024} KB)")
                return True
        except Exception as e:
            print(f"         ✗ Pollinations attempt {attempt}: {e}")
        time.sleep(3)
    return False


def is_valid_clip(path: Path, ffmpeg: str) -> bool:
    if not path.exists() or path.stat().st_size < 1000:
        return False
    r = subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"],
        capture_output=True, timeout=30,
    )
    return r.returncode == 0


def rerender_scene(
    scene_num: int,
    img_paths: list[Path],
    audio_path: Path,
    clip_path: Path,
    dur: float,
    ffmpeg: str,
    narration: str,
) -> bool:
    """Rebuild a single scene clip from (possibly updated) images."""
    if not audio_path.exists():
        print(f"      [TTS] audio missing — cannot re-render scene {scene_num}")
        return False

    # Discard any existing bad clip
    if clip_path.exists():
        try:
            clip_path.unlink()
        except Exception:
            pass

    valid_imgs = [p for p in img_paths if p.exists() and p.stat().st_size > FALLBACK_SIZE_BYTES]
    if not valid_imgs:
        print(f"      [VID] no real images for scene {scene_num} — skipping re-render")
        return False

    # Ken Burns per-image
    audio_dur = float(subprocess.run(
        [ffmpeg, "-v", "quiet", "-i", str(audio_path),
         "-show_entries", "format=duration", "-of", "csv=p=0"],
        capture_output=True, text=True, timeout=10,
    ).stdout.strip() or dur)
    n = len(valid_imgs)
    seg_dur = audio_dur / n
    zoom     = 0.0003
    segs     = []
    for i, img in enumerate(valid_imgs, 1):
        seg = clip_path.with_suffix(f".seg{i}.mp4")
        frames = max(1, int(seg_dur * 30))
        vf = (
            f"scale={W}:{H}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},"
            f"zoompan=z='min(zoom+{zoom},1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={W}x{H}:fps=30"
        )
        r = subprocess.run(
            [ffmpeg, "-y", "-loop", "1", "-i", str(img),
             "-vf", vf, "-t", str(seg_dur),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(seg)],
            capture_output=True, timeout=120,
        )
        if r.returncode == 0 and seg.stat().st_size > 0:
            segs.append(seg)

    if not segs:
        return False

    # Concat video segments
    concat_vid = clip_path.with_suffix(".concat.mp4")
    if len(segs) == 1:
        shutil.copy2(segs[0], concat_vid)
    else:
        lst = clip_path.with_suffix(".seglist.txt")
        lst.write_text("\n".join(f"file '{s}'" for s in segs), encoding="utf-8")
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-c", "copy", str(concat_vid)],
            capture_output=True, timeout=120,
        )

    # Mux with audio
    r = subprocess.run(
        [ffmpeg, "-y", "-i", str(concat_vid), "-i", str(audio_path),
         "-c:v", "copy", "-c:a", "aac", "-shortest", str(clip_path)],
        capture_output=True, timeout=120,
    )

    # Cleanup temps
    for s in segs:
        try: s.unlink()
        except Exception: pass
    for tmp in [concat_vid, clip_path.with_suffix(".seglist.txt")]:
        try: tmp.unlink()
        except Exception: pass

    return r.returncode == 0 and is_valid_clip(clip_path, ffmpeg)


def rebuild_final(episode_id: str, work_dir: Path, ffmpeg: str, music_path: Path | None) -> bool:
    clips = sorted(work_dir.glob("scene_*.mp4"), key=lambda p: int(re.search(r"scene_(\d+)", p.stem).group(1)))
    if not clips:
        print(f"  [CONCAT] No scene clips found for {episode_id}")
        return False

    lst = work_dir / "final_list.txt"
    lst.write_text("\n".join(f"file '{c}'" for c in clips), encoding="utf-8")

    concat_out = work_dir / "concat_raw.mp4"
    r = subprocess.run(
        [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c", "copy", str(concat_out)],
        capture_output=True, timeout=600,
    )
    if r.returncode != 0:
        print(f"  [CONCAT] ✗ concat failed")
        return False

    final_out = RENDERS_DIR / f"{episode_id}_final.mp4"
    RENDERS_DIR.mkdir(exist_ok=True)

    if music_path and music_path.exists():
        r = subprocess.run(
            [ffmpeg, "-y", "-i", str(concat_out), "-stream_loop", "-1",
             "-i", str(music_path),
             "-filter_complex",
             "[1:a]volume=0.07[music];[0:a][music]amix=inputs=2:duration=first[aout]",
             "-map", "0:v", "-map", "[aout]",
             "-c:v", "copy", "-c:a", "aac", "-shortest", str(final_out)],
            capture_output=True, timeout=600,
        )
    else:
        shutil.copy2(concat_out, final_out)

    return final_out.exists() and final_out.stat().st_size > 0


# ── Main ─────────────────────────────────────────────────────────────────────

def patch_episode(episode_id: str, gemini_key: str, ffmpeg: str, images_only: bool) -> None:
    work_dir = OUTPUT_DIR / episode_id
    if not work_dir.exists():
        print(f"  [SKIP] {episode_id} — no output folder")
        return

    scenes = load_scenes(episode_id)
    if not scenes:
        return

    scene_map = {s.get("scene_number", i + 1): s for i, s in enumerate(scenes)}

    # Find all fallback images
    fallback_slots: dict[int, list[int]] = {}
    for img in sorted(work_dir.glob("scene_*_*.jpg")):
        m = re.match(r"scene_(\d+)_(\d+)\.jpg", img.name)
        if not m:
            continue
        snum, slot = int(m.group(1)), int(m.group(2))
        if img.stat().st_size < FALLBACK_SIZE_BYTES:
            fallback_slots.setdefault(snum, []).append(slot)

    if not fallback_slots:
        print(f"  ✓ {episode_id} — no fallback cards found, nothing to patch")
        return

    total_bad = sum(len(v) for v in fallback_slots.values())
    print(f"\n  {episode_id} — {total_bad} fallback image(s) across {len(fallback_slots)} scene(s)")

    VARIANT_SUFFIXES = [
        "",
        ", alternate camera angle, different composition",
        ", close-up detail shot, dramatic framing",
        ", wide establishing shot, sweeping cinematic angle",
    ]

    patched_scenes: set[int] = set()

    for snum in sorted(fallback_slots):
        scene = scene_map.get(snum, {})
        prompt = scene.get("visual_prompt", f"Battle scene {snum}")
        slots  = fallback_slots[snum]
        print(f"\n    Scene {snum:02d} — {len(slots)} bad slot(s): {slots}")

        for slot in slots:
            img_path = work_dir / f"scene_{snum:02d}_{slot}.jpg"
            var_prompt = f"{prompt}{VARIANT_SUFFIXES[(slot - 1) % len(VARIANT_SUFFIXES)]}"
            quality_prompt = f"{var_prompt}, sharp focus, highly detailed, crisp linework, professional concept art"

            print(f"      [IMG {slot}]  Fetching replacement…")
            ok = fetch_via_pollinations(quality_prompt, img_path, seed=snum * 17 + slot * 31 + 99999)
            if not ok and gemini_key:
                ok = fetch_via_gemini(quality_prompt, img_path, gemini_key)
            if ok:
                patched_scenes.add(snum)
            else:
                print(f"      [IMG {slot}]  ✗ Both sources failed — leaving as fallback")

    if images_only or not patched_scenes:
        print(f"\n  {episode_id} — images-only mode or nothing patched; skipping clip re-render")
        return

    # Re-render only the affected scene clips + rebuild final
    needs_rebuild = False
    for snum in sorted(patched_scenes):
        scene  = scene_map.get(snum, {})
        dur    = float(scene.get("duration_sec", 47))
        narr   = scene.get("narration", "")

        img_paths  = [work_dir / f"scene_{snum:02d}_{i}.jpg" for i in range(1, 5)]
        audio_path = work_dir / f"scene_{snum:02d}.mp3"
        clip_path  = work_dir / f"scene_{snum:02d}.mp4"

        print(f"\n    [VID] Re-rendering scene {snum:02d}…")
        ok = rerender_scene(snum, img_paths, audio_path, clip_path, dur, ffmpeg, narr)
        if ok:
            print(f"    [VID] ✓ scene {snum:02d} clip rebuilt")
            needs_rebuild = True
        else:
            print(f"    [VID] ✗ scene {snum:02d} re-render failed")

    if needs_rebuild:
        print(f"\n  [CONCAT] Rebuilding {episode_id} final…")
        music = BASE_DIR / "music" / "battle_epic.mp3"
        ok = rebuild_final(episode_id, work_dir, ffmpeg, music if music.exists() else None)
        if ok:
            print(f"  ✓ {episode_id} final rebuilt → renders/{episode_id}_final.mp4")
        else:
            print(f"  ✗ {episode_id} final rebuild failed")


def main() -> None:
    _load_dotenv()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    ffmpeg     = find_ffmpeg()

    parser = argparse.ArgumentParser()
    parser.add_argument("--episode",     help="Patch one episode (e.g. GG_EP006); default: all GG episodes")
    parser.add_argument("--images-only", action="store_true", help="Re-fetch images only; skip clip/final rebuild")
    args = parser.parse_args()

    if args.episode:
        episodes = [args.episode.upper()]
    else:
        episodes = sorted(
            d.name for d in OUTPUT_DIR.iterdir()
            if d.is_dir() and d.name.startswith("GG_EP")
        )

    print(f"\nPatch-fallbacks — scanning {len(episodes)} episode(s)\n")
    for ep in episodes:
        patch_episode(ep, gemini_key, ffmpeg, args.images_only)

    print("\n✓ Patch pass complete.")


if __name__ == "__main__":
    main()
