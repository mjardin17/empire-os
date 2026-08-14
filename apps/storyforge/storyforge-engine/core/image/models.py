"""
StoryForge Image Studio -- Models
-----------------------------------
Plain dataclasses for image generation requests/results, kept separate
from persistence (image_studio.py) and provider adapters (providers.py)
so any layer can be swapped independently -- same pattern as
core/world/models.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


# Canonical image "purposes" Image Studio understands. Callers may pass
# any value; unknown values are rejected with a clear error so bad data
# never silently lands in storage. Add new categories here as StoryForge
# grows -- nothing else needs to change.
IMAGE_TYPES = {
    "character_sheet",
    "expression_sheet",
    "turnaround",
    "scene_illustration",
    "background",
    "prop",
    "book_cover",
    "coloring_page",
    "thumbnail",
    "merchandise_art",
}

# Lifecycle states for a generation record.
IMAGE_STATUSES = {"pending", "completed", "failed"}


@dataclass
class GenerationResult:
    """What a provider adapter hands back after a successful generation."""

    output_path: str
    provider: str
    model: str
    width: int
    height: int
    seed: Optional[int] = None
    raw: Optional[Dict[str, Any]] = None


@dataclass
class ImageAsset:
    """A single generated (or in-flight) image, with full provenance and
    every link needed to place it in the story graph."""

    id: str
    project_id: str
    image_type: str
    prompt: str
    negative_prompt: str = ""
    provider: str = ""
    model: str = ""
    seed: Optional[int] = None
    width: int = 1024
    height: int = 1024
    status: str = "pending"
    output_path: Optional[str] = None
    error_message: Optional[str] = None

    # Links into the rest of StoryForge. All optional -- an image can be
    # a standalone project asset (e.g. a thumbnail) with no character,
    # scene, or world attached.
    character_id: Optional[str] = None
    scene_id: Optional[str] = None
    world_id: Optional[str] = None

    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    updated_at: float = 0.0
