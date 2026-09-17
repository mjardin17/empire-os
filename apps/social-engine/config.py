#!/usr/bin/env python3
"""
config.py — Social Machine Central Config
Loads all API credentials from .env and defines your 3 channels.
Every council bot imports from here.
"""

import os
import json
from pathlib import Path

# ─── Root paths ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent          # video-bot-pipeline/
SOCIAL_ROOT = Path(__file__).parent          # social_machine/
RENDERS_DIR = ROOT / "renders"
QUEUE_DIR = SOCIAL_ROOT / "queue"
LOGS_DIR = SOCIAL_ROOT / "logs"


def load_env():
    """Lightweight .env loader — no external deps required."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

load_env()


# ─── Your 3 Channels ───────────────────────────────────────────────────────────
CHANNELS = {
    "gods_and_glory": {
        "name": "Gods & Glory",
        "niche": "Ancient history documentary",
        "tone": "Epic, cinematic, educational",
        "audience": "History buffs 18-45",
        "hashtags": ["#history", "#ancienthistory", "#documentary", "#GodsAndGlory",
                     "#mythology", "#ancientrome", "#ancientgreece", "#historyshorts"],
        "hook_style": "dramatic question or shocking fact",
        "renders_prefix": "GG_EP",
    },
    "little_olympus": {
        "name": "Little Olympus",
        "niche": "Kids mythology animated",
        "tone": "Fun, warm, educational for kids",
        "audience": "Parents + kids 3-10",
        "hashtags": ["#kidsvideo", "#mythology", "#LittleOlympus", "#greekgods",
                     "#kidsyoutube", "#animation", "#learningisfun", "#kidscontent"],
        "hook_style": "fun question or silly fact",
        "renders_prefix": "LO_EP",
    },
    "mech_legends": {
        "name": "Mech Legends",
        "niche": "Sci-fi robot heroes animated",
        "tone": "Action-packed, hype, adventurous",
        "audience": "Kids + teens 8-16",
        "hashtags": ["#mech", "#robots", "#animation", "#MechLegends",
                     "#scifi", "#action", "#anime", "#kidscontent"],
        "hook_style": "action hook or epic challenge",
        "renders_prefix": "ML_EP",
    },
}


# ─── Platform API Credentials ──────────────────────────────────────────────────
PLATFORM_CREDS = {
    "youtube": {
        "client_secrets_file": os.getenv("YOUTUBE_CLIENT_SECRETS", str(ROOT / "youtube_client_secrets.json")),
        "token_file": os.getenv("YOUTUBE_TOKEN_FILE", str(SOCIAL_ROOT / "queue" / "youtube_token.json")),
        "scopes": ["https://www.googleapis.com/auth/youtube.upload",
                   "https://www.googleapis.com/auth/youtube"],
        "channel_ids": {
            "gods_and_glory": os.getenv("YT_CHANNEL_GG", ""),
            "little_olympus": os.getenv("YT_CHANNEL_LO", ""),
            "mech_legends": os.getenv("YT_CHANNEL_ML", ""),
        },
    },
    "instagram": {
        "access_token": os.getenv("INSTAGRAM_ACCESS_TOKEN", ""),
        "account_ids": {
            "gods_and_glory": os.getenv("IG_ACCOUNT_GG", ""),
            "little_olympus": os.getenv("IG_ACCOUNT_LO", ""),
            "mech_legends": os.getenv("IG_ACCOUNT_ML", ""),
        },
    },
    "tiktok": {
        "access_token": os.getenv("TIKTOK_ACCESS_TOKEN", ""),
        "open_id": {
            "gods_and_glory": os.getenv("TIKTOK_OPENID_GG", ""),
            "little_olympus": os.getenv("TIKTOK_OPENID_LO", ""),
            "mech_legends": os.getenv("TIKTOK_OPENID_ML", ""),
        },
    },
    "twitter": {
        "api_key": os.getenv("TWITTER_API_KEY", ""),
        "api_secret": os.getenv("TWITTER_API_SECRET", ""),
        "access_token": {
            "gods_and_glory": os.getenv("TWITTER_TOKEN_GG", ""),
            "little_olympus": os.getenv("TWITTER_TOKEN_LO", ""),
            "mech_legends": os.getenv("TWITTER_TOKEN_ML", ""),
        },
        "access_secret": {
            "gods_and_glory": os.getenv("TWITTER_SECRET_GG", ""),
            "little_olympus": os.getenv("TWITTER_SECRET_LO", ""),
            "mech_legends": os.getenv("TWITTER_SECRET_ML", ""),
        },
    },
    "facebook": {
        "access_token": os.getenv("FACEBOOK_ACCESS_TOKEN", ""),
        "page_ids": {
            "gods_and_glory": os.getenv("FB_PAGE_GG", ""),
            "little_olympus": os.getenv("FB_PAGE_LO", ""),
            "mech_legends": os.getenv("FB_PAGE_ML", ""),
        },
    },
}

# AI Keys (used by Strategist + Writer bots)
AI_KEYS = {
    "openai": os.getenv("OPENAI_API_KEY", ""),
    "gemini": os.getenv("GEMINI_API_KEY", ""),
}

# Best posting times per platform (24h, local time)
BEST_POST_TIMES = {
    "youtube":   ["15:00", "17:00", "20:00"],
    "instagram": ["11:00", "14:00", "19:00"],
    "tiktok":    ["07:00", "12:00", "19:00", "22:00"],
    "twitter":   ["09:00", "12:00", "17:00"],
    "facebook":  ["13:00", "15:00", "19:00"],
}

# Short-form clip settings
SHORTS_SETTINGS = {
    "max_duration_sec": 58,
    "resolution": "1080x1920",   # vertical
    "fps": 30,
}


def channel_info(channel_key: str) -> dict:
    return CHANNELS.get(channel_key, {})


def is_configured(platform: str) -> bool:
    """Returns True if the platform has at least one credential set."""
    creds = PLATFORM_CREDS.get(platform, {})
    token = creds.get("access_token") or creds.get("client_secrets_file") or creds.get("api_key")
    return bool(token)


if __name__ == "__main__":
    print("=== Social Machine Config Check ===")
    for p in ["youtube", "instagram", "tiktok", "twitter", "facebook"]:
        status = "✅ CONFIGURED" if is_configured(p) else "⚠️  NOT YET SET (add keys to .env)"
        print(f"  {p.upper():12} {status}")
    print()
    print(f"AI — OpenAI: {'✅' if AI_KEYS['openai'] else '⚠️  missing'}")
    print(f"AI — Gemini: {'✅' if AI_KEYS['gemini'] else '⚠️  missing'}")
