#!/usr/bin/env python3
"""
Facebook Council — 4 specialized bots
  1. Strategist  — episode drops + Reels for Facebook pages
  2. Writer      — Facebook-optimized copy (longer, storytelling-first)
  3. Visual      — extracts thumbnail for video posts
  4. Poster      — posts via Meta Graph API (video + Reels)
"""

import os
import json
import subprocess
import requests
import re
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CHANNELS, PLATFORM_CREDS, AI_KEYS, RENDERS_DIR


# ─────────────────────────────────────────────────────────────────────────────
# BOT 1 — STRATEGIST
# ─────────────────────────────────────────────────────────────────────────────
class FacebookStrategist:
    """
    Facebook strategy: full episode video post + a Reel clip per episode.
    Facebook rewards native video uploads heavily — always upload directly.
    """

    def run(self, channel_key: str, posted_log: list) -> list:
        channel = CHANNELS[channel_key]
        prefix = channel["renders_prefix"]
        posted_eps = {j.get("episode_number") for j in posted_log if j.get("platform") == "facebook"}
        jobs = []

        renders = sorted(RENDERS_DIR.glob(f"{prefix}*_final.mp4"))
        for render in renders:
            ep_match = re.search(r'EP(\d+)', render.name)
            ep_num = int(ep_match.group(1)) if ep_match else 0

            if ep_num in posted_eps:
                continue

            jobs.append({
                "type": "fb_video",
                "platform": "facebook",
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
class FacebookWriter:
    """
    Facebook posts perform best with longer, story-driven copy.
    Format: emotional hook → 3 value bullets → CTA → hashtags (5-10 max).
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
                f"You are a Facebook page manager for '{channel['name']}' ({channel['niche']}).\n"
                f"Write a Facebook video post for Episode {ep}. Tone: {channel['tone']}.\n"
                f"Format: emotional hook (1 line), 3 value bullets with emojis, CTA, 5 hashtags.\n"
                f"Return JSON: {{title: str, body: str, hashtags: [str x5]}}"
            )
            resp = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            print(f"[FacebookWriter] OpenAI error: {e}")
            return self._template_write(channel, ep)

    def _template_write(self, channel: dict, ep: int) -> dict:
        name = channel["name"]
        tags = channel["hashtags"][:5]
        return {
            "title": f"{name} — Episode {ep} is HERE 🎬",
            "body": (
                f"This one hits different. ⚡\n\n"
                f"✅ Epic storytelling you won't find anywhere else\n"
                f"✅ Cinematic visuals built from the ground up\n"
                f"✅ A story that will stay with you\n\n"
                f"Watch Episode {ep} of {name} now and tell us what you think in the comments!\n\n"
                f"👇 Drop a 🔥 if you want Episode {ep+1} ASAP.\n\n"
                + " ".join(tags)
            ),
            "hashtags": tags,
        }


# ─────────────────────────────────────────────────────────────────────────────
# BOT 3 — VISUAL
# ─────────────────────────────────────────────────────────────────────────────
class FacebookVisual:
    """
    Extracts a 16:9 thumbnail for Facebook video posts.
    Facebook displays a 16:9 thumbnail in the feed.
    """

    THUMBS_DIR = Path(__file__).parent.parent.parent / "queue" / "thumbnails"

    def run(self, job: dict) -> dict:
        self.THUMBS_DIR.mkdir(parents=True, exist_ok=True)
        src = job["source_file"]
        ep = job["episode_number"]
        ch = job["channel"]
        thumb_path = self.THUMBS_DIR / f"{ch}_EP{ep:03d}_fb_thumb.jpg"

        if thumb_path.exists():
            job["thumbnail_file"] = str(thumb_path)
            return job

        cmd = [
            "ffmpeg", "-y",
            "-ss", "45",
            "-i", src,
            "-frames:v", "1",
            "-vf", "scale=1280:720",
            "-q:v", "2",
            str(thumb_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            job["thumbnail_file"] = str(thumb_path)
            print(f"[FacebookVisual] Thumbnail: {thumb_path.name}")
        else:
            print(f"[FacebookVisual] ffmpeg error: {result.stderr[-200:]}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# BOT 4 — POSTER
# ─────────────────────────────────────────────────────────────────────────────
class FacebookPoster:
    """
    Posts video to Facebook Page via Meta Graph API.
    Requires: FACEBOOK_ACCESS_TOKEN + FB_PAGE_GG/LO/ML in .env
    """

    BASE_URL = "https://graph.facebook.com/v19.0"

    def run(self, job: dict) -> dict:
        creds = PLATFORM_CREDS["facebook"]
        token = creds["access_token"]
        page_id = creds["page_ids"].get(job["channel"])

        if not token or not page_id:
            job["poster_status"] = "skipped — FACEBOOK_ACCESS_TOKEN or page ID not set in .env"
            print(f"[FacebookPoster] Missing credentials for {job['channel']}")
            return job

        src = job["source_file"]
        if not Path(src).exists():
            job["poster_status"] = "skipped — source file not found"
            return job

        copy = job.get("copy", {})
        description = f"{copy.get('title', '')}\n\n{copy.get('body', '')}"

        try:
            # Facebook native video upload endpoint
            upload_url = f"{self.BASE_URL}/{page_id}/videos"
            print(f"[FacebookPoster] Uploading {Path(src).name} to Facebook Page {page_id} ...")

            with open(src, "rb") as video_file:
                resp = requests.post(
                    upload_url,
                    data={
                        "description": description[:5000],
                        "access_token": token,
                    },
                    files={"file": (Path(src).name, video_file, "video/mp4")},
                    timeout=300,
                ).json()

            if "id" in resp:
                job["poster_status"] = "posted"
                job["facebook_video_id"] = resp["id"]
                job["posted_at"] = datetime.now().isoformat()
                print(f"[FacebookPoster] ✅ Posted! Video ID: {resp['id']}")
            else:
                job["poster_status"] = f"error: {resp}"
                print(f"[FacebookPoster] API error: {resp}")

        except Exception as e:
            job["poster_status"] = f"error: {e}"
            print(f"[FacebookPoster] Error: {e}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# COUNCIL RUNNER
# ─────────────────────────────────────────────────────────────────────────────
class FacebookCouncil:
    def __init__(self):
        self.strategist = FacebookStrategist()
        self.writer = FacebookWriter()
        self.visual = FacebookVisual()
        self.poster = FacebookPoster()

    def get_jobs(self, channel_key: str, posted_log: list) -> list:
        return self.strategist.run(channel_key, posted_log)

    def execute_job(self, job: dict) -> dict:
        print(f"\n[Facebook Council] Starting job: {job['type']} | {job['channel']} EP{job['episode_number']}")
        job = self.writer.run(job)
        job = self.visual.run(job)
        job = self.poster.run(job)
        return job
