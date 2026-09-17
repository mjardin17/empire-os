"""
bot_03_image_healer.py — Image Healer Bot
Scans episode output folders for missing or fallback-card images (<20KB).
Re-fetches via Pollinations then Gemini. Marks episodes needing clip rebuild.
"""

import json
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

FALLBACK_BYTES = 20_000
POLL_URL = "https://image.pollinations.ai/prompt/{prompt}?width=1920&height=1080&nologo=true&seed={seed}"


def _fetch_pollinations(prompt: str, out_path: Path, seed: int) -> bool:
    encoded = urllib.parse.quote(f"{prompt}, epic historical documentary cinematic painting style, 16:9")
    url = POLL_URL.format(prompt=encoded, seed=seed)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) > FALLBACK_BYTES:
            out_path.write_bytes(data)
            return True
    except Exception:
        pass
    return False


def _fetch_gemini(prompt: str, out_path: Path, api_key: str) -> bool:
    import urllib.request, json as _json, base64
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key={api_key}"
    body = _json.dumps({"contents": [{"parts": [{"text": f"{prompt}, cinematic documentary style"}]}],
                        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}).encode()
    try:
        req = urllib.request.Request(url, data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = _json.loads(resp.read())
        for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []):
            if "inlineData" in part:
                img_bytes = base64.b64decode(part["inlineData"]["data"])
                if len(img_bytes) > FALLBACK_BYTES:
                    out_path.write_bytes(img_bytes)
                    return True
    except Exception:
        pass
    return False


class ImageHealerBot(CouncilBot):
    name = "bot_image_healer"
    description = "Re-fetches fallback/missing images via Pollinations then Gemini"
    priority = 20
    auto_fix = True

    def run(self) -> BotResult:
        r = self.result
        import os
        api_key = os.environ.get("GEMINI_API_KEY", "")
        episodes_needing_rebuild = []

        if not self.output_dir.exists():
            r.ok(f"No output dir yet for {self.channel_name} — nothing to heal")
            return r

        ep_dirs = sorted(d for d in self.output_dir.iterdir()
                        if d.is_dir() and not d.name.startswith("_"))

        for ep_dir in ep_dirs:
            ep_id = ep_dir.name
            bad_images = []

            for img in sorted(ep_dir.glob("scene_[0-9][0-9]_[1-4].jpg")):
                if img.stat().st_size < FALLBACK_BYTES:
                    bad_images.append(img)

            if not bad_images:
                continue

            r.warn(f"{ep_id}: {len(bad_images)} bad image(s) found")
            fixed_count = 0

            for img in bad_images:
                # Build a basic prompt from scene number
                parts = img.stem.split("_")  # scene_01_2 → ['scene','01','2']
                scene_num = parts[1] if len(parts) > 1 else "01"
                slot = parts[2] if len(parts) > 2 else "1"
                prompt = f"Epic historical battle scene, scene {scene_num} image {slot}, dramatic cinematic"

                # Try to load from episode JSON for better prompt
                prompt_json = ep_dir / "prompts.json"
                if prompt_json.exists():
                    try:
                        ep_data = json.loads(prompt_json.read_text())
                        scene_idx = int(scene_num) - 1
                        scenes = ep_data.get("scenes", [])
                        if 0 <= scene_idx < len(scenes):
                            prompt = scenes[scene_idx].get("visual_prompt", prompt)
                    except Exception:
                        pass

                seed = int(scene_num) * 100 + int(slot) * 13
                success = False

                for attempt in range(3):
                    if _fetch_pollinations(prompt, img, seed + attempt * 7):
                        success = True
                        break
                    time.sleep(2)

                if not success and api_key:
                    time.sleep(6)
                    success = _fetch_gemini(prompt, img, api_key)

                if success:
                    r.fixed(f"{ep_id}/{img.name}: re-fetched ({img.stat().st_size // 1024}KB)")
                    fixed_count += 1
                else:
                    r.error(f"{ep_id}/{img.name}: could not re-fetch")

            if fixed_count > 0:
                episodes_needing_rebuild.append(ep_id)

        self.save_state({"episodes_needing_clip_rebuild": episodes_needing_rebuild})
        if episodes_needing_rebuild:
            r.next_action = "bot_clip_rebuilder"

        return r
