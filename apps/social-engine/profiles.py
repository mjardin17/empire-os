"""
social_setup/profiles.py — Empire OS Channel Profiles
Pre-built identity for each channel on every platform.
Username, bio, content style, hashtags — ready to copy-paste.
"""

from __future__ import annotations

# ── Channel definitions ───────────────────────────────────────────────────────

CHANNELS: dict[str, dict] = {
    "gg": {
        "name":       "Gods & Glory",
        "short":      "GG",
        "niche":      "History & Battle Documentaries",
        "username":   "GodsAndGloryAI",
        "tagline":    "Epic battles. Forgotten legends. History reimagined.",
        "bio": {
            "short":  "Epic history battles brought to life with AI 🏛️⚔️ New episodes weekly.",
            "medium": "We resurrect the greatest battles in history — from ancient Rome to WWII — with cinematic AI storytelling. Gods, warriors, and legends told like never before.",
            "long":   "Gods & Glory is an AI-powered history channel dedicated to bringing the world's most epic battles and forgotten legends back to life. Every episode is a cinematic deep-dive into history's greatest moments — from the fall of Rome to the beaches of Normandy. New episodes every week.",
        },
        "hashtags":   "#history #ancienthistory #war #battle #documentary #mythology #rome #wwii #historyfacts #historybuff",
        "keywords":   "history, battle, documentary, ancient, war, mythology, empire, warriors, legends, AI",
        "color":      "#8B0000",  # dark red / blood red
        "emoji":      "⚔️🏛️🔱",
    },
    "il": {
        "name":       "Iron Legends",
        "short":      "IL",
        "niche":      "80s Mech Anime",
        "username":   "IronLegendsAI",
        "tagline":    "Steel. Fire. Legend. The golden age of mech anime lives again.",
        "bio": {
            "short":  "80s mech anime reborn with AI 🤖🔥 Giant robots. Epic battles. Pure legend.",
            "medium": "Iron Legends brings back the golden age of 80s mech anime with AI animation. Giant robots, epic space battles, and stories that hit different.",
            "long":   "Iron Legends is an AI-animated mech anime channel inspired by the golden era of 80s giant robot anime. Think Gundam, Macross, and Voltron — but reimagined for today with AI animation. New episodes weekly.",
        },
        "hashtags":   "#anime #mecha #robots #80sanime #gundam #mech #animation #scifi #AI #retro",
        "keywords":   "anime, mecha, robots, 80s, gundam, AI animation, giant robots, scifi, retro anime",
        "color":      "#1C1C2E",  # dark navy / steel
        "emoji":      "🤖⚡🔥",
    },
    "lo": {
        "name":       "Little Olympus",
        "short":      "LO",
        "niche":      "Kids Mythology & Adventure",
        "username":   "LittleOlympusAI",
        "tagline":    "Where little gods have big adventures.",
        "bio": {
            "short":  "Greek mythology for kids! 🏛️✨ Little Zeus and friends go on epic adventures.",
            "medium": "Little Olympus is where Greek mythology meets kids adventure. Little Zeus, mini Athena, and tiny Hercules — big myths, little heroes, endless fun.",
            "long":   "Little Olympus brings Greek mythology to life for kids with AI animation. Follow Little Zeus and his Olympian friends on adventures that teach history, mythology, and life lessons through fun storytelling.",
        },
        "hashtags":   "#kids #mythology #greekgods #zeus #animation #childrens #educational #fun #olympus #hercules",
        "keywords":   "kids, mythology, greek gods, zeus, animation, children, educational, olympus, hercules",
        "color":      "#FFD700",  # gold
        "emoji":      "⚡🏛️✨",
    },
    "ed": {
        "name":       "Empire Decoded",
        "short":      "ED",
        "niche":      "AI & Tech Documentary",
        "username":   "EmpireDecodedAI",
        "tagline":    "The future is being built right now. We decode it.",
        "bio": {
            "short":  "AI, tech & the future decoded 🤖💡 No hype. Just what's actually happening.",
            "medium": "Empire Decoded breaks down AI breakthroughs, tech empires, and the systems shaping our future — in plain English. No hype, no jargon.",
            "long":   "Empire Decoded is a documentary channel for people who want to understand AI and technology without the hype. We break down breakthroughs, expose the systems being built, and show you what the future actually looks like.",
        },
        "hashtags":   "#AI #tech #future #technology #artificialintelligence #machinelearning #coding #innovation #documentary #startup",
        "keywords":   "AI, technology, artificial intelligence, future, tech documentary, machine learning, innovation, startups",
        "color":      "#00FF88",  # neon green / matrix
        "emoji":      "🤖💡🔮",
    },
}

# ── Platform definitions ──────────────────────────────────────────────────────

PLATFORMS: dict[str, dict] = {
    "youtube": {
        "name":       "YouTube",
        "signup_url": "https://www.youtube.com/create_channel",
        "handle_fmt": "@{username}",
        "bio_length": 1000,
        "bio_key":    "long",
        "notes":      "Use your Empire Google account. Channel name = exact channel name.",
    },
    "instagram": {
        "name":       "Instagram",
        "signup_url": "https://www.instagram.com/accounts/emailsignup/",
        "handle_fmt": "@{username}",
        "bio_length": 150,
        "bio_key":    "short",
        "notes":      "Username must be under 30 chars. Bio max 150 chars. Add link to YouTube.",
    },
    "tiktok": {
        "name":       "TikTok",
        "signup_url": "https://www.tiktok.com/signup",
        "handle_fmt": "@{username}",
        "bio_length": 80,
        "bio_key":    "short",
        "notes":      "Username max 24 chars. Bio max 80 chars. Link YouTube in bio.",
    },
    "facebook": {
        "name":       "Facebook Page",
        "signup_url": "https://www.facebook.com/pages/create",
        "handle_fmt": "facebook.com/{username}",
        "bio_length": 255,
        "bio_key":    "medium",
        "notes":      "Create a PAGE not a personal profile. Category: Entertainment.",
    },
    "x": {
        "name":       "X (Twitter)",
        "signup_url": "https://twitter.com/i/flow/signup",
        "handle_fmt": "@{username}",
        "bio_length": 160,
        "bio_key":    "short",
        "notes":      "Username max 15 chars — may need to shorten. Bio max 160 chars.",
    },
    "pinterest": {
        "name":       "Pinterest",
        "signup_url": "https://www.pinterest.com/business/create/",
        "handle_fmt": "pinterest.com/{username}",
        "bio_length": 160,
        "bio_key":    "medium",
        "notes":      "Create a Business account. Great for thumbnails and merch.",
    },
    "threads": {
        "name":       "Threads",
        "signup_url": "https://www.threads.net/",
        "handle_fmt": "@{username}",
        "bio_length": 150,
        "bio_key":    "short",
        "notes":      "Linked to Instagram account — create Instagram first.",
    },
}
