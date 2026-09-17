"""
storyforge2/export/metadata.py — extended metadata schema for books.

Threads language, age_range, accessibility_text, and ISBN-placeholder
through the export pipeline. Unlike storyforge/formatter.py (which hardcodes
language="en" and author="Empire OS Publishing"), this module makes those
decisions explicit and configurable per project.

ISBN is always a placeholder (this pipeline never assigns a real ISBN, per
the mission spec) — but the structure is ready for future integration with
an ISBN service if needed, scoped as a clear follow-up rather than a gap.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

__all__ = ["MetadataError", "BookMetadata", "validate_language_code", "validate_isbn_placeholder"]

VALID_LANGUAGES = {"en", "es", "fr", "de", "it", "pt", "ja", "zh"}
AGE_RANGES = {"0-4", "5-8", "9-12", "13-17", "18+"}


class MetadataError(ValueError):
    pass


def validate_language_code(code: str) -> bool:
    """Validates ISO 639-1 language codes. Accepts any 2-letter code (doesn't
    maintain an exhaustive list), but flags obviously invalid input."""
    return len(code) == 2 and code.isalpha() and code.islower()


def validate_isbn_placeholder(isbn_or_placeholder: str) -> bool:
    """Accepts either a real 13-digit ISBN (structure check only, no check-digit
    validation) or the placeholder string 'placeholder' or a 10-digit ISBN-10
    (older format, still in use). This is permissive — the real ISBN service
    will validate stricter. Here we just make sure it's not obviously junk."""
    s = isbn_or_placeholder.strip()
    if s.lower() == "placeholder":
        return True
    clean = s.replace("-", "").replace(" ", "")
    return clean.isdigit() and len(clean) in (10, 13)


@dataclass
class BookMetadata:
    title: str
    author: str
    language: str = "en"
    age_range: str = ""  # free text, e.g. "8-12" or "Young Adult"
    accessibility_text: str = ""  # alt text for cover image, short description of visual design
    isbn: str = "placeholder"  # never a real ISBN, always a placeholder
    subject_category: str = ""  # e.g. "Fiction", "Juvenile", "Science Fiction"

    def validate(self) -> list[str]:
        problems = []
        if not self.title.strip():
            problems.append("title is required")
        if not self.author.strip():
            problems.append("author is required")
        if not validate_language_code(self.language):
            problems.append(f"language={self.language!r} is not a valid ISO 639-1 code (2 lowercase letters)")
        if not validate_isbn_placeholder(self.isbn):
            problems.append(f"isbn={self.isbn!r} is not a valid placeholder or ISBN structure (10 or 13 digits, or 'placeholder')")
        return problems

    @classmethod
    def from_brief_and_extra(cls, brief, extra_author: str = "", extra_lang: str = "", extra_age_range: str = "", extra_category: str = "") -> BookMetadata:
        """Construct from a ProjectBrief + optional overrides. Merges brief's
        author (if present) with an extra_author argument (for co-authors,
        if needed), threads through the brief's language field."""
        author_parts = [brief.author_name]
        if extra_author.strip():
            author_parts.append(extra_author)
        return cls(
            title=brief.title,
            author=" and ".join(author_parts),
            language=extra_lang or brief.language,
            age_range=extra_age_range or brief.age_range,
            subject_category=extra_category or brief.genre,
        )
