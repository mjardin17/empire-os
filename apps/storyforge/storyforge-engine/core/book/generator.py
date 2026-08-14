"""
core/book/generator.py — Book outline + Patterson-formula chapter generation.

New orchestration glue, not a straight port. Combines two things that
existed as separate, never-connected code paths in
video-bot-pipeline/storyforge/:

  - generate_chapter_with_formula() there was Patterson-formula-validated
    but never actually called by the real end-to-end pipeline.
  - The pipeline that WAS actually wired up (pipeline.py -> run_generator())
    used a plain nonfiction generator with zero formula validation.

Here, generate_book() is the single path, and it always goes through
the formula-validated generator.
"""

from __future__ import annotations

import html
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from core.ai.provider import get_provider
from core.book.exporter import BookManifest, Chapter
from core.book.formula_config import BookConfig, CustomizationLayer, get_book_config
from core.book.patterson_formula import PattersonFormula
from core.image.image_studio import ImageStudio


class BookGenerationError(RuntimeError):
    pass


@dataclass
class ChapterWarning:
    chapter: int
    title: str
    violations: list[str]


@dataclass
class BookGenerationResult:
    manifest: BookManifest
    chapter_warnings: list[ChapterWarning] = field(default_factory=list)


_OUTLINE_SYSTEM_PROMPT = (
    "You are a book outline generator. Respond with ONLY a JSON object, "
    "no prose, no markdown code fences."
)


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def generate_book_outline(
    niche: str,
    title: str,
    chapter_count: int = 7,
    provider_name: str = "gemini",
    model: str = "gemini-2.0-flash",
) -> dict[str, Any]:
    """Ask the AI provider for a structured book outline. Generalized
    version of the source's generate_book_plan() — works with any
    registered AIProvider, not just a hardcoded Gemini REST call."""
    prompt = (
        f'Create a book outline for a "{niche}" book titled "{title}".\n\n'
        f"Respond with ONLY this JSON shape:\n"
        f'{{"subtitle": string, "author_bio": string, "description": string '
        f"(150 words), \"chapters\": [{{\"title\": string, \"summary\": string}}] "
        f'(exactly {chapter_count} chapters), "keywords": [string] (5 items), '
        f'"audience": string}}'
    )
    provider = get_provider(provider_name)
    result = provider.complete(model, _OUTLINE_SYSTEM_PROMPT, prompt)
    try:
        outline = json.loads(_strip_code_fences(result.text))
    except json.JSONDecodeError as e:
        raise BookGenerationError(f"Outline response was not valid JSON: {e}") from e

    if not isinstance(outline.get("chapters"), list) or not outline["chapters"]:
        raise BookGenerationError("Outline response had no chapters.")
    return outline


def generate_chapter_with_formula(
    chapter_num: int,
    title: str,
    narration: str,
    formula: PattersonFormula,
    provider_name: str = "gemini",
    model: str = "gemini-2.0-flash",
    characters: Optional[dict[str, str]] = None,
    customization: Optional[CustomizationLayer] = None,
    max_retries: int = 3,
) -> tuple[str, list[str]]:
    """Generate one chapter, validated against the Patterson formula.
    Ported from the identically-named function in
    video-bot-pipeline/storyforge/generator.py, rewired onto the
    provider-agnostic AIProvider interface (the source called Gemini
    directly), and folding in the CustomizationLayer suffix (source kept
    that as a separate, un-called wrapper in formula_config.py).

    Retries up to `max_retries` times on formula violations; returns the
    last attempt's text + violations if every retry still fails, never
    raises on a formula violation (only on a provider failure)."""
    provider = get_provider(provider_name)
    violations: list[str] = []
    chapter_text = ""

    for attempt in range(max_retries):
        prompt = formula.chapter_generation_prompt(
            chapter_num=chapter_num, title=title, narration=narration, characters=characters,
        )
        if customization:
            suffix = customization.to_prompt_suffix()
            if suffix:
                prompt = f"{prompt}\n\n{suffix}"

        result = provider.complete(model, "", prompt)
        chapter_text = result.text.strip()
        violations = formula.validate_chapter(chapter_text)
        if not violations:
            return chapter_text, []

    return chapter_text, violations


