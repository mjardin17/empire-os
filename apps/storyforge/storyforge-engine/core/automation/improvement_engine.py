"""
StoryForge Empire Automation Studio -- Improvement Engine
------------------------------------------------------------
Weekly (or on-demand) analysis of a campaign's recorded analytics,
producing versioned recommendations across cover, title, subtitle,
keywords, pricing, category, and marketing angle. Every recommendation
references the *current* value and proposes a *new* one -- originals
are never overwritten (see `models.Recommendation.version` and
`AutomationStudio.save_recommendation`, which always inserts, never
updates).

Thresholds below are deliberately simple, transparent, rule-based
heuristics -- exactly like Phase 4's `research.py` aggregation and
`optimizer.py`'s rule-based fallback path. They are meant to be a
sensible, inspectable starting point, not a black box; tune the
constants or replace `_RULES` with a smarter model later without
touching the calling code.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List, Optional

from core.publishing.models import BookMetadata
from core.automation.events import EVENT_RECOMMENDATION_GENERATED, EventBus
from core.automation.models import Campaign, Recommendation

# Rule-based thresholds. All are conservative defaults; a real
# improvement engine should let the owner tune these per-niche.
_LOW_CTR = 0.02          # below this, the cover/thumbnail is probably not earning clicks
_LOW_CONVERSION = 0.01   # below this, the listing copy/price is probably the friction point
_POOR_KEYWORD_RANK = 50  # rank worse than this suggests the keyword isn't working


class ImprovementEngine:
    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus

    def analyze_campaign(
        self, campaign: Campaign, metadata: BookMetadata, analytics_summary: Dict[str, Any],
        existing_recommendation_count: int = 0,
    ) -> List[Recommendation]:
        recs: List[Recommendation] = []
        next_version = existing_recommendation_count + 1

        ctr = analytics_summary.get("computed_ctr")
        if ctr is not None and ctr < _LOW_CTR:
            recs.append(self._rec(
                campaign, "cover", current_value="current cover/thumbnail",
                suggested_value="Test a higher-contrast cover with a clearer focal character and larger title text",
                rationale=f"CTR is {ctr:.4f}, below the {_LOW_CTR} threshold -- the cover/thumbnail "
                          f"is the most likely lever for click-through.",
                confidence=0.6, version=next_version,
            ))

        conversion = analytics_summary.get("computed_conversion_rate")
        if conversion is not None and conversion < _LOW_CONVERSION:
            recs.append(self._rec(
                campaign, "pricing", current_value=str(metadata.price),
                suggested_value=self._suggest_price(metadata.price),
                rationale=f"Conversion rate is {conversion:.4f}, below the {_LOW_CONVERSION} threshold -- "
                          f"price or listing copy is likely the friction point.",
                confidence=0.5, version=next_version,
            ))
            recs.append(self._rec(
                campaign, "subtitle", current_value=metadata.subtitle,
                suggested_value=f"{metadata.subtitle} -- lead with the strongest reader benefit up front"
                                 if metadata.subtitle else "Add a benefit-driven subtitle",
                rationale="Low conversion with adequate traffic often means the listing copy isn't "
                          "closing the sale -- tightening the subtitle is a low-risk first test.",
                confidence=0.4, version=next_version,
            ))

        keyword_rankings = analytics_summary.get("keyword_rankings", {})
        poor_keywords = [kw for kw, stats in keyword_rankings.items() if stats.get("latest", 0) > _POOR_KEYWORD_RANK]
        if poor_keywords:
            recs.append(self._rec(
                campaign, "keywords", current_value=", ".join(poor_keywords),
                suggested_value="Replace with more specific long-tail variants closer to actual buyer search phrasing",
                rationale=f"{len(poor_keywords)} keyword(s) rank worse than {_POOR_KEYWORD_RANK}: {poor_keywords}.",
                confidence=0.55, version=next_version,
            ))

        if not metadata.categories:
            recs.append(self._rec(
                campaign, "category", current_value="(none set)",
                suggested_value="Assign at least one specific, low-competition category",
                rationale="No category is set on this listing -- an unassigned category caps discoverability.",
                confidence=0.7, version=next_version,
            ))

        platform_perf = analytics_summary.get("platform_performance", {})
        if len(platform_perf) >= 2:
            ranked = sorted(platform_perf.items(), key=lambda kv: kv[1].get("total", 0))
            weakest_platform, weakest_stats = ranked[0]
            strongest_platform, _ = ranked[-1]
            if weakest_stats.get("total", 0) == 0:
                recs.append(self._rec(
                    campaign, "marketing_angle", current_value=f"generic angle on {weakest_platform}",
                    suggested_value=f"Re-run the angle that is working on {strongest_platform}, "
                                     f"adapted to {weakest_platform}'s format",
                    rationale=f"{weakest_platform} shows zero recorded performance while "
                              f"{strongest_platform} has traction.",
                    confidence=0.45, version=next_version,
                ))

        if not metadata.title.strip():
            recs.append(self._rec(
                campaign, "title", current_value="(untitled)",
                suggested_value="Set a clear, keyword-forward working title before continuing the pipeline",
                rationale="No title is set at all -- this blocks every downstream format/platform export.",
                confidence=0.9, version=next_version,
            ))

        for rec in recs:
            if self.event_bus:
                self.event_bus.publish(
                    EVENT_RECOMMENDATION_GENERATED, project_id=campaign.project_id,
                    campaign_id=campaign.id, payload={"category": rec.category, "id": rec.id},
                )
        return recs

    @staticmethod
    def _rec(
        campaign: Campaign, category: str, current_value: str, suggested_value: str,
        rationale: str, confidence: float, version: int,
    ) -> Recommendation:
        return Recommendation(
            id=str(uuid.uuid4()), project_id=campaign.project_id, campaign_id=campaign.id,
            category=category, current_value=current_value or "", suggested_value=suggested_value,
            rationale=rationale, confidence=confidence, version=version, status="pending",
            created_at=time.time(),
        )

    @staticmethod
    def _suggest_price(current_price: Optional[float]) -> str:
        if current_price is None:
            return "Set an initial price informed by category comparables"
        # Simple A/B nudge in both directions -- a real pricing engine
        # would weigh elasticity; this is a transparent starting test.
        lower = round(current_price * 0.85, 2)
        higher = round(current_price * 1.10, 2)
        return f"Test {lower} (impulse-buy price point) or {higher} (perceived-value price point)"
