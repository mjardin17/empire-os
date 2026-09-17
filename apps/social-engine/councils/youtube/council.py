#!/usr/bin/env python3
"""
YouTube Council — 4 specialized bots
  1. Strategist  — decides what to post and when
  2. Writer      — titles, descriptions, tags
  3. Clipper     — cuts a 58s Short from a full episode
  4. Poster      — uploads to YouTube via Data API v3

Each bot has a .run(job) method that accepts and returns a job dict.
"""

import os
import json
import subprocess
import re
from pathlib import Path
from datetime import datetime

# ── shared config ────────────────────────────────────────────────────────────
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CHANNELS, PLATFORM_CREDS, AI_KEYS, SHORTS_SETTINGS, RENDERS_DIR


# ─────────────────────────────────────────────────────────────────────────────
# BOT 1 — STRATEGIST
# ─────────────────────────────────────────────────────────────────────────────
class YouTubeStrategist:
    """
    Decides WHAT to post on YouTube and when.
    Scans renders/ for new episodes and Shorts candidates.
    Output: list of job dicts ready for the Writer.
    """

    def run(self, channel_key: str, posted_log: list) -> list:
        channel = CHANNELS[channel_key]
        prefix = channel["renders_prefix"]
        jobs = []

        # Find all final renders for this channel
        renders = sorted(RENDERS_DIR.glob(f"{prefix}*_final.mp4"))
        posted_files = {j.get("source_file") for j in posted_log}

        for render in renders:
            if str(render) in posted_files:
                continue  # already posted

            ep_match = re.search(r'EP(\d+)', render.name)
            ep_num = int(ep_match.group(1)) if ep_match else 0

            # Full episode upload job
            jobs.append({
                "type": "full_episode",
                "platform": "youtube",
                "channel": channel_key,
                "source_file": str(render),
                "episode_number": ep_num,
                "status": "pending",
                "created_at": datetime.now().isoformat(),
            })

            # Also create a Shorts job from the same file
            jobs.append({
                "type": "short",
                "platform": "youtube",
                "channel": channel_key,
                "source_file": str(render),
                "episode_number": ep_num,
                "clip_start_sec": 30,   # Clipper will pick best hook moment
                "clip_duration_sec": SHORTS_SETTINGS["max_duration_sec"],
                "status": "pending",
                "created_at": datetime.now().isoformat(),
            })

        return jobs


# ─────────────────────────────────────────────────────────────────────────────
# BOT 2 — WRITER
# ─────────────────────────────────────────────────────────────────────────────
class YouTubeWriter:
    """
    Writes YouTube titles, descriptions, and tags.
    Uses OpenAI if key is set; falls back to deterministic templates.
    """

    def run(self, job: dict) -> dict:
        channel = CHANNELS[job["channel"]]
        ep = job["episode_number"]
        job_type = job["type"]

        if AI_KEYS["openai"]:
            copy = self._ai_write(channel, ep, job_type)
        else:
            copy = self._template_write(channel, ep, job_type)

        job["copy"] = copy
        return job

    def _ai_write(self, channel: dict, ep: int, job_type: str) -> dict:
        try:
            import openai
            openai.api_key = AI_KEYS["openai"]
            style = "YouTube Short (under 60s, punchy hook)" if job_type == "short" else "full YouTube episode"
            prompt = (
                f"You are a viral YouTube copywriter for the channel '{channel['name']}' "
                f"({channel['niche']}). Tone: {channel['tone']}. Audience: {channel['audience']}.\n\n"
                f"Write for episode {ep} as a {style}.\n"
                f"Return JSON with keys: title (max 100 chars), description (3 paragraphs), "
                f"tags (list of 15 strings). Hook style: {channel['hook_style']}."
            )
            resp = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            print(f"[YouTubeWriter] OpenAI error: {e} — using template")
            return self._template_write(channel, ep, job_type)

    def _template_write(self, channel: dict, ep: int, job_type: str) -> dict:
        name = channel["name"]
        tags = channel["hashtags"] + [f"episode{ep}", name.replace(" ", "")]
        if job_type == "short":
            return {
                "title": f"{name} — Ep {ep} #Shorts",
                "description": (
                    f"Can't stop watching {name} Episode {ep}! 🔥\n\n"
                    f"Drop a 🔥 if you want the full episode!\n\n"
                    f"Subscribe for new episodes every week.\n\n"
                    + " ".join(channel["hashtags"])
                ),
                "tags": tags,
                "is_short": True,
            }
        return {
            "title": f"{name} — Episode {ep} | Full Documentary",
            "description": (
                f"Welcome to {name} Episode {ep}! 🎬\n\n"
                f"{channel['niche'].capitalize()} — {channel['tone']}.\n\n"
                f"Subscribe for weekly episodes and don't miss what's coming next!\n\n"
                + " ".join(channel["hashtags"])
            ),
            "tags": tags,
            "is_short": False,
        }


