#!/usr/bin/env python3
"""
TikTok Council — 4 specialized bots
  1. Strategist  — picks clips optimized for TikTok's algorithm
  2. Writer      — hooks, captions, sound strategy, hashtags
  3. Clipper     — cuts 15/30/60s vertical clips (TikTok sweet spots)
  4. Poster      — uploads via TikTok Content Posting API
"""

import os
import json
import subprocess
import requests
from pathlib import Path
from datetime import datetime
import re

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CHANNELS, PLATFORM_CREDS, AI_KEYS, RENDERS_DIR


TIKTOK_SWEET_SPOTS = [15, 30, 60]   # seconds — TikTok algorithm prefers these lengths


# ─────────────────────────────────────────────────────────────────────────────
# BOT 1 — STRATEGIST
# ─────────────────────────────────────────────────────────────────────────────
class TikTokStrategist:
    """
    TikTok strategy: post 3 clips per episode at different lengths.
    Short (15s) for hook, medium (30s) for value, long (60s) for deep dive.
    """

    def run(self, channel_key: str, posted_log: list) -> list:
        channel = CHANNELS[channel_key]
        prefix = channel["renders_prefix"]
        posted_files = {j.get("source_file") for j in posted_log if j.get("platform") == "tiktok"}
        jobs = []

        renders = sorted(RENDERS_DIR.glob(f"{prefix}*_final.mp4"))
        for render in renders:
            if str(render) in posted_files:
                continue

            ep_match = re.search(r'EP(\d+)', render.name)
            ep_num = int(ep_match.group(1)) if ep_match else 0

            # One clip per sweet-spot duration
            for duration in TIKTOK_SWEET_SPOTS:
                start = 10 if duration == 15 else (30 if duration == 30 else 60)
                jobs.append({
                    "type": "tiktok_clip",
                    "platform": "tiktok",
                    "channel": channel_key,
                    "source_file": str(render),
                    "episode_number": ep_num,
                    "clip_duration_sec": duration,
                    "clip_start_sec": start,
                    "status": "pending",
                    "created_at": datetime.now().isoformat(),
                })

        return jobs


# ─────────────────────────────────────────────────────────────────────────────
# BOT 2 — WRITER
# ─────────────────────────────────────────────────────────────────────────────
class TikTokWriter:
    """
    TikTok copy is ALL about the first line — it shows before "more".
    Hook must be ultra-short, punchy, curiosity-driven.
    """

    def run(self, job: dict) -> dict:
        channel = CHANNELS[job["channel"]]
        ep = job["episode_number"]
        duration = job.get("clip_duration_sec", 30)

        if AI_KEYS["openai"]:
            copy = self._ai_write(channel, ep, duration)
        else:
            copy = self._template_write(channel, ep, duration)

        job["copy"] = copy
        return job

    def _ai_write(self, channel: dict, ep: int, duration: int) -> dict:
        try:
            import openai
            openai.api_key = AI_KEYS["openai"]
            prompt = (
                f"You are a viral TikTok copywriter for '{channel['name']}' ({channel['niche']}).\n"
                f"Write for a {duration}s TikTok clip from Episode {ep}.\n"
                f"Rules: Hook line max 80 chars. No hashtags in caption body. 5-8 hashtags separately.\n"
                f"Return JSON: {{hook: str, caption: str, hashtags: [str]}}"
            )
            resp = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            print(f"[TikTokWriter] OpenAI error: {e}")
            return self._template_write(channel, ep, duration)

    def _template_write(self, channel: dict, ep: int, duration: int) -> dict:
        name = channel["name"]
        hooks = {
            15: f"They don't teach this in school... 🔥",
            30: f"Wait until the end — this changes everything 👀",
            60: f"The real story behind Episode {ep} of {name} 🎬",
        }
        tags = channel["hashtags"][:6] + ["#tiktok", "#fyp"]
        return {
            "hook": hooks.get(duration, f"Episode {ep} hits different 🔥"),
            "caption": f"{hooks.get(duration)} {name} Ep {ep} — follow for more!",
            "hashtags": tags,
        }


