"""
core/book/patterson_formula.py — James Patterson Formula Engine

Ported from video-bot-pipeline/storyforge/patterson_formula.py (proven,
already in production use there). Patterson's success is MECHANICAL, not
magical — this module encodes his formula as algorithms core/book/generator.py
follows and validates against, not just suggests.

Core insights:
- Chapters are 500-600 words (ultra-short -> page-turning psychology)
- Every chapter ends with ONE cliffhanger type (forces page turn)
- Dialogue is 40-50% of word count (speed + characterization + tension)
- Sentences average 8-12 words (readability, momentum)
- Active voice always (no passive "was running", no literary flourish)
- Series hooks in every ending (reader buys next book)

Usage:
    formula = PattersonFormula(reading_level="YA")
    prompt = formula.chapter_generation_prompt(
        chapter_num=1,
        title="Something Is Coming",
        narration="...",
        target_words=600,
    )
    result = get_provider("gemini").complete("gemini-2.0-flash", "", prompt)
    violations = formula.validate_chapter(result.text)
    if violations:
        print(f"Formula violations: {violations}")
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from typing import Optional


class CliffhangerType(Enum):
    """Patterson's five cliffhanger types — pick ONE per chapter."""
    REVELATION = "revelation"      # "The killer was [twist]"
    REVERSAL = "reversal"          # "But [character] was already [dead/gone]"
    ESCALATION = "escalation"      # "Then a second [thing] appeared"
    QUESTION = "question"          # "Who else knew about [secret]?"
    THREAT = "threat"              # "The killer had left a message..."


class ReadingLevel(Enum):
    """Book audience determines formula strictness."""
    YA = "YA"           # Action, cinematic, 600w chapters, tighter dialogue
    MG = "MG"           # Middle-grade, playful, 500w chapters, more action beats
    ADULT = "ADULT"     # Literary thrillers, 700w chapters, complex dialogue


