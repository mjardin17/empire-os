"""
storyforge2/books/ — autonomous 24/7 book factory.

Parallel to merch/, this package handles book trend discovery, manuscript
generation, cover design, metadata, and multi-platform publishing.

Core flow:
  1. TrendScanner (every 4h) — detects opportunities in niches
  2. ManuscriptGenerator (per trend) — Claude API → 20k-40k words
  3. CoverGenerator (per manuscript) — Pollinations/DALL-E → 1600x2400px
  4. MetadataBuilder (per book) — ISBN, description, keywords, categories
  5. BookPublisher (per platform) — Gumroad, Draft2Digital, KDP, storefront, email

All phases run through dry-run mode by default. State tracked in books/state.db.
"""

from __future__ import annotations

__version__ = "1.0.0"
__all__ = ["TrendScanner", "BookFactory", "BookMetadata"]
