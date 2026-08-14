"""
core/book/router.py — Patterson-formula book generation endpoint.

Additive APIRouter, following the same pattern empire_hooks/router.py
established (a dedicated router included from main.py, rather than more
bare @app routes piled onto the existing monolith).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.book.generator import BookGenerationError, generate_book
from core.ai.provider import ProviderError

book_router = APIRouter(prefix="/book", tags=["book-generation"])


class GenerateBookRequest(BaseModel):
    niche: str
    title: str
    book_type: str = "adult_thriller"
    provider: str = "gemini"
    model: str = "gemini-2.0-flash"
    author: str = "Empire OS Publishing"


class ChapterWarningResponse(BaseModel):
    chapter: int
    title: str
    violations: List[str]


class GenerateBookResponse(BaseModel):
    title: str
    author: str
    chapter_count: int
    chapter_titles: List[str]
    chapter_warnings: List[ChapterWarningResponse]
    formula_clean: bool


@book_router.post("/generate", response_model=GenerateBookResponse)
def generate_book_endpoint(req: GenerateBookRequest):
    """Generate a full book (outline + Patterson-formula-validated
    chapters). Returns a summary with chapter titles/warnings, not the
    full chapter bodies — there's no book-storage layer in this engine
    yet, so nothing is persisted server-side between calls. Use
    generate_book() directly (not this HTTP layer) when you need the
    full BookManifest in the same process, e.g. from a workflow step
    handler that immediately hands it to EpubExporter."""
    try:
        result = generate_book(
            niche=req.niche,
            title=req.title,
            book_type=req.book_type,
            provider_name=req.provider,
            model=req.model,
            author=req.author,
        )
    except (BookGenerationError, ProviderError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    return GenerateBookResponse(
        title=result.manifest.title,
        author=result.manifest.author,
        chapter_count=len(result.manifest.chapters),
        chapter_titles=[c.title for c in result.manifest.chapters],
        chapter_warnings=[
            ChapterWarningResponse(chapter=w.chapter, title=w.title, violations=w.violations)
            for w in result.chapter_warnings
        ],
        formula_clean=len(result.chapter_warnings) == 0,
    )
