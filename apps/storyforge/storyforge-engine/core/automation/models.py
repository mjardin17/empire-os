"""
StoryForge Empire Automation Studio -- Models
-------------------------------------------------
Phase 5. Purely additive: nothing here is imported by, or changes the
behavior of, any Phase 1-4 module. Same pattern as
`core/publishing/models.py` and `core/world/models.py` -- plain
dataclasses, persistence lives in `studio.py`, logic lives in the other
`core/automation/*.py` modules so every layer stays independently
swappable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# Format packages Empire Automation Studio knows how to produce for a
# "Ready" book. Unknown format types are rejected by FormatPackageGenerator
# with a clear error -- same convention as SELLING_PLATFORMS in Phase 4.
FORMAT_TYPES = {
    "kdp", "epub", "pdf", "hardcover", "paperback", "large_print",
    "coloring_book", "activity_book", "audiobook", "marketing_package",
}

# Listing platforms this studio can spin up a Campaign for. Reuses the
# exact set Phase 4's PlatformExporter already knows how to package for
# (kdp/etsy/shopify/gumroad/payhip/woocommerce) -- Phase 5 orchestrates
# Phase 4, it does not reimplement it.
CAMPAIGN_PLATFORMS = {"kdp", "etsy", "shopify", "gumroad", "payhip", "woocommerce", "d2d"}

# Marketing surfaces Phase 5 knows how to generate content/schedule for.
# "instagram_post" / "pinterest_pin" / "tiktok_video_script" /
# "youtube_shorts_script" / "email_campaign" / "facebook_ad" map straight
# onto Phase 4's MARKETING_CHANNELS; "youtube_description", "blog_article",
# "seo_metadata", and "facebook_post" are new surfaces Phase 5 adds.
MARKETING_SURFACES = {
    "pinterest_pin", "instagram_post", "facebook_post", "facebook_ad",
    "tiktok_video_script", "youtube_shorts_script", "youtube_description",
    "email_campaign", "blog_article", "seo_metadata",
}

# The exact event vocabulary requested for Empire Assistant integration,
# plus a few Phase-5-internal events the automation engine itself needs
# to describe its own state machine. See events.py.
RECOMMENDATION_CATEGORIES = {
    "cover", "title", "subtitle", "keywords", "pricing", "category", "marketing_angle",
}

JOB_STATUSES = {"pending", "running", "succeeded", "failed", "retrying", "cancelled"}
WORKFLOW_STEP_TYPES = {
    "story", "images", "voice", "video", "publish", "marketing",
    "kdp", "etsy", "shopify", "gumroad", "payhip", "woocommerce", "ads", "pinterest",
}


@dataclass
class ProjectReadiness:
    """Tracks whether a StoryForge project has been marked 'Ready' for
    the automation pipeline. Deliberately stored here, not on any
    Phase 1-4 model -- Phase 5 watches projects, it does not add fields
    to them."""

    project_id: str
    book_metadata_id: str
    status: str = "draft"          # "draft" | "ready" | "processing" | "done"
    marked_ready_at: Optional[float] = None
    updated_at: float = 0.0


@dataclass
class FormatPackage:
    id: str
    project_id: str
    book_metadata_id: str
    format_type: str
    status: str = "draft"            # "draft" | "spec_ready" | "generated" | "failed"
    output_path: str = ""
    spec: Dict[str, Any] = field(default_factory=dict)
    asset_paths: Dict[str, str] = field(default_factory=dict)
    notes: str = ""
    version: int = 1
    created_at: float = 0.0


@dataclass
class Campaign:
    id: str
    project_id: str
    book_metadata_id: str
    name: str
    status: str = "draft"            # "draft" | "active" | "completed" | "paused"
    platforms: List[str] = field(default_factory=list)
    scheduled_post_ids: List[str] = field(default_factory=list)
    artwork: List[str] = field(default_factory=list)          # image asset ids / paths
    videos: List[str] = field(default_factory=list)
    thumbnails: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    revisions: List[Dict[str, Any]] = field(default_factory=list)
    format_package_ids: List[str] = field(default_factory=list)
    marketing_asset_ids: List[str] = field(default_factory=list)
    created_at: float = 0.0
    updated_at: float = 0.0


@dataclass
class AnalyticsMetric:
    id: str
    project_id: str
    campaign_id: Optional[str]
    metric_type: str        # views|downloads|sales|conversion_rate|ctr|keyword_rank|platform_performance|marketing_performance
    platform: str = ""
    value: float = 0.0
    keyword: str = ""        # populated for keyword_rank metrics
    meta: Dict[str, Any] = field(default_factory=dict)
    recorded_at: float = 0.0


@dataclass
class Recommendation:
    id: str
    project_id: str
    campaign_id: str
    category: str            # one of RECOMMENDATION_CATEGORIES
    current_value: str
    suggested_value: str
    rationale: str
    confidence: float = 0.0
    version: int = 1
    status: str = "pending"   # "pending" | "accepted" | "rejected"
    created_at: float = 0.0


@dataclass
class WorkflowStepDef:
    id: str
    type: str                 # one of WORKFLOW_STEP_TYPES
    name: str = ""
    config: Dict[str, Any] = field(default_factory=dict)
    on_success: Optional[str] = None   # id of next step, or None to end
    on_failure: Optional[str] = None   # id of step to jump to on failure, or None to abort


@dataclass
class WorkflowDefinition:
    id: str
    name: str
    start_step_id: str
    steps: List[WorkflowStepDef] = field(default_factory=list)
    project_id: Optional[str] = None   # None => reusable template, not project-bound
    created_at: float = 0.0
    updated_at: float = 0.0


@dataclass
class WorkflowStepRun:
    step_id: str
    step_type: str
    status: str               # "succeeded" | "failed" | "skipped"
    output: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    started_at: float = 0.0
    finished_at: float = 0.0


@dataclass
class WorkflowRun:
    id: str
    workflow_id: str
    project_id: str
    status: str = "running"    # "running" | "succeeded" | "failed"
    context: Dict[str, Any] = field(default_factory=dict)
    step_history: List[WorkflowStepRun] = field(default_factory=list)
    started_at: float = 0.0
    finished_at: Optional[float] = None


@dataclass
class ScheduledJob:
    id: str
    project_id: str
    job_type: str              # "publish_platform" | "post_marketing" | "run_workflow_step" | ...
    payload: Dict[str, Any] = field(default_factory=dict)
    campaign_id: Optional[str] = None
    platform: str = ""
    run_at: float = 0.0
    status: str = "pending"    # one of JOB_STATUSES
    attempts: int = 0
    max_attempts: int = 3
    last_error: str = ""
    result: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    updated_at: float = 0.0


@dataclass
class EventRecord:
    id: str
    event_type: str
    project_id: str = ""
    campaign_id: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
