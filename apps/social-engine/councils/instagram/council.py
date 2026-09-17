#!/usr/bin/env python3
"""
Instagram Council — 4 specialized bots
  1. Strategist  — picks content and timing for IG
  2. Writer      — captions, hashtags (30-tag strategy)
  3. Visual      — generates cover image for static posts; prepares Reel thumbnail
  4. Poster      — uploads via Meta Graph API (Reels + photo posts)
"""

import os
import json
import subprocess
import requests
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CHANNELS, PLATFORM_CREDS, AI_KEYS, RENDERS_DIR, SHORTS_SETTINGS


# ─────────────────────────────────────────────────────────────────────────────
# BOT 1 — STRATEGIST
# ─────────────────────────────────────────────────────────────────────────────
class InstagramStrategist:
    """
    Instagram strategy: Reels from every episode + static quote cards between episodes.
    Recommends 1 Reel + 1 quote card per episode cycle.
    """

    def run(self, channel_key: str, posted_log: list) -> list:
        import re
        channel = CHANNELS[channel_key]
        prefix = channel["renders_prefix"]
        posted_files = {j.get("source_file") for j in posted_log}
        jobs = []

        renders = sorted(RENDERS_DIR.glob(f"{prefix}*_final.mp4"))
        for render in renders:
            if str(render) in posted_files:
                continue

            ep_match = re.search(r'EP(\d+)', render.name)
            ep_num = int(ep_match.group(1)) if ep_match else 0

            # Reel job (vertical clip)
            jobs.append({
                "type": "reel",
                "platform": "instagram",
                "channel": channel_key,
                "source_file": str(render),
                "episode_number": ep_num,
                "status": "pending",
                "created_at": datetime.now().isoformat(),
            })

        return jobs


# ─────────────────────────────────────────────────────────────────────────────
# BOT 2 — WRITER
# ─────────────────────────────────────────────────────────────────────────────
class InstagramWriter:
    """
    Writes IG captions optimized for the algorithm:
    - Strong hook line 1
    - 3-line body
    - CTA
    - 30 hashtags (mix of large, medium, niche)
    """

    def run(self, job: dict) -> dict:
        channel = CHANNELS[job["channel"]]
        ep = job["episode_number"]

        if AI_KEYS["openai"]:
            copy = self._ai_write(channel, ep)
        else:
            copy = self._template_write(channel, ep)

        job["copy"] = copy
        return job

    def _ai_write(self, channel: dict, ep: int) -> dict:
        try:
            import openai
            openai.api_key = AI_KEYS["openai"]
            prompt = (
                f"You are a viral Instagram copywriter for '{channel['name']}' ({channel['niche']}).\n"
                f"Write an Instagram Reel caption for Episode {ep}.\n"
                f"Format:\n"
                f"- Line 1: hook (max 125 chars, no hashtags, {channel['hook_style']})\n"
                f"- 3 body lines with emojis\n"
                f"- CTA: 'Follow for weekly episodes!'\n"
                f"- 30 hashtags (mix large + medium + niche)\n"
                f"Return JSON: {{caption: str, hashtags: [str x30]}}"
            )
            resp = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            print(f"[InstagramWriter] OpenAI error: {e} — using template")
            return self._template_write(channel, ep)

    def _template_write(self, channel: dict, ep: int) -> dict:
        name = channel["name"]
        tags = channel["hashtags"] + [
            "#reels", "#reelsinstagram", "#viral", "#trending",
            "#explore", "#fyp", "#shorts", "#youtube",
            f"#ep{ep}", "#binge"
        ]
        tags = tags[:30]
        caption = (
            f"You won't believe what happened in Episode {ep}! 🔥\n\n"
            f"✨ {name} is back with another incredible story.\n"
            f"💥 Epic. Cinematic. Unmissable.\n"
            f"🎬 Full episode on YouTube — link in bio!\n\n"
            f"Follow for weekly episodes!\n\n"
            + " ".join(tags)
        )
        return {"caption": caption, "hashtags": tags}


