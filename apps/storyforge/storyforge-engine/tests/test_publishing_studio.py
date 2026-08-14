"""
Smoke tests for the Publishing Intelligence Studio.

Everything here runs fully offline:
  - research.analyze_listings() is pure deterministic aggregation
  - DesignBriefGenerator defaults to rule-based generation (no AI)
  - BookOptimizer / MarketingGenerator are exercised with a FakeAIProvider
    test double (same AIProvider interface real adapters implement) so
    no network call or API key is ever required
  - PlatformExporter and PublishingStudio only touch local disk/SQLite

Run with `pytest tests/` from `storyforge-engine/`.
"""

from __future__ import annotations

from typing import Optional

import pytest

from core.ai.provider import AIProvider, CompletionResult, ProviderError
from core.publishing.design_brief import DesignBriefGenerator
from core.publishing.marketing import MarketingGenerator, MarketingGeneratorError
from core.publishing.models import BOOK_CATEGORIES, MARKETING_CHANNELS, SELLING_PLATFORMS, TrendListing
from core.publishing.optimizer import BookOptimizer, BookOptimizerError, suggest_categories, suggest_keywords
from core.publishing.platform_export import PlatformExportError, PlatformExporter
from core.publishing.research import ManualDataSource, analyze_listings, get_data_source
from core.publishing.studio import PublishingStudio, PublishingStudioError


class FakeAIProvider(AIProvider):
    """Deterministic stand-in AIProvider for tests -- returns a fixed,
    well-formed response instead of calling any network. Implements the
    exact same AIProvider contract every real adapter does."""

    name = "fake"

    def __init__(self, text: str = ""):
        self._text = text

    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        return CompletionResult(text=self._text, provider=self.name, model=model, raw={})


class BoomAIProvider(AIProvider):
    name = "boom"

    def complete(self, model: str, system: str, prompt: str, timeout: int = 60) -> CompletionResult:
        raise ProviderError("simulated upstream failure")


_LISTING_COPY_RESPONSE = """TITLE: The Lantern in the Willow
SUBTITLE: A Story of Quiet Courage
DESCRIPTION: A gentle tale about a fox who is afraid of the dark.
Through one brave night, she learns that courage is a small, steady light.
APLUS_1_HEADING: A Story About Bravery
APLUS_1_BODY: Perfect for bedtime reading with young children.
APLUS_2_HEADING: Beautifully Illustrated
APLUS_2_BODY: Full-color illustrations on every spread.
MARKETING_COPY: A cozy bedtime story that turns fear of the dark into a gentle lesson in courage."""


# ---------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------

def _sample_listings():
    return [
        TrendListing(
            title="Listing A", category="childrens", price=9.99, page_count=32,
            keywords=["bedtime", "courage", "fox"], cover_colors=["navy", "gold"],
            cover_style_notes="single character on textured background",
            typography_notes="large rounded serif", interior_layout_notes="one spread per page",
            illustration_style="warm painterly", review_snippets=["my kid loves this brave story"],
            requested_features=["bedtime"], source="amazon_best_sellers",
        ),
        TrendListing(
            title="Listing B", category="childrens", price=8.99, page_count=32,
            keywords=["bedtime", "friendship"], cover_colors=["navy", "cream"],
            cover_style_notes="single character on textured background",
            typography_notes="large rounded serif", interior_layout_notes="one spread per page",
            illustration_style="warm painterly", review_snippets=["scary and sad, not what I wanted"],
            requested_features=["bedtime", "audio narration"], source="kindle_rankings",
        ),
        TrendListing(
            title="Listing C", category="childrens", price=12.99, page_count=40,
            keywords=["courage", "adventure"], cover_colors=["gold"],
            requested_features=["audio narration"], source="amazon_new_releases",
        ),
    ]


@pytest.fixture()
def studio(tmp_path) -> PublishingStudio:
    db_path = str(tmp_path / "publishing.db")
    output_root = str(tmp_path / "exports")
    s = PublishingStudio(db_path=db_path, output_root=output_root)
    yield s
    s.close()


# -- taxonomy sanity -------------------------------------------------------

def test_taxonomies_are_nonempty():
    assert "childrens" in BOOK_CATEGORIES
    assert "kdp" in SELLING_PLATFORMS
    assert "tiktok_video_script" in MARKETING_CHANNELS


# -- market research: real deterministic aggregation ----------------------