def _paragraphs_to_html(text: str) -> str:
    """Convert plain chapter text into safe, well-formed XHTML <p> tags.
    exporter.py inserts html_body RAW into an XML document, so every
    paragraph's text must be escaped even though the tags themselves
    aren't."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return "\n".join(f"<p>{html.escape(p)}</p>" for p in paragraphs)


def generate_book(
    niche: str,
    title: str,
    book_type: str = "adult_thriller",
    provider_name: str = "gemini",
    model: str = "gemini-2.0-flash",
    author: str = "Empire OS Publishing",
    cover_image_path: Optional[str] = None,
    project_id: Optional[str] = None,
    image_studio: Optional[ImageStudio] = None,
    image_provider: str = "video_pipeline",
    max_retries_per_chapter: int = 3,
    chapter_sleep_sec: float = 1.0,
) -> BookGenerationResult:
    """Full Patterson-formula book generation: outline -> validated
    chapters -> optional cover -> BookManifest ready for
    EpubExporter.export().

    Cover generation is opt-in: pass an `image_studio` (the app's
    singleton — this function doesn't create its own, to avoid a second
    divergent SQLite file) and this calls it with `image_provider`
    (defaults to "video_pipeline" — see core/image/video_pipeline_provider.py).
    If image_studio is None, or the provider isn't configured
    (e.g. VIDEO_PIPELINE_PATH unset), the book is still generated —
    cover_image_path just stays whatever was passed in (None by
    default), same as before this existed. A cover failure never
    fails the whole book.

    A chapter that still fails formula validation after every retry is
    still included (a flagged book beats no book) but shows up in
    chapter_warnings rather than being silently dropped."""
    config: BookConfig = get_book_config(book_type)
    outline = generate_book_outline(niche, title, provider_name=provider_name, model=model)

    chapters: list[Chapter] = []
    warnings: list[ChapterWarning] = []
    for i, ch in enumerate(outline["chapters"], start=1):
        text, violations = generate_chapter_with_formula(
            chapter_num=i,
            title=ch.get("title", f"Chapter {i}"),
            narration=ch.get("summary", ""),
            formula=config.formula,
            provider_name=provider_name,
            model=model,
            characters=config.customization.character_voices or None,
            customization=config.customization,
            max_retries=max_retries_per_chapter,
        )
        if violations:
            warnings.append(ChapterWarning(chapter=i, title=ch.get("title", ""), violations=violations))

        chapters.append(Chapter(title=ch.get("title", f"Chapter {i}"), html_body=_paragraphs_to_html(text)))
        if i < len(outline["chapters"]):
            time.sleep(chapter_sleep_sec)

    if cover_image_path is None and image_studio is not None:
        cover_image_path = _generate_cover(
            image_studio, project_id or title, title, outline, book_type, image_provider,
        )

    manifest = BookManifest(
        title=title,
        author=author,
        chapters=chapters,
        cover_image_path=cover_image_path,
    )
    return BookGenerationResult(manifest=manifest, chapter_warnings=warnings)


def _generate_cover(
    image_studio: ImageStudio,
    project_id: str,
    title: str,
    outline: dict[str, Any],
    book_type: str,
    image_provider: str,
) -> Optional[str]:
    """Best-effort cover generation — never raises out of generate_book().
    A missing/broken cover shouldn't take down an otherwise-good book."""
    prompt = (
        f"Book cover illustration for \"{title}\". "
        f"Genre/style: {book_type.replace('_', ' ')}. "
        f"{outline.get('description', '')[:200]}"
    )
    try:
        asset = image_studio.generate_image(
            project_id=project_id,
            image_type="book_cover",
            prompt=prompt,
            provider=image_provider,
            width=1600,
            height=2560,
        )
        return asset.output_path if asset.status == "completed" else None
    except Exception:
        # ImageStudioError / ProviderError / provider-not-configured all
        # land here — cover art is a nice-to-have, not a hard dependency
        # for the book itself to exist.
        return None
