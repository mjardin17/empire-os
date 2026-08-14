"""
StoryForge Empire Automation Studio -- Analytics Engine
--------------------------------------------------------
Real, deterministic aggregation over whatever metrics have actually
been recorded (via a real AnalyticsProvider or manual entry) --
mirrors `core/publishing/research.py`'s "aggregate what you're given,
never fabricate signal" philosophy exactly.

Tracks: views, downloads, sales, conversion rate, CTR, keyword
rankings, platform performance, and marketing performance. Conversion
rate and CTR are computed from raw counts when both sides are present
(never invented if the inputs aren't there).
"""

from __future__ import annotations

import statistics
import time
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional

from core.automation.events import EVENT_ANALYTICS_UPDATED, EVENT_SALES_MILESTONE, EventBus
from core.automation.models import AnalyticsMetric

# Sales-count thresholds that trigger a "sales.milestone" event. Simple
# and transparent -- edit freely, or replace with a per-project schedule.
_SALES_MILESTONES = [1, 10, 50, 100, 500, 1000, 5000, 10000]


class AnalyticsEngine:
    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus

    def record_metric(
        self,
        project_id: str,
        metric_type: str,
        value: float,
        campaign_id: Optional[str] = None,
        platform: str = "",
        keyword: str = "",
        meta: Optional[Dict[str, Any]] = None,
    ) -> AnalyticsMetric:
        metric = AnalyticsMetric(
            id=str(uuid.uuid4()), project_id=project_id, campaign_id=campaign_id,
            metric_type=metric_type, platform=platform, value=value, keyword=keyword,
            meta=meta or {}, recorded_at=time.time(),
        )
        if self.event_bus:
            self.event_bus.publish(
                EVENT_ANALYTICS_UPDATED, project_id=project_id, campaign_id=campaign_id or "",
                payload={"metric_type": metric_type, "platform": platform, "value": value},
            )
            if metric_type == "sales" and value in _SALES_MILESTONES:
                self.event_bus.publish(
                    EVENT_SALES_MILESTONE, project_id=project_id, campaign_id=campaign_id or "",
                    payload={"milestone": value, "platform": platform},
                )
        return metric

    @staticmethod
    def summarize(metrics: List[AnalyticsMetric]) -> Dict[str, Any]:
        """Real aggregation, computed only from what's actually in `metrics`."""
        by_type: Dict[str, List[float]] = defaultdict(list)
        by_platform: Dict[str, List[float]] = defaultdict(list)
        keyword_ranks: Dict[str, List[float]] = defaultdict(list)

        for m in metrics:
            by_type[m.metric_type].append(m.value)
            if m.platform:
                by_platform[m.platform].append(m.value)
            if m.metric_type == "keyword_rank" and m.keyword:
                keyword_ranks[m.keyword].append(m.value)

        summary: Dict[str, Any] = {"metric_count": len(metrics)}
        for metric_type, values in by_type.items():
            summary[metric_type] = {
                "total": sum(values),
                "count": len(values),
                "mean": statistics.mean(values) if values else 0.0,
                "latest": values[-1] if values else None,
            }

        views_total = sum(by_type.get("views", []))
        downloads_total = sum(by_type.get("downloads", []))
        sales_total = sum(by_type.get("sales", []))

        if views_total > 0:
            if downloads_total > 0:
                summary["computed_ctr"] = round(downloads_total / views_total, 4)
            if sales_total > 0:
                summary["computed_conversion_rate"] = round(sales_total / views_total, 4)

        if keyword_ranks:
            summary["keyword_rankings"] = {
                kw: {"best": min(ranks), "latest": ranks[-1], "samples": len(ranks)}
                for kw, ranks in keyword_ranks.items()
            }

        summary["platform_performance"] = {
            platform: {"total": sum(values), "count": len(values)}
            for platform, values in by_platform.items()
        }

        return summary
