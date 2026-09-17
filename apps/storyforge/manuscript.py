"""
storyforge2/manuscript.py — outline + Patterson-formula manuscript generation.

Reuses storyforge/patterson_formula.py directly (the tested formula
engine — chapter_generation_prompt, validate_chapter) rather than
forking it. Does NOT reuse storyforge/generator.py's
generate_chapter_with_formula() as-is, because that function hardcodes
a single call_gemini() dependency with no provider swapping — and this
mission explicitly requires mock/local providers so the app runs
without paid API usage. Same fix applied here as in this session's
earlier empire-os work: a small, provider-pluggable retry loop that
wraps the (reused, unmodified) formula logic.

This also closes the same real gap found in storyforge/pipeline.py
earlier today: the formula-validated generator existed but the actual
end-to-end pipeline never called it (it used a separate, unvalidated
nonfiction generator instead). Here, there is only one path, and it
always validates.
"""

from __future__ import annotations

import json
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from storyforge.patterson_formula import PattersonFormula, ReadingLevel
from storyforge2.brief import ProjectBrief


class ManuscriptError(RuntimeError):
    pass


# -- Provider layer ---------------------------------------------------

class TextProvider(ABC):
    name: str = "base"

    @abstractmethod
    def complete(self, system: str, prompt: str) -> str:
        ...


class GeminiTextProvider(TextProvider):
    """Reuses storyforge/generator.py's call_gemini() for the actual
    HTTP call (auth, endpoint, router fallback) — genuine reuse at the
    layer that's actually proven, not reimplemented."""
    name = "gemini"

    def complete(self, system: str, prompt: str) -> str:
        from storyforge.generator import call_gemini
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        return call_gemini(full_prompt, use_router=True)


class AnthropicTextProvider(TextProvider):
    """Real text generation via Claude API (Anthropic).
    Requires ANTHROPIC_API_KEY environment variable.
    Uses the claude-haiku model for cost efficiency."""
    name = "anthropic"

    def complete(self, system: str, prompt: str) -> str:
        import os
        import anthropic

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ManuscriptError("ANTHROPIC_API_KEY environment variable not set. Cannot use Anthropic provider.")

        client = anthropic.Anthropic(api_key=api_key)
        messages = [{"role": "user", "content": prompt}]

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",  # Efficient model for text generation
            max_tokens=2000,
            system=system if system else None,
            messages=messages,
        )

        return response.content[0].text


class MockTextProvider(TextProvider):
    """Deterministic, offline, zero-cost. Produces real
    Patterson-formula-passing prose (not just placeholder text) so
    DRY_RUN actually exercises the validator meaningfully, not just
    the plumbing around it — dialogue-heavy short sentences, a
    cliffhanger-shaped final line, tunable to hit any word-count
    target via `_line_bank` repetition."""
    name = "mock"

    # Tuned to genuinely satisfy PattersonFormula.validate_chapter(), not
    # just approximate it: dialogue-heavy sentences average ~40-45%
    # dialogue by word count when mixed with these narration sentences,
    # and every sentence runs 8-12 words to hit the target average.
    _line_bank = (
        "The corridor stretched far into the flickering shadows below them.",
        '"We have to move now before they catch up," she said quietly.',
        "Her footsteps echoed loudly through the empty abandoned hallway.",
        '"I never thought it would end like this," he admitted softly.',
        "Something heavy moved slowly behind the broken wooden door.",
        '"Someone is following us through this building right now," she warned him.',
        "He gripped the old flashlight tightly and pressed forward.",
        '"There has to be another way out of here," he muttered darkly.',
    )
    _cliffhanger_line = "Then a shadow appeared at the end of the hall."

    def complete(self, system: str, prompt: str) -> str:
        # Outline requests ask for JSON; detect via the system prompt
        # this module itself sends (see generate_outline below) rather
        # than guessing from arbitrary prompt text.
        if "JSON object" in system:
            return self._mock_outline_json(prompt)
        return self._mock_chapter(prompt)

    def _mock_outline_json(self, prompt: str) -> str:
        # Pull the requested chapter count out of the prompt we generated
        # ourselves (see generate_outline) rather than hardcoding one.
        m = re.search(r"exactly (\d+) chapters", prompt)
        n = int(m.group(1)) if m else 8
        return json.dumps({
            "subtitle": "A Mock Subtitle (DRY_RUN)",
            "author_bio": "Generated offline for dry-run verification.",
            "description": "A dry-run description generated by the mock text provider — no API call was made.",
            "chapters": [{"title": f"Chapter {i}", "summary": f"Mock summary for chapter {i}."} for i in range(1, n + 1)],
            "keywords": ["mock", "dry-run", "offline", "test", "sample"],
            "audience": "general",
        })

    def _mock_chapter(self, prompt: str) -> str:
        # Parse the real tolerance band out of the prompt
        # PattersonFormula.chapter_generation_prompt() actually sends
        # ("Word count: {min}-{max} words (target: {target})"), rather
        # than assuming a fixed target — keeps this correct for every
        # reading level/formula, not just the ones tested by hand.
        m = re.search(r"Word count:\s*(\d+)-(\d+) words", prompt)
        min_words, max_words = (int(m.group(1)), int(m.group(2))) if m else (540, 660)
        cliff_len = len(self._cliffhanger_line.split())

        lines: list[str] = []
        word_count = 0
        i = 0
        # Leave room for the cliffhanger line, then stop as soon as
        # we're inside the tolerance band (checking per-line, not
        # per-bank-cycle, so this holds for any target size).
        while word_count + cliff_len < min_words:
            line = self._line_bank[i % len(self._line_bank)]
            lines.append(line)
            word_count += len(line.split())
            i += 1
            if word_count + cliff_len > max_words:
                break  # bank granularity overshot the band; stop adding
        lines.append(self._cliffhanger_line)
        return " ".join(lines)


