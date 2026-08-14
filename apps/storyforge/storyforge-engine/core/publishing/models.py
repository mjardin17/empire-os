"""
StoryForge Publishing Intelligence Studio -- Models
------------------------------------------------------
Plain dataclasses for market research, design briefs, book metadata,
platform export packages, marketing assets, and the approval/checklist
workflow. Kept separate from persistence (studio.py), analysis
(research.py), generation (optimizer.py, design_brief.py, marketing.py)
and export (platform_export.py) so any layer can be swapped
independently -- same pattern as core/world/models.py and
core/image/models.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# Book categories this module knows how to analyze/optimize for.
# Callers may pass any value; unknown values are accepted but simply
# won't have curated platform-constraint presets in platform_export.py.
BOOK_CATEGORIES = {
    "childrens", "fantasy", "history", "educational", "coloring_book",
    "low_content", "activity_book", "general_fiction", "nonfiction",
}

# Selling platforms with a known export packaging preset.
SELLING_PLATFORMS = {"kdp", "etsy", "shopify", "gumroad", "payhip", "woocommerce", "d2d"}

# Marketing asset channels this module knows how to generate copy for.
MARKETING_CHANNELS = {
    "tiktok_video_script", "youtube_shorts_script", "instagram_post",
    "pinterest_pin", "facebook_ad", "email_campaign",
}


@dataclass
class TrendListing:
    """One raw data point fed into market research -- e.g. a single
    Amazon Best Sellers / New Releases / Kindle listing. This is the
    input shape; StoryForge does not scrape marketplaces itself (see
    research.py docstring for why and how to wire a real source in).
    """

    title: str
    category: str = ""
    price: Optional[float] = None
    page_count: Optional[int] = None
    rank: Optional[int] = None
    keywords: List[str] = field(default_factory=list)
    cover_colors: List[str] = field(default_factory=list)
    cover_style_notes: str = ""
    typography_notes: str = ""
    interior_layout_notes: str = ""
    illustration_style: str = ""
    review_snippets: List[str] = field(default_factory=list)
    requested_features: List[str] = field(default_factory=list)
    source: str = ""  # e.g. "amazon_best_sellers", "kindle_rankings", "manual"


@dataclass
class MarketResearchReport:
    id: str
    project_id: str
    category: str
    listing_count: int
    top_keywords: List[Dict[str, Any]] = field(default_factory=list)      # [{"keyword": .., "count": ..}]
    top_colors: List[Dict[str, Any]] = field(default_factory=list)
    common_page_counts: List[Dict[str, Any]] = field(default_factory=list)
    price_stats: Dict[str, float] = field(default_factory=dict)           # min/max/mean/median
    cover_style_themes: List[str] = field(default_factory=list)
    typography_themes: List[str] = field(default_factory=list)
    interior_layout_themes: List[str] = field(default_factory=list)
    illustration_style_themes: List[str] = field(default_factory=list)
    review_sentiment: Dict[str, Any] = field(default_factory=dict)        # {"positivity": .., "themes": [...]}
    frequently_requested_features: List[Dict[str, Any]] = field(default_factory=list)
    sources: List[str] = field(default_factory=list)
    created_at: float = 0.0


@dataclass
class DesignBrief:
    """An ORIGINAL creative direction inspired by aggregate trends --
    never a copy of any specific artwork, cover, or text. Generated
    from a MarketResearchReport's aggregate signals only."""

    id: str
    project_id: str
    research_report_id: str
    category: str
    cover_concept: str = ""
    color_palette: List[str] = field(default_factory=list)
    typography_direction: str = ""
    interior_layout_direction: str = ""
    illustration_style_direction: str = ""
    recommended_page_count: Optional[int] = None
    recommended_price: Optional[float] = None
    differentiation_notes: str = ""     # how this brief avoids sameness/copying
    created_at: float = 0.0


@dataclass
class BookMetadata:
    id: str
    project_id: str
    title: str = ""
    subtitle: str = ""
    description: str = ""
    author: str = ""
    categories: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    a_plus_content: List[Dict[str, str]] = field(default_factory=list)  # [{"heading":.., "body":..}]
    marketing_copy: str = ""
    price: Optional[float] = None
    page_count: Optional[int] = None
    language: str = "en"
    created_at: float = 0.0
    updated_at: float = 0.0


@dataclass
class PlatformPackage:
    id: str
    project_id: str
    book_metadata_id: str
    platform: str
    status: str = "draft"          # "draft" | "ready" | "submitted" | "published"
    listing_fields: Dict[str, Any] = field(default_factory=dict)   # platform-shaped metadata
    asset_paths: Dict[str, str] = field(default_factory=dict)      # e.g. {"epub": "...", "cover": "..."}
    constraint_warnings: List[str] = field(default_factory=list)   # e.g. "keyword count exceeds KDP limit"
    created_at: float = 0.0
    updated_at: float = 0.0


@dataclass
class MarketingAsset:
    id: str
    project_id: str
    channel: str
    copy_text: str = ""
    image_asset_id: Optional[str] = None    # links to core.image.ImageAsset.id, if generated
    status: str = "draft"
    created_at: float = 0.0


@dataclass
class PublishingChecklistItem:
    label: str
    done: bool = False
    detail: str = ""


@dataclass
class ApprovalRecord:
    id: str
    project_id: str
    book_metadata_id: str
    approved: bool
    platform_packages: List[str] = field(default_factory=list)   # PlatformPackage ids prepared
    marketing_assets: List[str] = field(default_factory=list)    # MarketingAsset ids prepared
    checklist: List[PublishingChecklistItem] = field(default_factory=list)
    created_at: float = 0.0