@dataclass
class PattersonFormula:
    """Encodes Patterson's mechanical formula as enforceable rules."""

    reading_level: ReadingLevel | str = "YA"

    def __post_init__(self):
        if isinstance(self.reading_level, str):
            self.reading_level = ReadingLevel[self.reading_level.upper()]

    @property
    def chapter_word_target(self) -> int:
        """Target word count per chapter (mechanical, not flexible)."""
        return {
            ReadingLevel.YA: 600,
            ReadingLevel.MG: 500,
            ReadingLevel.ADULT: 700,
        }[self.reading_level]

    @property
    def chapter_word_tolerance(self) -> tuple[int, int]:
        """Acceptable word count range (±10%)."""
        target = self.chapter_word_target
        delta = int(target * 0.10)
        return (target - delta, target + delta)

    @property
    def dialogue_ratio_target(self) -> tuple[float, float]:
        """Dialogue must be 40-50% of chapter (enforced)."""
        return (0.40, 0.50)

    @property
    def sentence_length_target(self) -> tuple[int, int]:
        """Sentences must average 8-12 words (Patterson's secret weapon)."""
        return (8, 12)

    @property
    def passive_voice_tolerance(self) -> float:
        """Allow <5% passive voice (ultra-rare)."""
        return 0.05

    @property
    def cliffhanger_types(self) -> list[CliffhangerType]:
        """Every chapter ends with exactly ONE of these."""
        return list(CliffhangerType)

    def chapter_generation_prompt(
        self,
        chapter_num: int,
        title: str,
        narration: str,
        target_words: Optional[int] = None,
        characters: dict[str, str] | None = None,
        cliffhanger_type: Optional[CliffhangerType] = None,
    ) -> str:
        """Generate a prompt that ENFORCES the Patterson formula."""
        if target_words is None:
            target_words = self.chapter_word_target

        char_list = ""
        if characters:
            char_list = "\n".join([f"- {name}: {desc}" for name, desc in characters.items()])
            char_list = f"\n\nCharacters:\n{char_list}"

        min_words, max_words = self.chapter_word_tolerance
        min_dialogue, max_dialogue = self.dialogue_ratio_target
        min_sentence, max_sentence = self.sentence_length_target

        if cliffhanger_type:
            cliffhanger_instruction = (
                f"\nEnd with a {cliffhanger_type.value.upper()} cliffhanger: "
                f"{self._cliffhanger_example(cliffhanger_type)}"
            )
        else:
            ch_examples = "\n".join([
                f"- {t.value.upper()}: {self._cliffhanger_example(t)}"
                for t in self.cliffhanger_types
            ])
            cliffhanger_instruction = f"\nEnd with ONE of these cliffhangers:\n{ch_examples}"

        prompt = f"""WRITE CHAPTER {chapter_num}: "{title}"

PREMISE: {narration}

FORMULA (MANDATORY, NOT OPTIONAL):
1. Word count: {min_words}-{max_words} words (target: {target_words})
2. Dialogue: {int(min_dialogue*100)}-{int(max_dialogue*100)}% of total words
3. Sentence length: average {min_sentence}-{max_sentence} words per sentence
4. Active voice ONLY: no "was running", no "were going" — action, not description
5. No literary flourishes: no 100-word descriptions, no internal monologue spirals
6. Ultra-short paragraphs: 1-3 sentences max per paragraph
{cliffhanger_instruction}

CHARACTERS{char_list}

NOW WRITE THE CHAPTER:
- Count every word as you write
- Track sentence length
- Ensure dialogue hits the ratio
- End with the cliffhanger
- Make it unputdownable

BEGIN:"""
        return prompt

    def _cliffhanger_example(self, cliff_type: CliffhangerType) -> str:
        """Example for each cliffhanger type."""
        examples = {
            CliffhangerType.REVELATION: '"The killer was the detective."',
            CliffhangerType.REVERSAL: '"But she was already gone."',
            CliffhangerType.ESCALATION: '"Then a second body appeared."',
            CliffhangerType.QUESTION: '"Who else knew about the affair?"',
            CliffhangerType.THREAT: '"The killer had left a message: Read this, detective."',
        }
        return examples.get(cliff_type, "")

    def validate_chapter(self, chapter_text: str) -> list[str]:
        """Check if chapter violates the formula. Returns list of violations."""
        violations = []

        word_count = len(chapter_text.split())
        min_w, max_w = self.chapter_word_tolerance
        if not (min_w <= word_count <= max_w):
            violations.append(f"Word count {word_count} outside range [{min_w}, {max_w}]")

        dialogue_words = self._count_dialogue_words(chapter_text)
        dialogue_ratio = dialogue_words / word_count if word_count > 0 else 0
        min_d, max_d = self.dialogue_ratio_target
        if not (min_d <= dialogue_ratio <= max_d):
            violations.append(
                f"Dialogue ratio {dialogue_ratio:.1%} outside range [{min_d:.0%}, {max_d:.0%}]"
            )

        avg_sentence_len = self._avg_sentence_length(chapter_text)
        min_s, max_s = self.sentence_length_target
        if not (min_s <= avg_sentence_len <= max_s):
            violations.append(
                f"Average sentence length {avg_sentence_len:.1f} outside range [{min_s}, {max_s}]"
            )

        passive_ratio = self._passive_voice_ratio(chapter_text)
        if passive_ratio > self.passive_voice_tolerance:
            violations.append(
                f"Passive voice {passive_ratio:.1%} exceeds {self.passive_voice_tolerance:.0%}"
            )

        if not self._has_cliffhanger(chapter_text):
            violations.append("Chapter does not end with a cliffhanger")

        return violations

    def _count_dialogue_words(self, text: str) -> int:
        """Count words inside quotation marks."""
        dialogue_matches = re.findall(r'"([^"]*)"', text)
        return sum(len(match.split()) for match in dialogue_matches)

    def _avg_sentence_length(self, text: str) -> float:
        """Calculate average words per sentence."""
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        if not sentences:
            return 0
        total_words = sum(len(s.split()) for s in sentences)
        return total_words / len(sentences)

    def _passive_voice_ratio(self, text: str) -> float:
        """Estimate passive voice ratio (imperfect but good heuristic)."""
        passive_patterns = [
            r'\bwas\s+\w+ed\b',
            r'\bwere\s+\w+ed\b',
            r'\bbeing\s+\w+ed\b',
            r'\bin\s+\w+ed\b',
        ]
        passive_count = 0
        for pattern in passive_patterns:
            passive_count += len(re.findall(pattern, text, re.IGNORECASE))

        total_verbs = len(
            re.findall(
                r'\b(is|are|was|were|being|been|have|has|had|do|does|did)\b',
                text,
                re.IGNORECASE,
            )
        )
        return passive_count / total_verbs if total_verbs > 0 else 0

    def _has_cliffhanger(self, text: str) -> bool:
        """Check if chapter ends with a cliffhanger (simplified heuristic,
        not a real classifier — same limitation as the source module)."""
        last_sentences = text.strip().split('.')[-2:]
        last_text = '.'.join(last_sentences).lower()

        cliffhanger_patterns = [
            r'but.*\.',
            r'then.*appeared',
            r'\?.*\.$',
            r'message',
            r'suddenly',
            r'when.*\.',
        ]
        for pattern in cliffhanger_patterns:
            if re.search(pattern, last_text):
                return True
        return False


# Quick-access formula instances
YA_FORMULA = PattersonFormula(reading_level=ReadingLevel.YA)
MG_FORMULA = PattersonFormula(reading_level=ReadingLevel.MG)
ADULT_FORMULA = PattersonFormula(reading_level=ReadingLevel.ADULT)
