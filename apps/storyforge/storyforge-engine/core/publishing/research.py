"""
StoryForge Publishing Intelligence Studio -- Market Research
------------------------------------------------------------
Real, deterministic aggregation over structured listing data (titles,
prices, page counts, keywords, cover/typography/layout/illustration
notes, review snippets, requested features). No network calls live
here and no placeholder numbers -- every field on `MarketResearchReport`
is computed directly from the `TrendListing` rows you feed in, the same
"real logic over real data" pattern as `core/science/engine.py`.

IMPORTANT -- what this module deliberately does NOT do:
StoryForge does not scrape Amazon/Kindle/Etsy at runtime. Automated
scraping of Amazon Best Sellers / New Releases / Kindle rankings is
against Amazon's Conditions of Use, and this sandbox has no outbound
network access regardless. Instead this module defines a clean seam --
`MarketDataSource` -- so real data can be supplied from a source you are
actually entitled to use:
  - manual research notes / a spreadsheet export you compiled yourself
  - a licensed data provider (e.g. Keepa, Jungle Scout exports)
  - Amazon's own Product Advertising API / SP-API, once you have
    credentials and are within their terms
  - the Claude web-search tool, run interactively by a human researcher
    who then feeds the extracted listing facts in as `TrendListing`
    rows via `ManualDataSource`

`ManualDataSource` (below) is real and fully working today. Add a new
source by subclassing `MarketDataSource` and registering it in
`_DATA_SOURCES` -- nothing else in this module changes.
"""

from __future__ import annotations

import statistics
import time
import uuid
from abc import ABC, abstractmethod
from collections import Counter
from typing import Dict, List, Optional

from core.publishing.models import MarketResearchReport, TrendListing


class MarketDataSourceError(RuntimeError):
    pass


class MarketDataSource(ABC):
    """Seam for supplying real listing data. Every source returns the
    same `TrendListing` shape so `analyze_listings()` never needs to
    know where the data came from."""

    name: str = "base"

    @abstractmethod
    def fetch(self, category: str, **kwargs) -> List[TrendListing]:
        ...


class ManualDataSource(MarketDataSource):
    """The data has already been collected (by a human researcher, a
    licensed API, a spreadsheet export, etc.) and is simply handed in.
    This is the default, always-available source -- no network, no key."""

    name = "manual"

    def fetch(self, category: str, listings: Optional[List[TrendListing]] = None, **kwargs) -> List[TrendListing]:
        return listings or []


_DATA_SOURCES: Dict[str, type] = {
    "manual": ManualDataSource,
}


def get_data_source(name: str) -> MarketDataSource:
    if name not in _DATA_SOURCES:
        raise MarketDataSourceError(
            f"Unknown market data source '{name}'. Available: {', '.join(_DATA_SOURCES)}. "
            f"Add a real one (Keepa, PA-API, SP-API, etc.) by subclassing MarketDataSource "
            f"and registering it in _DATA_SOURCES."
        )
    return _DATA_SOURCES[name]()


def register_data_source(name: str, cls: type) -> None:
    """Lets a future direct-API integration (e.g. an Amazon PA-API
    adapter) register itself without editing this file."""
    _DATA_SOURCES[name] = cls


# ---------------------------------------------------------------------
# Deterministic analysis -- the real logic
# ---------------------------------------------------------------------

def _top_n_counter(items: List[str], n: int = 15) -> List[Dict[str, object]]:
    counts = Counter(i.strip().lower() for i in items if i and i.strip())
    return [{"value": value, "count": count} for value, count in counts.most_common(n)]


def _round_stats(values: List[float]) -> Dict[str, float]:
    if not values:
        return {}
    return {
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "mean": round(statistics.mean(values), 2),
        "median": round(statistics.median(values), 2),
    }


def _sentiment_from_snippets(snippets: List[str]) -> Dict[str, object]:
    """Reuses the same lightweight lexicon approach as StoryScienceLab
    (core/science/engine.py) rather than inventing a second one --
    real word-level scoring, no external ML call."""
    from core.science.engine import _POSITIVE_WORDS, _NEGATIVE_WORDS, _words  # local import avoids a hard cross-module dependency at import time

    pos = neg = 0
    for snippet in snippets:
        for w in _words(snippet.lower()):
            if w in _POSITIVE_WORDS:
                pos += 1
            elif w in _NEGATIVE_WORDS:
                neg += 1
    total = pos + neg
    positivity = (pos - neg) / total if total else 0.0
    return {
        "positivity": round(positivity, 3),
        "positive_word_count": pos,
        "negative_word_count": neg,
        "snippet_count": len(snippets),
    }


def analyze_listings(project_id: str, category: str, listings: List[TrendListing]) -> MarketResearchReport:
    """Turns raw TrendListing rows into a real, explainable
    MarketResearchReport. Every field is computed here -- nothing is a
    fixed placeholder."""

    now = time.time()
    if not listings:
        return MarketResearchReport(
            id=str(uuid.uuid4()), project_id=project_id, category=category,
            listing_count=0, created_at=now,
        )

    all_keywords = [kw for l in listings for kw in l.keywords]
    all_colors = [c for l in listings for c in l.cover_colors]
    page_counts = [l.page_count for l in listings if l.page_count]
    prices = [l.price for l in listings if l.price is not None]
    all_reviews = [r for l in listings for r in l.review_snippets]
    all_features = [f for l in listings for f in l.requested_features]

    cover_style_themes = sorted({l.cover_style_notes.strip() for l in listings if l.cover_style_notes.strip()})
    typography_themes = sorted({l.typography_notes.strip() for l in listings if l.typography_notes.strip()})
    interior_layout_themes = sorted({l.interior_layout_notes.strip() for l in listings if l.interior_layout_notes.strip()})
    illustration_style_themes = sorted({l.illustration_style.strip() for l in listings if l.illustration_style.strip()})

    return MarketResearchReport(
        id=str(uuid.uuid4()),
        project_id=project_id,
        category=category,
        listing_count=len(listings),
        top_keywords=_top_n_counter(all_keywords),
        top_colors=_top_n_counter(all_colors),
        common_page_counts=[{"value": v, "count": c} for v, c in Counter(page_counts).most_common(10)],
        price_stats=_round_stats(prices),
        cover_style_themes=cover_style_themes,
        typography_themes=typography_themes,
        interior_layout_themes=interior_layout_themes,
        illustration_style_themes=illustration_style_themes,
        review_sentiment=_sentiment_from_snippets(all_reviews),
        frequently_requested_features=_top_n_counter(all_features),
        sources=sorted({l.source for l in listings if l.source}),
        created_at=now,
    )