# ─────────────────────────────────────────────────────────────────────────────
# BOT 3 — VISUAL (Thumbnail / Cover Frame)
# ─────────────────────────────────────────────────────────────────────────────
class InstagramVisual:
    """
    Extracts the best thumbnail frame from the video for the Reel cover.
    Saves to queue/covers/.
    """

    COVERS_DIR = Path(__file__).parent.parent.parent / "queue" / "covers"

    def run(self, job: dict) -> dict:
        self.COVERS_DIR.mkdir(parents=True, exist_ok=True)
        src = job["source_file"]
        ep = job["episode_number"]
        ch = job["channel"]
        cover_path = self.COVERS_DIR / f"{ch}_EP{ep:03d}_cover.jpg"

        if cover_path.exists():
            job["cover_file"] = str(cover_path)
            return job

        # Extract frame at 30s as cover (a cinematic moment early in the episode)
        cmd = [
            "ffmpeg", "-y",
            "-ss", "30",
            "-i", src,
            "-frames:v", "1",
            "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
            "-q:v", "2",
            str(cover_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            job["cover_file"] = str(cover_path)
            print(f"[InstagramVisual] Cover saved: {cover_path.name}")
        else:
            print(f"[InstagramVisual] ffmpeg error: {result.stderr[-200:]}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# BOT 4 — POSTER
# ─────────────────────────────────────────────────────────────────────────────
class InstagramPoster:
    """
    Posts Reels via Meta Graph API.
    Flow: upload video → create media container → publish.
    Requires: INSTAGRAM_ACCESS_TOKEN + IG_ACCOUNT_GG/LO/ML in .env
    """

    BASE_URL = "https://graph.facebook.com/v19.0"

    def run(self, job: dict) -> dict:
        creds = PLATFORM_CREDS["instagram"]
        token = creds["access_token"]
        account_id = creds["account_ids"].get(job["channel"])

        if not token or not account_id:
            job["poster_status"] = "skipped — INSTAGRAM_ACCESS_TOKEN or account ID not set in .env"
            print(f"[InstagramPoster] Missing credentials for {job['channel']}")
            return job

        clip_file = job.get("clip_file") or job.get("source_file")
        if not clip_file or not Path(clip_file).exists():
            job["poster_status"] = "skipped — no video file found"
            return job

        copy = job.get("copy", {})
        caption = copy.get("caption", "New episode!")

        try:
            # Step 1: Create upload session (resumable upload)
            # For production, video must be publicly accessible URL.
            # Here we assume the user has already uploaded to a CDN or will use
            # Meta's direct upload endpoint.
            print(f"[InstagramPoster] Note: Instagram Reels require video at a public URL.")
            print(f"[InstagramPoster] Upload {Path(clip_file).name} to your CDN, then set video_url in job.")

            video_url = job.get("video_url")
            if not video_url:
                job["poster_status"] = "skipped — set job['video_url'] to public video URL"
                return job

            # Step 2: Create media container
            container_resp = requests.post(
                f"{self.BASE_URL}/{account_id}/media",
                data={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption,
                    "access_token": token,
                }
            ).json()

            if "id" not in container_resp:
                job["poster_status"] = f"error creating container: {container_resp}"
                return job

            container_id = container_resp["id"]
            print(f"[InstagramPoster] Container created: {container_id}")

            # Step 3: Publish
            publish_resp = requests.post(
                f"{self.BASE_URL}/{account_id}/media_publish",
                data={"creation_id": container_id, "access_token": token}
            ).json()

            if "id" in publish_resp:
                job["poster_status"] = "posted"
                job["instagram_media_id"] = publish_resp["id"]
                job["posted_at"] = datetime.now().isoformat()
                print(f"[InstagramPoster] ✅ Posted! Media ID: {publish_resp['id']}")
            else:
                job["poster_status"] = f"publish error: {publish_resp}"

        except Exception as e:
            job["poster_status"] = f"error: {e}"
            print(f"[InstagramPoster] Error: {e}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# COUNCIL RUNNER
# ─────────────────────────────────────────────────────────────────────────────
class InstagramCouncil:
    def __init__(self):
        self.strategist = InstagramStrategist()
        self.writer = InstagramWriter()
        self.visual = InstagramVisual()
        self.poster = InstagramPoster()

    def get_jobs(self, channel_key: str, posted_log: list) -> list:
        return self.strategist.run(channel_key, posted_log)

    def execute_job(self, job: dict) -> dict:
        print(f"\n[Instagram Council] Starting job: {job['type']} | {job['channel']} EP{job['episode_number']}")
        job = self.writer.run(job)
        job = self.visual.run(job)
        job = self.poster.run(job)
        return job
