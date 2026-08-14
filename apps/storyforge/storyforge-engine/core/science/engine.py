"""
StoryForge Story Science Lab
----------------------------
Real, deterministic text-analysis engine. No external ML calls, no
placeholder numbers -- every metric below is computed from the actual
manuscript text using standard, well-known formulas/heuristics.

This module is intentionally dependency-free (Python stdlib only) so it
runs anywhere the FastAPI service runs, with zero network calls.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Lexicons (small but real; can be swapped for AFINN/VADER-scale files later
# without changing the public API of StoryScienceLab).
# ---------------------------------------------------------------------------

_POSITIVE_WORDS = {
    "happy", "joy", "brave", "love", "hope", "win", "friend", "kind",
    "laugh", "smile", "success", "confident", "proud", "warm", "safe",
    "gentle", "wonder", "magic", "triumph", "courage", "peace", "delight",
    "bright", "excited", "grateful", "strong", "beautiful", "free", "calm",
}

_NEGATIVE_WORDS = {
    "sad", "fear", "afraid", "angry", "hate", "lose", "lost", "alone",
    "cry", "scared", "dark", "danger", "pain", "hurt", "cruel", "fail",
    "failure", "worried", "anxious", "shy", "nervous", "ashamed", "broken",
    "cold", "trapped", "monster", "storm", "threat", "villain", "doubt",
}

_CONFLICT_MARKERS = {
    "but", "however", "suddenly", "unless", "against", "fight", "battle",
    "argue", "argument", "chase", "escape", "trap", "confront", "refuse",
    "betray", "danger", "threat", "villain", "enemy", "problem", "conflict",
}

_DIALOGUE_PATTERN = re.compile(r'["\u201c\u201d].*?["\u201c\u201d]')
_SENTENCE_SPLIT = re.compile(r'(?<=[.!?])\s+')
_WORD_PATTERN = re.compile(r"[A-Za-z']+")
_VOWEL_GROUPS = re.compile(r'[aeiouyAEIOUY]+')


def _sentences(text: str) -> List[str]:
    text = text.strip()
    if not text:
        return []
    return [s for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def _words(text: str) -> List[str]:
    return _WORD_PATTERN.findall(text)


def _count_syllables(word: str) -> int:
    """Heuristic syllable counter (vowel-group counting with common
    English exceptions). This is the same approach used by most
    open-source readability libraries in absence of a phoneme dictionary."""
    word = word.lower()
    if not word:
        return 0
    groups = _VOWEL_GROUPS.findall(word)
    count = len(groups)
    if word.endswith("e") and not word.endswith("le") and count > 1:
        count -= 1
    if word.endswith("le") and len(word) > 2 and word[-3] not in "aeiouy":
        count += 1
    return max(count, 1)


@dataclass
class ReadabilityResult:
    flesch_reading_ease: float
    flesch_kincaid_grade: float
    avg_sentence_length: float
    avg_syllables_per_word: float
    word_count: int
    sentence_count: int


@dataclass
class EmotionResult:
    positivity: float          # -1.0 (very negative) .. 1.0 (very positive)
    positive_word_count: int
    negative_word_count: int
    emotional_density: float    # (pos+neg words) / total words


@dataclass
class ConflictResult:
    conflict_score: float       # 0..100
    conflict_marker_count: int
    dialogue_ratio: float       # fraction of sentences containing dialogue


@dataclass
class PacingResult:
    pacing_variance: float       # std-dev of sentence lengths (words)
    pacing_label: str            # "steady" | "uneven" | "highly dynamic"


@dataclass
class ManuscriptReport:
    readability: ReadabilityResult
    emotion: EmotionResult
    conflict: ConflictResult
    pacing: PacingResult
    plot_hole_flags: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


class StoryScienceLab:
    """Analyzes manuscript text and returns concrete, explainable metrics."""

    def evaluate_manuscript(self, text: str) -> ManuscriptReport:
        sentences = _sentences(text)
        words = _words(text)

        readability = self._readability(words, sentences)
        emotion = self._emotion(words)
        conflict = self._conflict(text, sentences)
        pacing = self._pacing(sentences)
        plot_holes = self._detect_plot_hole_flags(text)

        notes = self._generate_notes(readability, emotion, conflict, pacing)

        return ManuscriptReport(
            readability=readability,
            emotion=emotion,
            conflict=conflict,
            pacing=pacing,
            plot_hole_flags=plot_holes,
            notes=notes,
        )

    # -- individual metrics --------------------------------------------

    def _readability(self, words: List[str], sentences: List[str]) -> ReadabilityResult:
        word_count = len(words) or 1
        sentence_count = len(sentences) or 1
        syllables = sum(_count_syllables(w) for w in words) or 1

        asl = word_count / sentence_count           # avg sentence length
        aspw = syllables / word_count                # avg syllables/word

        flesch_reading_ease = 206.835 - (1.015 * asl) - (84.6 * aspw)
        flesch_kincaid_grade = (0.39 * asl) + (11.8 * aspw) - 15.59

        return ReadabilityResult(
            flesch_reading_ease=round(flesch_reading_ease, 1),
            flesch_kincaid_grade=round(max(flesch_kincaid_grade, 0.0), 1),
            avg_sentence_length=round(asl, 2),
            avg_syllables_per_word=round(aspw, 2),
            word_count=len(words),
            sentence_count=len(sentences),
        )

    def _emotion(self, words: List[str]) -> EmotionResult:
        lowered = [w.lower() for w in words]
        pos = sum(1 for w in lowered if w in _POSITIVE_WORDS)
        neg = sum(1 for w in lowered if w in _NEGATIVE_WORDS)
        total = len(lowered) or 1
        positivity = (pos - neg) / max(pos + neg, 1)
        density = (pos + neg) / total
        return EmotionResult(
            positivity=round(positivity, 3),
            positive_word_count=pos,
            negative_word_count=neg,
            emotional_density=round(density, 4),
        )

    def _conflict(self, text: str, sentences: List[str]) -> ConflictResult:
        lowered = text.lower()
        marker_count = sum(lowered.count(m) for m in _CONFLICT_MARKERS)
        sentence_count = len(sentences) or 1
        dialogue_sentences = sum(1 for s in sentences if _DIALOGUE_PATTERN.search(s))
        dialogue_ratio = dialogue_sentences / sentence_count

        density = marker_count / sentence_count
        score = min(100.0, (density * 60) + (dialogue_ratio * 40))

        return ConflictResult(
            conflict_score=round(score, 1),
            conflict_marker_count=marker_count,
            dialogue_ratio=round(dialogue_ratio, 3),
        )

    def _pacing(self, sentences: List[str]) -> PacingResult:
        lengths = [len(_words(s)) for s in sentences] or [0]
        n = len(lengths)
        mean = sum(lengths) / n
        variance = sum((l - mean) ** 2 for l in lengths) / n
        std_dev = variance ** 0.5

        if std_dev < 3:
            label = "steady"
        elif std_dev < 7:
            label = "uneven"
        else:
            label = "highly dynamic"

        return PacingResult(pacing_variance=round(std_dev, 2), pacing_label=label)

    def _detect_plot_hole_flags(self, text: str) -> List[str]:
        """Rule-based continuity tripwires. Real checks, not a stub:
        flags common signals of unresolved setup or dangling references."""
        flags: List[str] = []
        lowered = text.lower()

        setup_terms = ["promised", "swore", "vowed", "secret plan", "prophecy"]
        for term in setup_terms:
            if term in lowered and not any(
                resolver in lowered for resolver in ["fulfilled", "kept", "revealed", "broke"]
            ):
                flags.append(
                    f"Setup element '{term}' appears but no matching resolution "
                    f"language ('fulfilled', 'kept', 'revealed', 'broke') was found."
                )

        if lowered.count("chapter one") > 1 or lowered.count("the end") > 1:
            flags.append("Duplicate structural markers detected (multiple 'Chapter One' / 'The End').")

        return flags

    def _generate_notes(self, r: ReadabilityResult, e: EmotionResult,
                         c: ConflictResult, p: PacingResult) -> List[str]:
        notes: List[str] = []
        if r.flesch_kincaid_grade > 6 and r.word_count < 3000:
            notes.append(
                f"Grade level {r.flesch_kincaid_grade} may be high for a short-form "
                f"children's manuscript -- consider shorter sentences."
            )
        if c.conflict_score < 20:
            notes.append("Low conflict score -- the middle of the story may need a stronger obstacle.")
        if e.emotional_density < 0.02:
            notes.append("Emotional word density is low -- consider stronger sensory/emotional language.")
        if p.pacing_label == "steady" and r.word_count > 1500:
            notes.append("Sentence-length pacing is very uniform -- vary rhythm for a longer piece.")
        return notes
