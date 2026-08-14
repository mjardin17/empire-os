"""
StoryForge Publishing Intelligence Studio -- Design Brief Generator
---------------------------------------------------------------------
Turns a MarketResearchReport's AGGREGATE signals into an ORIGINAL
creative brief. This never quotes, copies, or closely paraphrases any
single listing's cover, title, or artwork -- it works only from the
statistical themes already aggregated across many listings in
research.py (top colors, common style/typography/layout notes, etc.),
so there is nothing single-source to copy in the first place.

Works fully offline by default (rule-based, deterministic, like
core/science/engine.py). If an AIProvider is supplied, it is used only
to write a richer prose cover-concept paragraph from the same aggregate
signals -- and if that call fails for any reason, generation still
succeeds using the rule-based text instead of failing the whole brief.
"""

from __future__ import annotations

import time
import uuid
from typing import Optional

from core.ai.provider import AIProvider, ProviderError
from core.publishing.models import DesignBrief, MarketResearchReport


_ANTI_COPY_NOTICE = (
    "This brief is synthesized from aggregate trend statistics across "
    "multiple listings (colors/styles/layouts that recur across many "
    "books), not from any single book's artwork or text. Do not reference "
    "or imitate any specific existing cover, illustration, or title -- "
    "use these as directional signals only."
)


class DesignBriefGenerator:
    def __init__(self, ai_provider: Optional[AIProvider] = None):
        self.ai_provider = ai_provider

    def generate(self, report: MarketResearchReport, working_title: str = "") -> DesignBrief:
        palette = [c["value"] for c in report.top_colors[:5]]
        cover_style = ", ".join(report.cover_style_themes[:3]) or "clean, high-contrast, single focal character"
        typography = ", ".join(report.typography_themes[:2]) or "large, rounded, highly legible display type"
        layout = ", ".join(report.interior_layout_themes[:2]) or "generous margins, one illustration per spread"
        illustration = ", ".join(report.illustration_style_themes[:2]) or "warm, painterly digital illustration"

        recommended_page_count = self._most_common_value(report.common_page_counts)
        recommended_price = report.price_stats.get("median")

        cover_concept = self._rule_based_cover_concept(working_title, cover_style, palette, typography)
        if self.ai_provider is not None:
            try:
                cover_concept = self._ai_cover_concept(report, working_title, cover_style, palette, typography)
            except ProviderError:
                pass  # fall back to the rule-based concept below; brief generation must never hard-fail

        differentiation_notes = (
            f"{_ANTI_COPY_NOTICE} Aggregated from {report.listing_count} listings "
            f"across source(s): {', '.join(report.sources) or 'manual research'}."
        )

        return DesignBrief(
            id=str(uuid.uuid4()),
            project_id=report.project_id,
            research_report_id=report.id,
            category=report.category,
            cover_concept=cover_concept,
            color_palette=palette,
            typography_direction=typography,
            interior_layout_direction=layout,
            illustration_style_direction=illustration,
            recommended_page_count=recommended_page_count,
            recommended_price=recommended_price,
            differentiation_notes=differentiation_notes,
            created_at=time.time(),
        )

    @staticmethod
    def _most_common_value(common_page_counts) -> Optional[int]:
        if not common_page_counts:
            return None
        return int(common_page_counts[0]["value"])

    @staticmethod
    def _rule_based_cover_concept(working_title: str, cover_style: str, palette, typography: str) -> str:
        title_phrase = f"for \"{working_title}\"" if working_title else "for this title"
        palette_phrase = f"a palette drawn from {', '.join(palette)}" if palette else "a bold, market-tested palette"
        return (
            f"An original cover concept {title_phrase}: {cover_style}, using {palette_phrase}, "
            f"with {typography}. Composition should be a single strong focal image with clear "
            f"silhouette at thumbnail size, since most successful listings in this category read "
            f"clearly even as a small search-result thumbnail."
        )

    def _ai_cover_concept(self, report: MarketResearchReport, working_title: str,
                           cover_style: str, palette, typography: str) -> str:
        system = (
            "You are a book cover art director. Using ONLY the aggregate trend signals given "
            "(never any specific existing book), write one original, concrete cover concept "
            "paragraph (3-5 sentences) that a human illustrator could execute from scratch. "
            "Never name or describe any real, identifiable existing book, author, or artwork."
        )
        prompt = (
            f"Category: {report.category}\n"
            f"Working title: {working_title or '(untitled)'}\n"
            f"Recurring cover style signals: {cover_style}\n"
            f"Recurring color signals: {', '.join(palette)}\n"
            f"Recurring typography signals: {typography}\n"
            f"Frequently requested features across listings: "
            f"{', '.join(f['value'] for f in report.frequently_requested_features[:5])}\n"
        )
        result = self.ai_provider.complete(model="anthropic/claude-sonnet-4", system=system, prompt=prompt)
        return result.text.strip()
