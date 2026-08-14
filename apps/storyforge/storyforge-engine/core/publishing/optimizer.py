"""
StoryForge Publishing Intelligence Studio -- Book Optimizer
----------------------------------------------------------------
Generates the metadata that actually drives discoverability and sales:
title, subtitle, description, categories, keywords, A+ Content, and
marketing copy.

Two kinds of generation, split deliberately:

1. Deterministic (no AI, no network) -- `suggest_keywords()` and
   `suggest_categories()` derive directly from the MarketResearchReport
   your own aggregate data already computed in research.py. These never
   fail and never need an API key.

2. AI-assisted (`generate_listing_copy()`) -- uses the same swappable
   `AIProvider` interface as the Creative Council
   (core/ai/provider.py / core/council/specialists.py). Nothing new is
   invented here: title/subtitle/description/A+ Content/marketing copy
   are exactly the kind of open-ended creative writing the Council
   already calls providers for, so this reuses that seam rather than
   building a second one.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import asdict
from typing import Dict, List, Optional

from core.ai.provider import AIProvider, ProviderError, get_provider
from core.publishing.models import BookMetadata, DesignBrief, MarketResearchReport

# KDP allows up to 7 backend keywords and 2 browse categories at listing
# time; Etsy/Shopify/etc. have their own limits handled in
# platform_export.py. This module stays platform-agnostic and simply
# ranks candidates -- trimming to a specific platform's limit is the
# exporter's job, not the optimizer's.
_MAX_SUGGESTED_KEYWORDS = 20
_MAX_SUGGESTED_CATEGORIES = 5


class BookOptimizerError(ValueError):
    pass


def suggest_keywords(report: MarketResearchReport, extra_terms: Optional[List[str]] = None) -> List[str]:
    """Deterministic: ranks the keywords already aggregated in the
    market research report, plus any terms the author wants included."""
    ranked = [k["value"] for k in report.top_keywords]
    for term in (extra_terms or []):
        t = term.strip().lower()
        if t and t not in ranked:
            ranked.append(t)
    return ranked[:_MAX_SUGGESTED_KEYWORDS]


def suggest_categories(report: MarketResearchReport, brief: Optional[DesignBrief] = None) -> List[str]:
    """Deterministic: the category the research was run for, plus any
    frequently-requested-feature terms that read like sub-genre/category
    signals (e.g. 'bedtime', 'early reader')."""
    cats = [report.category] if report.category else []
    for feature in report.frequently_requested_features[:_MAX_SUGGESTED_CATEGORIES]:
        val = feature["value"]
        if val not in cats:
            cats.append(val)
    return cats[:_MAX_SUGGESTED_CATEGORIES]


class BookOptimizer:
    """AI-assisted generation of the creative/copy fields. Requires a
    configured AIProvider -- same failure semantics as CreativeCouncil:
    a missing API key raises ProviderError rather than silently
    returning fake copy."""

    def __init__(self, provider: Optional[AIProvider] = None, provider_name: str = "openrouter",
                 model: str = "anthropic/claude-sonnet-4"):
        self.provider = provider or get_provider(provider_name)
        self.model = model

    def generate_listing_copy(
        self,
        project_id: str,
        manuscript_summary: str,
        report: MarketResearchReport,
        brief: Optional[DesignBrief] = None,
        author: str = "",
        extra_keywords: Optional[List[str]] = None,
    ) -> BookMetadata:
        if not manuscript_summary.strip():
            raise BookOptimizerError("manuscript_summary must not be empty")

        system = (
            "You are a KDP/book-publishing copywriter. Using the manuscript summary and the "
            "aggregate market-trend signals given, write ORIGINAL listing copy -- never reuse "
            "or closely paraphrase any real existing book's title, subtitle, or description. "
            "Respond in this exact labeled format, one field per line, no extra commentary:\n"
            "TITLE: <title>\n"
            "SUBTITLE: <subtitle>\n"
            "DESCRIPTION: <2-4 paragraph back-cover-style description>\n"
            "APLUS_1_HEADING: <heading>\n"
            "APLUS_1_BODY: <1-2 sentences>\n"
            "APLUS_2_HEADING: <heading>\n"
            "APLUS_2_BODY: <1-2 sentences>\n"
            "MARKETING_COPY: <one punchy paragraph for use in ads/social captions>"
        )
        prompt = (
            f"Manuscript summary: {manuscript_summary}\n"
            f"Category: {report.category}\n"
            f"Market signals -- top keywords: {', '.join(k['value'] for k in report.top_keywords[:10])}\n"
            f"Market signals -- frequently requested features: "
            f"{', '.join(f['value'] for f in report.frequently_requested_features[:5])}\n"
        )
        if brief:
            prompt += f"Design brief cover concept: {brief.cover_concept}\n"

        result = self.provider.complete(self.model, system, prompt)
        fields = self._parse_labeled_response(result.text)

        keywords = suggest_keywords(report, extra_keywords)
        categories = suggest_categories(report, brief)

        a_plus = []
        if fields.get("APLUS_1_HEADING"):
            a_plus.append({"heading": fields["APLUS_1_HEADING"], "body": fields.get("APLUS_1_BODY", "")})
        if fields.get("APLUS_2_HEADING"):
            a_plus.append({"heading": fields["APLUS_2_HEADING"], "body": fields.get("APLUS_2_BODY", "")})

        now = time.time()
        return BookMetadata(
            id=str(uuid.uuid4()),
            project_id=project_id,
            title=fields.get("TITLE", ""),
            subtitle=fields.get("SUBTITLE", ""),
            description=fields.get("DESCRIPTION", ""),
            author=author,
            categories=categories,
            keywords=keywords,
            a_plus_content=a_plus,
            marketing_copy=fields.get("MARKETING_COPY", ""),
            price=brief.recommended_price if brief else None,
            page_count=brief.recommended_page_count if brief else None,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def _parse_labeled_response(text: str) -> Dict[str, str]:
        """Parses the LABEL: value response format requested in the
        system prompt. Tolerant of multi-line values (a label continues
        collecting text until the next known label appears)."""
        labels = [
            "TITLE", "SUBTITLE", "DESCRIPTION", "APLUS_1_HEADING", "APLUS_1_BODY",
            "APLUS_2_HEADING", "APLUS_2_BODY", "MARKETING_COPY",
        ]
        fields: Dict[str, str] = {}
        current_label: Optional[str] = None
        buffer: List[str] = []

        def flush():
            if current_label:
                fields[current_label] = "\n".join(buffer).strip()

        for line in text.splitlines():
            matched = None
            for label in labels:
                if line.strip().upper().startswith(f"{label}:"):
                    matched = label
                    break
            if matched:
                flush()
                current_label = matched
                buffer = [line.split(":", 1)[1].strip()] if ":" in line else [""]
            elif current_label:
                buffer.append(line)
        flush()
        return fields