def test_analyze_listings_is_deterministic_and_real():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    assert report.listing_count == 3
    assert report.top_keywords[0]["value"] in {"bedtime", "courage"}
    assert report.top_keywords[0]["count"] == 2
    assert report.price_stats["min"] == 8.99
    assert report.price_stats["max"] == 12.99
    assert report.common_page_counts[0]["value"] == 32
    assert report.common_page_counts[0]["count"] == 2
    assert "amazon_best_sellers" in report.sources
    # review sentiment: 1 clearly positive snippet, 1 clearly negative -> not a placeholder zero
    assert report.review_sentiment["snippet_count"] == 2


def test_analyze_listings_handles_empty_input():
    report = analyze_listings("proj-1", "fantasy", [])
    assert report.listing_count == 0
    assert report.top_keywords == []


def test_manual_data_source_is_available_offline():
    source = get_data_source("manual")
    assert isinstance(source, ManualDataSource)
    listings = _sample_listings()
    assert source.fetch("childrens", listings=listings) == listings


# -- design brief: rule-based by default, never copies a single source ----

def test_design_brief_rule_based_generation():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    brief = DesignBriefGenerator().generate(report, working_title="The Lantern in the Willow")
    assert brief.category == "childrens"
    assert brief.color_palette  # derived from aggregate top_colors, not a single listing
    assert "aggregate" in brief.differentiation_notes.lower()
    assert brief.recommended_page_count == 32


def test_design_brief_falls_back_when_ai_provider_errors():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    brief = DesignBriefGenerator(ai_provider=BoomAIProvider()).generate(report)
    # Must not raise -- falls back to rule-based cover concept.
    assert brief.cover_concept
    assert "unlimited" not in brief.cover_concept  # sanity: no garbage leaked through


def test_design_brief_uses_ai_provider_when_available():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    brief = DesignBriefGenerator(ai_provider=FakeAIProvider("An original watercolor fox under a lantern.")).generate(report)
    assert brief.cover_concept == "An original watercolor fox under a lantern."


# -- book optimizer ---------------------------------------------------------

def test_suggest_keywords_and_categories_are_deterministic():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    keywords = suggest_keywords(report, extra_terms=["night light"])
    assert "night light" in keywords
    assert keywords[0] in {"bedtime", "courage"}

    categories = suggest_categories(report)
    assert categories[0] == "childrens"


def test_book_optimizer_generates_metadata_from_fake_provider():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    optimizer = BookOptimizer(provider=FakeAIProvider(_LISTING_COPY_RESPONSE))
    metadata = optimizer.generate_listing_copy(
        project_id="proj-1", manuscript_summary="A fox afraid of the dark learns courage.", report=report,
    )
    assert metadata.title == "The Lantern in the Willow"
    assert metadata.subtitle == "A Story of Quiet Courage"
    assert "brave night" in metadata.description
    assert len(metadata.a_plus_content) == 2
    assert metadata.a_plus_content[0]["heading"] == "A Story About Bravery"
    assert metadata.marketing_copy.startswith("A cozy bedtime story")
    assert metadata.keywords  # populated from research, not empty


def test_book_optimizer_rejects_empty_summary():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    optimizer = BookOptimizer(provider=FakeAIProvider(_LISTING_COPY_RESPONSE))
    with pytest.raises(BookOptimizerError):
        optimizer.generate_listing_copy(project_id="proj-1", manuscript_summary="   ", report=report)


def test_book_optimizer_propagates_provider_error():
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    optimizer = BookOptimizer(provider=BoomAIProvider())
    with pytest.raises(ProviderError):
        optimizer.generate_listing_copy(project_id="proj-1", manuscript_summary="A story.", report=report)


# -- marketing generator -----------------------------------------------------

def test_marketing_generator_creates_one_asset_per_channel():
    generator = MarketingGenerator(provider=FakeAIProvider("Some generated copy."))
    assets = generator.generate_channel_set(
        project_id="proj-1", book_summary="A fox learns courage.",
        channels=["tiktok_video_script", "email_campaign"],
    )
    assert len(assets) == 2
    assert {a.channel for a in assets} == {"tiktok_video_script", "email_campaign"}
    assert all(a.status == "draft" for a in assets)


def test_marketing_generator_rejects_unknown_channel():
    generator = MarketingGenerator(provider=FakeAIProvider("x"))
    with pytest.raises(MarketingGeneratorError):
        generator.generate_channel_set(project_id="proj-1", book_summary="x", channels=["not-a-real-channel"])


