"""storyforge2/brief.py — the project brief the whole pipeline runs from."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# Standard US trade/children's-book trim sizes (inches). Cover math
# (storyforge2/cover/spec.py) looks these up by name — never invents
# a size that isn't in this table or explicitly given in inches.
TRIM_SIZES = {
    "5x8": (5.0, 8.0),
    "5.5x8.5": (5.5, 8.5),
    "6x9": (6.0, 9.0),
    "7x10": (7.0, 10.0),
    "8.5x8.5": (8.5, 8.5),   # square picture book
    "8.5x11": (8.5, 11.0),
}

READING_LEVELS = {"MG", "YA", "ADULT"}  # matches storyforge.patterson_formula.ReadingLevel


class BriefError(ValueError):
    pass


@dataclass
class ProjectBrief:
    title: str
    premise: str
    audience: str = "general"
    reading_level: str = "YA"
    genre: str = "fiction"
    tone: str = ""
    length_chapters: int = 12
    characters: dict[str, str] = field(default_factory=dict)     # name -> voice/appearance description
    setting: str = ""
    lesson: str = ""                                              # optional moral/theme, mainly for MG
    author_name: str = "Empire OS Publishing"
    trim_size: str = "6x9"
    platform_targets: list[str] = field(default_factory=list)     # publishing platform ids, see publishing/registry.py
    marketing_platforms: list[str] = field(default_factory=list)  # marketing surfaces, see marketing/platforms.py
    language: str = "en"
    age_range: str = ""                                            # free text, e.g. "8-12" — structured per-platform mapping happens in export/metadata.py
    isbn: Optional[str] = None                                     # placeholder only — this pipeline never assigns a real ISBN

    def validate(self) -> list[str]:
        problems = []
        if not self.title.strip():
            problems.append("title is required")
        if not self.premise.strip():
            problems.append("premise is required")
        if self.reading_level not in READING_LEVELS:
            problems.append(f"reading_level must be one of {sorted(READING_LEVELS)}, got {self.reading_level!r}")
        if self.trim_size not in TRIM_SIZES:
            problems.append(f"trim_size must be one of {sorted(TRIM_SIZES)}, got {self.trim_size!r}")
        if self.length_chapters < 1:
            problems.append("length_chapters must be >= 1")
        return problems

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProjectBrief":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})