def get_text_provider(name: str) -> TextProvider:
    providers: dict[str, type[TextProvider]] = {
        "gemini": GeminiTextProvider,
        "anthropic": AnthropicTextProvider,
        "claude": AnthropicTextProvider,  # alias
        "mock": MockTextProvider,
    }
    if name not in providers:
        raise ManuscriptError(f"Unknown text provider '{name}'. Available: {list(providers)}")
    return providers[name]()


# -- Outline ------------------------------------------------------------

_OUTLINE_SYSTEM = "You are a book outline generator. Respond with ONLY a JSON object, no prose, no markdown fences."


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def generate_outline(brief: ProjectBrief, provider: TextProvider) -> dict[str, Any]:
    prompt = (
        f'Create a book outline for a "{brief.genre}" book titled "{brief.title}".\n'
        f"Premise: {brief.premise}\n"
        f"Audience: {brief.audience}. Setting: {brief.setting}.\n\n"
        f"Respond with ONLY this JSON shape:\n"
        f'{{"subtitle": string, "author_bio": string, "description": string (150 words), '
        f'"chapters": [{{"title": string, "summary": string}}] (exactly {brief.length_chapters} chapters), '
        f'"keywords": [string] (5 items), "audience": string}}'
    )
    raw = provider.complete(_OUTLINE_SYSTEM, prompt)
    try:
        outline = json.loads(_strip_code_fences(raw))
    except json.JSONDecodeError as e:
        raise ManuscriptError(f"Outline response was not valid JSON: {e}") from e
    if not isinstance(outline.get("chapters"), list) or not outline["chapters"]:
        raise ManuscriptError("Outline response had no chapters.")
    return outline


# -- Chapters -------------------------------------------------------------

@dataclass
class ChapterResult:
    number: int
    title: str
    text: str
    violations: list[str] = field(default_factory=list)


@dataclass
class Manuscript:
    brief: ProjectBrief
    outline: dict[str, Any]
    chapters: list[ChapterResult]

    @property
    def formula_clean(self) -> bool:
        return all(not c.violations for c in self.chapters)

    @property
    def word_count(self) -> int:
        return sum(len(c.text.split()) for c in self.chapters)


def generate_chapter_with_formula(
    chapter_num: int, title: str, narration: str, formula: PattersonFormula,
    provider: TextProvider, characters: Optional[dict[str, str]] = None, max_retries: int = 3,
) -> tuple[str, list[str]]:
    """Same retry-until-clean behavior as this session's earlier
    empire-os port: build the (reused, unmodified) formula prompt,
    complete it via whichever provider was selected, validate, retry
    on violation, return the last attempt + its violations if every
    retry still fails (never raises on a formula violation)."""
    violations: list[str] = []
    text = ""
    for _ in range(max_retries):
        prompt = formula.chapter_generation_prompt(
            chapter_num=chapter_num, title=title, narration=narration, characters=characters,
        )
        text = provider.complete("", prompt).strip()
        violations = formula.validate_chapter(text)
        if not violations:
            return text, []
    return text, violations


def generate_manuscript(
    brief: ProjectBrief, provider_name: str = "gemini",
    max_retries_per_chapter: int = 3, chapter_sleep_sec: float = 0.0,
) -> Manuscript:
    problems = brief.validate()
    if problems:
        raise ManuscriptError(f"Invalid brief: {'; '.join(problems)}")

    provider = get_text_provider(provider_name)
    formula = PattersonFormula(reading_level=brief.reading_level)
    outline = generate_outline(brief, provider)

    chapters: list[ChapterResult] = []
    for i, ch in enumerate(outline["chapters"], start=1):
        text, violations = generate_chapter_with_formula(
            chapter_num=i, title=ch.get("title", f"Chapter {i}"), narration=ch.get("summary", ""),
            formula=formula, provider=provider, characters=brief.characters or None,
            max_retries=max_retries_per_chapter,
        )
        chapters.append(ChapterResult(number=i, title=ch.get("title", f"Chapter {i}"), text=text, violations=violations))
        if i < len(outline["chapters"]) and chapter_sleep_sec:
            time.sleep(chapter_sleep_sec)

    return Manuscript(brief=brief, outline=outline, chapters=chapters)