def test_marketing_generator_records_per_channel_failure_without_raising():
    generator = MarketingGenerator(provider=BoomAIProvider())
    assets = generator.generate_channel_set(
        project_id="proj-1", book_summary="A fox learns courage.", channels=["pinterest_pin"],
    )
    assert assets[0].status == "failed"
    assert "simulated upstream failure" in assets[0].copy_text


# -- platform export ----------------------------------------------------------

def test_platform_exporter_builds_package_and_flags_constraints(tmp_path):
    from core.publishing.models import BookMetadata

    metadata = BookMetadata(
        id="meta-1", project_id="proj-1", title="The Lantern in the Willow",
        subtitle="A Story of Quiet Courage", description="A gentle tale.",
        categories=["childrens"], keywords=[f"kw{i}" for i in range(10)],  # exceeds KDP's 7
        price=9.99,
    )
    exporter = PlatformExporter(output_root=str(tmp_path / "exports"))
    package = exporter.export(metadata, "kdp")

    assert package.platform == "kdp"
    assert len(package.listing_fields["keywords"]) == 7  # trimmed to KDP's limit
    assert package.constraint_warnings  # 10 keywords supplied should trigger a warning
    assert "listing_json" in package.asset_paths
    from pathlib import Path
    assert Path(package.asset_paths["listing_json"]).exists()


def test_platform_exporter_rejects_unknown_platform():
    from core.publishing.models import BookMetadata
    metadata = BookMetadata(id="meta-1", project_id="proj-1", title="X")
    exporter = PlatformExporter()
    with pytest.raises(PlatformExportError):
        exporter.export(metadata, "not-a-real-platform")


def test_platform_exporter_copies_source_assets(tmp_path):
    from core.publishing.models import BookMetadata

    cover_src = tmp_path / "cover.png"
    cover_src.write_bytes(b"fake-png-bytes")
    metadata = BookMetadata(id="meta-1", project_id="proj-1", title="X", description="Y")
    exporter = PlatformExporter(output_root=str(tmp_path / "exports"))
    package = exporter.export(metadata, "etsy", source_assets={"cover": str(cover_src)})

    assert "cover" in package.asset_paths
    from pathlib import Path
    assert Path(package.asset_paths["cover"]).read_bytes() == b"fake-png-bytes"


# -- full studio workflow: research -> brief -> metadata -> export -> approve --

def test_full_publishing_workflow_end_to_end(studio, tmp_path):
    report = analyze_listings("proj-1", "childrens", _sample_listings())
    studio.save_research_report(report)

    brief = DesignBriefGenerator().generate(report, working_title="The Lantern in the Willow")
    studio.save_design_brief(brief)

    optimizer = BookOptimizer(provider=FakeAIProvider(_LISTING_COPY_RESPONSE))
    metadata = optimizer.generate_listing_copy(
        project_id="proj-1", manuscript_summary="A fox afraid of the dark learns courage.",
        report=report, brief=brief,
    )
    studio.save_book_metadata(metadata)

    cover_src = tmp_path / "cover.png"
    cover_src.write_bytes(b"fake-cover-bytes")

    approval = studio.approve_book(
        project_id="proj-1",
        book_metadata_id=metadata.id,
        platforms=["kdp", "etsy"],
        source_assets={"cover": str(cover_src)},
    )

    assert approval.approved is True
    assert len(approval.platform_packages) == 2
    assert len(approval.checklist) > 0
    # A cover asset was supplied, so the "cover asset attached" item must be checked off.
    cover_items = [c for c in approval.checklist if "cover asset attached" in c.label]
    assert all(c.done for c in cover_items)

    packages = studio.list_platform_packages("proj-1", metadata.id)
    assert {p.platform for p in packages} == {"kdp", "etsy"}

    fetched_approval = studio.get_approval(approval.id)
    assert fetched_approval.id == approval.id


def test_approve_book_rejects_unknown_metadata(studio):
    with pytest.raises(PublishingStudioError):
        studio.approve_book(project_id="proj-1", book_metadata_id="does-not-exist", platforms=["kdp"])


def test_studio_persists_and_lists_marketing_assets(studio):
    generator = MarketingGenerator(provider=FakeAIProvider("Some generated copy."))
    assets = generator.generate_channel_set(
        project_id="proj-1", book_summary="A fox learns courage.", channels=["instagram_post"],
    )
    for asset in assets:
        studio.save_marketing_asset(asset)

    listed = studio.list_marketing_assets("proj-1")
    assert len(listed) == 1
    assert listed[0].channel == "instagram_post"
