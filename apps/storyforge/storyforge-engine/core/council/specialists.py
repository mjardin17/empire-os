"""
StoryForge Creative Council
----------------------------
Fourteen named specialists, each with a distinct role and system prompt,
who review a project before export. The Council actually calls the AI
provider layer for each specialist and collects structured feedback —
this is a real orchestration loop, not a mock.

Extends core.council.base.AI_Specialist (kept fully backward compatible;
nothing in the original file is removed or changed).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from core.council.base import AI_Specialist
from core.ai.provider import AIProvider, ProviderError, get_provider


def _specialist(name: str, role: str, expertise: str, goals: List[str]) -> AI_Specialist:
    return AI_Specialist(name=name, role=role, expertise=expertise, goals=goals)


SPECIALISTS: List[AI_Specialist] = [
    _specialist("Aria", "Story Architect", "structure, pacing, and act breaks",
                ["Ensure the story follows a coherent structure (three-act, five-act, or Hero's Journey)",
                 "Flag missing setups/payoffs and pacing dead zones"]),
    _specialist("Dax", "Character Designer", "visual and personality consistency",
                ["Ensure characters read as visually and behaviorally distinct",
                 "Flag any drift from established character DNA"]),
    _specialist("Nova", "Dialogue Expert", "voice differentiation and subtext",
                ["Ensure each character sounds distinct in dialogue",
                 "Flag on-the-nose or expository dialogue"]),
    _specialist("Pip", "Humor Expert", "comedic timing and age-appropriate humor",
                ["Identify where comedic beats land or fall flat",
                 "Suggest punch-up lines where pacing allows"]),
    _specialist("Rex", "Animation Director", "motion, staging, and visual storytelling",
                ["Flag scenes that are hard to stage or animate clearly",
                 "Suggest camera/staging notes for key beats"]),
    _specialist("Iris", "Illustration Director", "composition and visual style",
                ["Ensure illustration opportunities match emotional beats",
                 "Flag scenes lacking strong visual imagery"]),
    _specialist("Professor Lin", "Educational Specialist", "age-appropriate learning value",
                ["Identify the core lesson/theme and confirm it's clearly reinforced",
                 "Flag content that is confusing or inappropriate for target age"]),
    _specialist("Sentinel", "Continuity Inspector", "cross-story consistency",
                ["Cross-check character/world facts against established canon",
                 "Flag contradictions or unresolved setups"]),
    _specialist("Marlowe", "Publishing Specialist", "market fit and format",
                ["Confirm the manuscript fits its intended format (picture book, chapter book, etc.)",
                 "Flag length/format mismatches for the target format"]),
    _specialist("Sage", "SEO Expert", "discoverability", 
                ["Identify searchable keywords and themes",
                 "Suggest title/subtitle/keyword optimizations"]),
    _specialist("Vega", "Marketing Director", "positioning and hooks",
                ["Identify the single strongest hook for marketing",
                 "Suggest audience segments this story will resonate with"]),
    _specialist("Echo", "Voice Director", "narration and casting notes",
                ["Suggest narration tone and pacing for audiobook production",
                 "Flag lines that are hard to voice-act clearly"]),
    _specialist("Melody", "Music Composer", "emotional scoring",
                ["Identify moments that call for a musical/emotional swell",
                 "Suggest musical motifs tied to character themes"]),
    _specialist("Atlas", "Franchise Planner", "expansion potential",
                ["Identify sequel, spin-off, and merchandise opportunities",
                 "Assess overall franchise potential"]),
]


@dataclass
class SpecialistReview:
    specialist: str
    role: str
    feedback: str
    error: Optional[str] = None


@dataclass
class CouncilReport:
    reviews: List[SpecialistReview] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {"reviews": [r.__dict__ for r in self.reviews]}


class CreativeCouncil:
    """Runs every specialist's review pass over a project via the AI
    provider layer and aggregates the results."""

    def __init__(self, provider: Optional[AIProvider] = None, provider_name: str = "openrouter",
                 model: str = "anthropic/claude-sonnet-4"):
        self.provider = provider or get_provider(provider_name)
        self.model = model
        self.specialists = SPECIALISTS

    def review_project(self, project_context: str, selected_specialists: Optional[List[str]] = None) -> CouncilReport:
        report = CouncilReport()
        roster = self.specialists
        if selected_specialists:
            wanted = {s.lower() for s in selected_specialists}
            roster = [s for s in self.specialists if s.name.lower() in wanted or s.role.lower() in wanted]

        for specialist in roster:
            system_prompt = (
                f"{specialist.get_system_prompt()} "
                f"Review the project material below strictly from your area of expertise. "
                f"Respond with 3-5 concise, concrete, actionable notes. "
                f"Do not repeat the material back; give feedback only."
            )
            try:
                result = self.provider.complete(self.model, system_prompt, project_context)
                report.reviews.append(
                    SpecialistReview(specialist=specialist.name, role=specialist.role, feedback=result.text)
                )
            except ProviderError as e:
                report.reviews.append(
                    SpecialistReview(specialist=specialist.name, role=specialist.role, feedback="", error=str(e))
                )
        return report
