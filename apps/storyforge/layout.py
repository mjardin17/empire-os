"""
storyforge2/layout.py — deterministic page/chapter/illustration planning.

No AI calls here by design, matching the mission's own instruction:
"Deterministic placement of titles and book text — do not depend on
image models to spell words." That principle extends structurally too
— page counts and illustration slot counts are arithmetic, not model
output, because cover/spec.py's spine-width math depends on getting a
real page count, not a guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from storyforge2.manuscript import Manuscript

# Rough words-per-page for a standard trade-fiction interior at 11pt
# serif with normal margins — used only for page-count ESTIMATION
# (cover spine math), not for actual PDF layout (reportlab lays out
# real pages in export/pdf.py; this is a planning-time estimate so the
# cover stage doesn't have to wait on a completed PDF).
DEFAULT_WORDS_PER_PAGE = 250

# Front matter (title page, copyright page, etc.) + back matter
# (about-the-author, ISBN placeholder page) — a fixed, documented
# estimate, not invented per book.
FRONT_MATTER_PAGES = 2
BACK_MATTER_PAGES = 1


@dataclass
class IllustrationSlot:
    chapter_number: int
    slot_index: int
    prompt: str
    placement: str  # "chapter_opener" | "mid_chapter"


@dataclass
class ChapterLayout:
    chapter_number: int
    title: str
    word_count: int
    estimated_pages: int
    illustration_slots: list[IllustrationSlot] = field(default_factory=list)


@dataclass
class BookLayout:
    chapters: list[ChapterLayout]
    total_estimated_pages: int
    illustrations_per_chapter: int
    words_per_page: int


def _build_illustration_prompt(manuscript: Manuscript, chapter_title: str, chapter_text: str, slot_index: int) -> str:
    """Deterministic template, not an AI call. Character descriptions
    come straight from the brief so illustrations stay consistent with
    what generate_character_sheet() (illustrations.py) produces for the
    same characters."""
    char_desc = "; ".join(f"{name}: {desc}" for name, desc in manuscript.brief.characters.items())
    opening = " ".join(chapter_text.split()[:40])  # first ~40 words as scene context, deterministic slice
    parts = [
        f'Illustration for "{chapter_title}" (scene {slot_index + 1}).',
        f"Style: {manuscript.brief.genre}, {manuscript.brief.tone or 'consistent tone'}.",
        f"Setting: {manuscript.brief.setting}." if manuscript.brief.setting else "",
        f"Characters: {char_desc}." if char_desc else "",
        f"Scene context: {opening}...",
    ]
    return " ".join(p for p in parts if p)


def plan_layout(
    manuscript: Manuscript,
    illustrations_per_chapter: int = 1,
    words_per_page: int = DEFAULT_WORDS_PER_PAGE,
) -> BookLayout:
    if illustrations_per_chapter < 0:
        raise ValueError("illustrations_per_chapter must be >= 0")

    chapters: list[ChapterLayout] = []
    for ch in manuscript.chapters:
        word_count = len(ch.text.split())
        estimated_pages = max(1, round(word_count / words_per_page))
        slots = [
            IllustrationSlot(
                chapter_number=ch.number, slot_index=i,
                prompt=_build_illustration_prompt(manuscript, ch.title, ch.text, i),
                placement="chapter_opener" if i == 0 else "mid_chapter",
            )
            for i in range(illustrations_per_chapter)
        ]
        chapters.append(ChapterLayout(
            chapter_number=ch.number, title=ch.title, word_count=word_count,
            estimated_pages=estimated_pages, illustration_slots=slots,
        ))

    total = FRONT_MATTER_PAGES + sum(c.estimated_pages for c in chapters) + BACK_MATTER_PAGES
    return BookLayout(
        chapters=chapters, total_estimated_pages=total,
        illustrations_per_chapter=illustrations_per_chapter, words_per_page=words_per_page,
    )