# ─────────────────────────────────────────────────────────────────────────────
# BOT 3 — CLIPPER
# ─────────────────────────────────────────────────────────────────────────────
class TikTokClipper:
    """
    Cuts vertical 9:16 clips at TikTok's preferred durations.
    Adds subtle zoom pulse to the first 2s to retain attention.
    """

    CLIPS_DIR = Path(__file__).parent.parent.parent / "queue" / "clips"

    def run(self, job: dict) -> dict:
        self.CLIPS_DIR.mkdir(parents=True, exist_ok=True)
        src = job["source_file"]
        ep = job["episode_number"]
        ch = job["channel"]
        start = job.get("clip_start_sec", 10)
        duration = job.get("clip_duration_sec", 30)

        out_path = self.CLIPS_DIR / f"{ch}_EP{ep:03d}_tiktok_{duration}s.mp4"

        if out_path.exists():
            job["clip_file"] = str(out_path)
            return job

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", src,
            "-t", str(duration),
            "-vf", "crop=607:1080,scale=1080:1920,setsar=1",
            "-c:v", "libx264", "-crf", "22", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(out_path)
        ]

        print(f"[TikTokClipper] Cutting {duration}s clip: {out_path.name} ...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            job["clip_file"] = str(out_path)
            print(f"[TikTokClipper] Done: {out_path.name}")
        else:
            job["clipper_error"] = result.stderr[-300:]
            print(f"[TikTokClipper] Error: {result.stderr[-200:]}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# BOT 4 — POSTER
# ─────────────────────────────────────────────────────────────────────────────
class TikTokPoster:
    """
    Posts to TikTok via Content Posting API (v2).
    Requires: TIKTOK_ACCESS_TOKEN + TIKTOK_OPENID_GG/LO/ML in .env
    Developer portal: https://developers.tiktok.com/
    """

    UPLOAD_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
    PUBLISH_URL = "https://open.tiktokapis.com/v2/post/publish/video/complete/"

    def run(self, job: dict) -> dict:
        creds = PLATFORM_CREDS["tiktok"]
        token = creds["access_token"]
        open_id = creds["open_id"].get(job["channel"])

        if not token or not open_id:
            job["poster_status"] = "skipped — TIKTOK_ACCESS_TOKEN or TIKTOK_OPENID not set in .env"
            return job

        clip_file = job.get("clip_file")
        if not clip_file or not Path(clip_file).exists():
            job["poster_status"] = "skipped — no clip file"
            return job

        copy = job.get("copy", {})
        caption = copy.get("caption", "New episode!")
        hashtags = " ".join(copy.get("hashtags", []))

        try:
            file_size = Path(clip_file).stat().st_size
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
            }

            # Initialize upload
            init_resp = requests.post(self.UPLOAD_URL, headers=headers, json={
                "post_info": {
                    "title": f"{caption} {hashtags}"[:2200],
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": file_size,
                    "chunk_size": file_size,
                    "total_chunk_count": 1,
                }
            }).json()

            if init_resp.get("error", {}).get("code") != "ok":
                job["poster_status"] = f"init error: {init_resp}"
                return job

            upload_url = init_resp["data"]["upload_url"]
            publish_id = init_resp["data"]["publish_id"]

            # Upload video bytes
            with open(clip_file, "rb") as f:
                video_bytes = f.read()

            upload_resp = requests.put(
                upload_url,
                data=video_bytes,
                headers={
                    "Content-Range": f"bytes 0-{file_size-1}/{file_size}",
                    "Content-Length": str(file_size),
                    "Content-Type": "video/mp4",
                }
            )

            if upload_resp.status_code not in (200, 201):
                job["poster_status"] = f"upload error: {upload_resp.status_code}"
                return job

            job["poster_status"] = "posted"
            job["tiktok_publish_id"] = publish_id
            job["posted_at"] = datetime.now().isoformat()
            print(f"[TikTokPoster] ✅ Posted! Publish ID: {publish_id}")

        except Exception as e:
            job["poster_status"] = f"error: {e}"
            print(f"[TikTokPoster] Error: {e}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# COUNCIL RUNNER
# ─────────────────────────────────────────────────────────────────────────────
class TikTokCouncil:
    def __init__(self):
        self.strategist = TikTokStrategist()
        self.writer = TikTokWriter()
        self.clipper = TikTokClipper()
        self.poster = TikTokPoster()

    def get_jobs(self, channel_key: str, posted_log: list) -> list:
        return self.strategist.run(channel_key, posted_log)

    def execute_job(self, job: dict) -> dict:
        print(f"\n[TikTok Council] Starting job: {job['type']} | {job['channel']} EP{job['episode_number']}")
        job = self.writer.run(job)
        job = self.clipper.run(job)
        job = self.poster.run(job)
        return job
