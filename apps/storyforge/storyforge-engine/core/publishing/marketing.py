"""
StoryForge Publishing Intelligence Studio -- Marketing Generator
----------------------------------------------------------------
Generates channel-specific marketing copy (TikTok/Shorts scripts,
Instagram posts, Pinterest pins, Facebook ad copy, email campaigns) via
the same swappable AIProvider used by the Creative Council and Book
Optimizer. This is a real orchestration loop (one call per requested
channel, structured results collected), not a mock -- mirrors
`core/council/specialists.py`'s `CreativeCouncil` pattern exactly.

Image assets (thumbnails, social graphics) are NOT generated here --
that already exists in Image Studio (`core/image/`). `generate_channel_set`
optionally accepts an already-created `image_asset_id` per asset so
marketing copy can reference/link to imagery Image Studio produced,
without this module needing to know anything about image providers.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.ai.provider import AIProvider, ProviderError, get_provider
from core.publishing.models import MARKETING_CHANNELS, MarketingAsset

_CHANNEL_PROMPTS = {
    "tiktok_video_script": (
        "Write a 30-45 second TikTok video script (spoken lines + on-screen text cues) "
        "that hooks in the first 2 seconds and drives clicks to the book."
    ),
    "youtube_shorts_script": (
        "Write a under-60-second YouTube Shorts script (spoken lines + shot suggestions) "
        "built around one strong hook related to the book's premise."
    ),
    "instagram_post": (
        "Write an Instagram caption (3-5 sentences plus 5-8 relevant hashtags) for a "
        "carousel post about this book."
    ),
    "pinterest_pin": (
        "Write a Pinterest pin title (under 100 characters) and a description "
        "(under 500 characters) optimized for Pinterest search."
    ),
    "facebook_ad": (
        "Write a Facebook ad: a primary text (1-2 short paragraphs), a headline "
        "(under 40 characters), and a call-to-action label."
    ),
    "email_campaign": (
        "Write a launch-announcement email: a subject line, a preview line, and a "
        "short body (3-4 paragraphs) with one clear call to action."
    ),
}


class MarketingGeneratorError(ValueError):
    pass


@dataclass
class MarketingChannelResult:
    channel: str
    copy_text: str = ""
    error: Optional[str] = None


class MarketingGenerator:
    def __init__(self, provider: Optional[AIProvider] = None, provider_name: str = "openrouter",
                 model: str = "anthropic/claude-sonnet-4"):
        self.provider = provider or get_provider(provider_name)
        self.model = model

    def generate_channel_set(
        self,
        project_id: str,
        book_summary: str,
        marketing_copy: str = "",
        channels: Optional[List[str]] = None,
    ) -> List[MarketingAsset]:
        if not book_summary.strip():
            raise MarketingGeneratorError("book_summary must not be empty")

        wanted = channels or sorted(MARKETING_CHANNELS)
        unknown = [c for c in wanted if c not in MARKETING_CHANNELS]
        if unknown:
            raise MarketingGeneratorError(
                f"Unknown marketing channel(s): {', '.join(unknown)}. "
                f"Valid channels: {', '.join(sorted(MARKETING_CHANNELS))}"
            )

        assets: List[MarketingAsset] = []
        for channel in wanted:
            system = (
                f"You are a book marketing copywriter. {_CHANNEL_PROMPTS[channel]} "
                f"Base everything on the book summary and marketing angle given below. "
                f"Never claim any award, review, or bestseller status that isn't given to you."
            )
            prompt = f"Book summary: {book_summary}\n"
            if marketing_copy:
                prompt += f"Core marketing angle: {marketing_copy}\n"

            now = time.time()
            try:
                result = self.provider.complete(self.model, system, prompt)
                assets.append(MarketingAsset(
                    id=str(uuid.uuid4()), project_id=project_id, channel=channel,
                    copy_text=result.text.strip(), status="draft", created_at=now,
                ))
            except ProviderError as e:
                assets.append(MarketingAsset(
                    id=str(uuid.uuid4()), project_id=project_id, channel=channel,
                    copy_text="", status="failed", created_at=now,
                ))
                assets[-1].copy_text = f"[generation failed: {e}]"
        return assets
