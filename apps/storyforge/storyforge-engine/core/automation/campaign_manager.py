"""
StoryForge Empire Automation Studio -- Campaign Manager
-------------------------------------------------------
Every published (or publishing-in-progress) project gets its own
Campaign: one place tracking publishing status, target platforms,
scheduled posts, artwork/video/thumbnail references, keywords,
analytics, and revision history.

This module is pure orchestration -- it composes `providers.py`
(publishing/marketing), `scheduler.py` (post scheduling), and
`events.py` (lifecycle notifications). Persistence is the caller's
job via `AutomationStudio`, same separation as Phase 4's
`PublishingStudio` vs. `research.py` / `marketing.py`.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from core.publishing.models import BookMetadata
from core.automation.events import EVENT_CAMPAIGN_COMPLETED, EVENT_CAMPAIGN_STARTED, EventBus
from core.automation.models import Campaign, CAMPAIGN_PLATFORMS
from core.automation.providers import MarketingProvider, PublishingProvider


class CampaignManagerError(ValueError):
    pass


class CampaignManager:
    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus

    def create_campaign(
        self, project_id: str, book_metadata_id: str, name: str, platforms: List[str],
        keywords: Optional[List[str]] = None,
    ) -> Campaign:
        unknown = [p for p in platforms if p not in CAMPAIGN_PLATFORMS]
        if unknown:
            raise CampaignManagerError(
                f"Unknown campaign platform(s) {unknown}. Supported: {sorted(CAMPAIGN_PLATFORMS)}"
            )
        now = time.time()
        return Campaign(
            id=str(uuid.uuid4()), project_id=project_id, book_metadata_id=book_metadata_id,
            name=name, status="draft", platforms=list(platforms), keywords=keywords or [],
            created_at=now, updated_at=now,
        )

    def start_campaign(
        self,
        campaign: Campaign,
        metadata: BookMetadata,
        publishing_provider: PublishingProvider,
        marketing_provider: Optional[MarketingProvider] = None,
        book_summary: str = "",
    ) -> Dict[str, Any]:
        """Publishes a draft listing package for every campaign platform
        and (optionally) generates a marketing asset set. Returns the
        raw results for the caller (main.py / studio) to persist --
        this method never touches the database directly."""
        platform_results = {}
        for platform in campaign.platforms:
            package = publishing_provider.publish(metadata, platform)
            platform_results[platform] = package

        marketing_assets: List[Dict[str, Any]] = []
        if marketing_provider is not None:
            marketing_assets = marketing_provider.generate(
                project_id=campaign.project_id,
                book_summary=book_summary or metadata.description,
                marketing_copy=metadata.marketing_copy,
                channels=[
                    "pinterest_pin", "instagram_post", "facebook_ad",
                    "tiktok_video_script", "youtube_shorts_script", "email_campaign",
                ],
            )

        campaign.status = "active"
        campaign.updated_at = time.time()

        if self.event_bus:
            self.event_bus.publish(
                EVENT_CAMPAIGN_STARTED, project_id=campaign.project_id, campaign_id=campaign.id,
                payload={"platforms": campaign.platforms, "book_metadata_id": metadata.id},
            )

        return {"platform_packages": platform_results, "marketing_assets": marketing_assets}

    def complete_campaign(self, campaign: Campaign) -> Campaign:
        campaign.status = "completed"
        campaign.updated_at = time.time()
        if self.event_bus:
            self.event_bus.publish(
                EVENT_CAMPAIGN_COMPLETED, project_id=campaign.project_id, campaign_id=campaign.id,
            )
        return campaign

    def add_revision(self, campaign: Campaign, label: str, detail: str = "") -> Campaign:
        """Appends a revision entry -- never rewrites history. Pairs with
        the Improvement Engine: every accepted recommendation should show
        up here so the campaign has a full, honest audit trail."""
        campaign.revisions.append({"label": label, "detail": detail, "at": time.time()})
        campaign.updated_at = time.time()
        return campaign

    @staticmethod
    def track_asset(campaign: Campaign, kind: str, value: str) -> Campaign:
        """kind is one of: artwork | videos | thumbnails | format_package_ids |
        marketing_asset_ids | scheduled_post_ids"""
        bucket = getattr(campaign, kind, None)
        if bucket is None or not isinstance(bucket, list):
            raise CampaignManagerError(f"Campaign has no trackable list field '{kind}'")
        if value not in bucket:
            bucket.append(value)
        campaign.updated_at = time.time()
        return campaign
