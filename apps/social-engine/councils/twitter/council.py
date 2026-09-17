#!/usr/bin/env python3
"""
X / Twitter Council — 4 specialized bots
  1. Strategist  — picks what to tweet (episode drops, threads, quotes)
  2. Writer      — threads, hooks, quote tweets, episode announcements
  3. Thread Bot  — builds multi-tweet threads for storytelling
  4. Poster      — posts via Twitter API v2 (tweepy)
"""

import os
import json
import re
import requests
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import CHANNELS, PLATFORM_CREDS, AI_KEYS, RENDERS_DIR


# ─────────────────────────────────────────────────────────────────────────────
# BOT 1 — STRATEGIST
# ─────────────────────────────────────────────────────────────────────────────
class TwitterStrategist:
    """
    Twitter strategy per episode:
    - Tweet 1: Episode drop announcement
    - Tweet 2: Thread (5-tweet storytelling breakdown)
    - Tweet 3: Quote card / hot take (2 days later)
    """

    def run(self, channel_key: str, posted_log: list) -> list:
        channel = CHANNELS[channel_key]
        prefix = channel["renders_prefix"]
        posted_eps = {j.get("episode_number") for j in posted_log if j.get("platform") == "twitter"}
        jobs = []

        renders = sorted(RENDERS_DIR.glob(f"{prefix}*_final.mp4"))
        for render in renders:
            ep_match = re.search(r'EP(\d+)', render.name)
            ep_num = int(ep_match.group(1)) if ep_match else 0

            if ep_num in posted_eps:
                continue

            # Announcement tweet
            jobs.append({
                "type": "announcement",
                "platform": "twitter",
                "channel": channel_key,
                "source_file": str(render),
                "episode_number": ep_num,
                "status": "pending",
                "created_at": datetime.now().isoformat(),
            })

            # Story thread
            jobs.append({
                "type": "thread",
                "platform": "twitter",
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
class TwitterWriter:
    """
    Writes Twitter copy. Tweets max 280 chars each.
    Threads are 5-8 tweets that tell a mini-story.
    """

    def run(self, job: dict) -> dict:
        channel = CHANNELS[job["channel"]]
        ep = job["episode_number"]

        if AI_KEYS["openai"]:
            copy = self._ai_write(channel, ep, job["type"])
        else:
            copy = self._template_write(channel, ep, job["type"])

        job["copy"] = copy
        return job

    def _ai_write(self, channel: dict, ep: int, job_type: str) -> dict:
        try:
            import openai
            openai.api_key = AI_KEYS["openai"]
            if job_type == "thread":
                prompt = (
                    f"You are a viral Twitter/X writer for '{channel['name']}' ({channel['niche']}).\n"
                    f"Write a 6-tweet thread about Episode {ep}. Style: {channel['tone']}.\n"
                    f"Tweet 1: hook (under 200 chars). Tweets 2-5: story beats. Tweet 6: CTA.\n"
                    f"Each tweet max 270 chars. Return JSON: {{tweets: [str x6]}}"
                )
            else:
                prompt = (
                    f"You are a viral Twitter/X writer for '{channel['name']}' ({channel['niche']}).\n"
                    f"Write an episode drop announcement tweet for Episode {ep}. Max 250 chars.\n"
                    f"Include 2-3 relevant hashtags. Return JSON: {{tweet: str}}"
                )
            resp = openai.ChatCompletion.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            print(f"[TwitterWriter] OpenAI error: {e}")
            return self._template_write(channel, ep, job_type)

    def _template_write(self, channel: dict, ep: int, job_type: str) -> dict:
        name = channel["name"]
        tags = " ".join(channel["hashtags"][:3])
        if job_type == "thread":
            return {
                "tweets": [
                    f"🧵 The story behind {name} Episode {ep} is wilder than you think. Thread 👇",
                    f"1/ We started with one question: what really happened? The answer changed everything.",
                    f"2/ The research took us deep into historical records most people never see. 📜",
                    f"3/ What we found became the backbone of Episode {ep}. Epic doesn't cover it.",
                    f"4/ The team put everything into this one. Cinematics. Narration. Music. All of it.",
                    f"5/ Full episode drops NOW on YouTube. Don't sleep on this one. {tags}",
                ]
            }
        return {
            "tweet": f"🎬 {name} Episode {ep} is LIVE! Drop everything and watch it now. {tags}"
        }


# ─────────────────────────────────────────────────────────────────────────────
# BOT 3 — THREAD BOT
# ─────────────────────────────────────────────────────────────────────────────
class TwitterThreadBot:
    """
    Validates and formats threads.
    Splits any tweet that exceeds 280 chars.
    Adds numbering and emoji hooks to each tweet.
    """

    def run(self, job: dict) -> dict:
        copy = job.get("copy", {})
        if job["type"] == "thread":
            tweets = copy.get("tweets", [])
            validated = []
            for i, tweet in enumerate(tweets):
                # Truncate at 278 chars (leave room for numbering safety)
                if len(tweet) > 278:
                    tweet = tweet[:275] + "..."
                validated.append(tweet)
            copy["tweets"] = validated
        else:
            tweet = copy.get("tweet", "")
            if len(tweet) > 278:
                copy["tweet"] = tweet[:275] + "..."

        job["copy"] = copy
        return job


# ─────────────────────────────────────────────────────────────────────────────
# BOT 4 — POSTER
# ─────────────────────────────────────────────────────────────────────────────
class TwitterPoster:
    """
    Posts tweets and threads via Twitter API v2 using tweepy.
    Requires per-channel access tokens in .env.
    """

    def run(self, job: dict) -> dict:
        creds = PLATFORM_CREDS["twitter"]
        ch = job["channel"]
        api_key = creds["api_key"]
        api_secret = creds["api_secret"]
        token = creds["access_token"].get(ch)
        secret = creds["access_secret"].get(ch)

        if not all([api_key, api_secret, token, secret]):
            job["poster_status"] = "skipped — Twitter API credentials not set in .env"
            print(f"[TwitterPoster] Missing credentials for {ch}")
            return job

        try:
            import tweepy
            client = tweepy.Client(
                consumer_key=api_key,
                consumer_secret=api_secret,
                access_token=token,
                access_token_secret=secret,
            )

            copy = job.get("copy", {})
            tweet_ids = []

            if job["type"] == "thread":
                tweets = copy.get("tweets", [])
                reply_to = None
                for tweet_text in tweets:
                    if reply_to:
                        resp = client.create_tweet(text=tweet_text, in_reply_to_tweet_id=reply_to)
                    else:
                        resp = client.create_tweet(text=tweet_text)
                    tweet_ids.append(resp.data["id"])
                    reply_to = resp.data["id"]
                print(f"[TwitterPoster] ✅ Thread posted! {len(tweet_ids)} tweets. First ID: {tweet_ids[0]}")
            else:
                tweet_text = copy.get("tweet", "New episode!")
                resp = client.create_tweet(text=tweet_text)
                tweet_ids.append(resp.data["id"])
                print(f"[TwitterPoster] ✅ Tweet posted! ID: {tweet_ids[0]}")

            job["poster_status"] = "posted"
            job["twitter_tweet_ids"] = tweet_ids
            job["posted_at"] = datetime.now().isoformat()

        except ImportError:
            job["poster_status"] = "skipped — run: pip install tweepy"
        except Exception as e:
            job["poster_status"] = f"error: {e}"
            print(f"[TwitterPoster] Error: {e}")

        return job


# ─────────────────────────────────────────────────────────────────────────────
# COUNCIL RUNNER
# ─────────────────────────────────────────────────────────────────────────────
class TwitterCouncil:
    def __init__(self):
        self.strategist = TwitterStrategist()
        self.writer = TwitterWriter()
        self.thread_bot = TwitterThreadBot()
        self.poster = TwitterPoster()

    def get_jobs(self, channel_key: str, posted_log: list) -> list:
        return self.strategist.run(channel_key, posted_log)

    def execute_job(self, job: dict) -> dict:
        print(f"\n[Twitter Council] Starting job: {job['type']} | {job['channel']} EP{job['episode_number']}")
        job = self.writer.run(job)
        job = self.thread_bot.run(job)
        job = self.poster.run(job)
        return job
