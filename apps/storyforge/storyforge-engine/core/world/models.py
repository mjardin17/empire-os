"""
StoryForge World Engine -- Models
-----------------------------------
Plain dataclasses for every world entity. Kept separate from persistence
(world_engine.py) and validation (continuity.py) so any layer can be
swapped independently -- e.g. persistence can move from SQLite to
Postgres, or to Empire OS Memory, without touching these shapes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class Location:
    id: str
    world_id: str
    name: str
    location_type: str            # e.g. "kingdom", "city", "forest", "ocean", "planet"
    description: str = ""
    parent_location_id: Optional[str] = None   # for nesting (city inside a kingdom, etc.)
    coordinates: Optional[Dict[str, float]] = None  # {"x": .., "y": ..} for map placement
    attributes: Dict[str, str] = field(default_factory=dict)


@dataclass
class TimelineEvent:
    id: str
    world_id: str
    title: str
    description: str = ""
    era_order: int = 0             # sortable integer position on the timeline
    date_label: str = ""           # human-readable ("Year 300 of the Third Age")
    location_id: Optional[str] = None
    character_ids: List[str] = field(default_factory=list)


@dataclass
class Culture:
    id: str
    world_id: str
    name: str
    description: str = ""
    values: List[str] = field(default_factory=list)
    traditions: List[str] = field(default_factory=list)
    related_species_ids: List[str] = field(default_factory=list)
    attributes: Dict[str, str] = field(default_factory=dict)


@dataclass
class Government:
    id: str
    world_id: str
    name: str
    government_type: str = ""      # e.g. "monarchy", "council", "democracy"
    ruling_location_id: Optional[str] = None
    leader_character_id: Optional[str] = None
    laws: List[str] = field(default_factory=list)
    attributes: Dict[str, str] = field(default_factory=dict)


@dataclass
class Species:
    id: str
    world_id: str
    name: str
    description: str = ""
    traits: List[str] = field(default_factory=list)
    abilities: List[str] = field(default_factory=list)
    homeland_location_id: Optional[str] = None
    attributes: Dict[str, str] = field(default_factory=dict)


@dataclass
class MagicSystem:
    id: str
    world_id: str
    name: str
    source: str = ""               # where the power comes from
    rules: List[str] = field(default_factory=list)
    costs: List[str] = field(default_factory=list)
    limitations: List[str] = field(default_factory=list)


@dataclass
class TechLevel:
    id: str
    world_id: str
    name: str                      # e.g. "Bronze Age", "Steam Era"
    description: str = ""
    applies_to_location_ids: List[str] = field(default_factory=list)


@dataclass
class CharacterRelationship:
    id: str
    world_id: str
    character_a_id: str
    character_b_id: str
    relationship_type: str         # e.g. "ally", "rival", "sibling", "mentor"
    description: str = ""


@dataclass
class LoreEntry:
    id: str
    world_id: str
    title: str
    body: str
    tags: List[str] = field(default_factory=list)


@dataclass
class ContinuityIssue:
    check: str                     # which validator raised this
    severity: str                  # "error" | "warning"
    message: str
    entity_ids: List[str] = field(default_factory=list)