# ─────────────────────────────────────────────────────────────────────────────
# BOT 3 — CLIPPER
# ─────────────────────────────────────────────────────────────────────────────
class YouTubeClipper:
    """
    Cuts a vertical 9:16 Short from a full episode render using ffmpeg.
    Saves to social_machine/queue/clips/.
    """

    CLIPS_DIR = Path(__file__).parent.parent.parent / "queue" / "clips"

    def run(self, job: dict) -> dict:
        if job["type"] != "short":
            return job  # nothing to clip for full episodes

        self.CLIPS_DIR.mkdir(parents=True, exist_ok=True)
        src = job["source_file"]
        ep = job["episode_number"]
        ch = job["channel"]
        start = job.get("clip_start_sec", 30)
        duration = job.get("clip_duration_sec", 58)

        out_path = self.CLIPS_DIR / f"{ch}_EP{ep:03d}_short.mp4"

        if out_path.exists():
            print(f"[YouTubeClipper] Clip already exists: {out_path.name}")
            job["clip_file"] = str(out_path)
            return job

        # Crop to 1080x1920 (center crop from 1920x1080 source)
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", src,
            "-t", str(duration),
            "-vf", "crop=607:1080,scale=1080:1920",   # center crop + scale to vertical
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            str(out_path)
        ]

        print(f"[YouTubeClipper] Cutting Short: {out_path.name} ...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            job["clipper_error"] = result.stderr[-500:]
            print(f"[YouTubeClipper] ffmpeg error: {result.stderr[-200:]}")
        else:
            job["clip_file"] = str(out_path)
            print(f"[YouTubeClipper] Done: {out_path.name}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# BOT 4 — POSTER
# ─────────────────────────────────────────────────────────────────────────────
class YouTubePoster:
    """
    Uploads video to YouTube using the YouTube Data API v3.
    Requires OAuth2 — run `python social_machine/auth/youtube_auth.py` once to generate token.
    """

    def run(self, job: dict) -> dict:
        creds_conf = PLATFORM_CREDS["youtube"]

        if not Path(creds_conf["client_secrets_file"]).exists():
            job["poster_status"] = "skipped — youtube_client_secrets.json not found"
            print("[YouTubePoster] No client secrets. Add youtube_client_secrets.json to pipeline root.")
            return job

        try:
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            import google.auth.transport.requests

            token_file = creds_conf["token_file"]
            scopes = creds_conf["scopes"]
            creds = None

            if Path(token_file).exists():
                creds = Credentials.from_authorized_user_file(token_file, scopes)
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(google.auth.transport.requests.Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(
                        creds_conf["client_secrets_file"], scopes)
                    creds = flow.run_local_server(port=0)
                Path(token_file).parent.mkdir(parents=True, exist_ok=True)
                with open(token_file, "w") as f:
                    f.write(creds.to_json())

            youtube = build("youtube", "v3", credentials=creds)
            copy = job.get("copy", {})
            upload_file = job.get("clip_file") if job["type"] == "short" else job["source_file"]

            if not upload_file or not Path(upload_file).exists():
                job["poster_status"] = f"skipped — upload file not found: {upload_file}"
                return job

            body = {
                "snippet": {
                    "title": copy.get("title", f"Episode {job['episode_number']}"),
                    "description": copy.get("description", ""),
                    "tags": copy.get("tags", []),
                    "categoryId": "22",   # People & Blogs (use 24 for Entertainment)
                },
                "status": {
                    "privacyStatus": "public",
                    "selfDeclaredMadeForKids": job["channel"] == "little_olympus",
                },
            }

            media = MediaFileUpload(upload_file, chunksize=-1, resumable=True)
            request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

            print(f"[YouTubePoster] Uploading {Path(upload_file).name} ...")
            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    print(f"  Progress: {int(status.progress() * 100)}%")

            job["poster_status"] = "posted"
            job["youtube_video_id"] = response.get("id")
            job["posted_at"] = datetime.now().isoformat()
            print(f"[YouTubePoster] ✅ Posted! Video ID: {response.get('id')}")

        except ImportError:
            job["poster_status"] = "skipped — run: pip install google-api-python-client google-auth-oauthlib"
        except Exception as e:
            job["poster_status"] = f"error: {e}"
            print(f"[YouTubePoster] Error: {e}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# COUNCIL RUNNER
# ─────────────────────────────────────────────────────────────────────────────
class YouTubeCouncil:
    """Runs all 4 YouTube bots in sequence for a given job."""

    def __init__(self):
        self.strategist = YouTubeStrategist()
        self.writer = YouTubeWriter()
        self.clipper = YouTubeClipper()
        self.poster = YouTubePoster()

    def get_jobs(self, channel_key: str, posted_log: list) -> list:
        return self.strategist.run(channel_key, posted_log)

    def execute_job(self, job: dict) -> dict:
        print(f"\n[YouTube Council] Starting job: {job['type']} | {job['channel']} EP{job['episode_number']}")
        job = self.writer.run(job)
        job = self.clipper.run(job)
        job = self.poster.run(job)
        return job
