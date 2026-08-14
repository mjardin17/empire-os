"""
core/video/models.py — data shapes for the Video Studio.

Mirrors core/image/models.py's ImageAsset/GenerationResult split, but a
book trailer isn't "one prompt in, one video out" the way an
illustration is — it's built from a whole book (title, description,
cover), so VideoGenerationResult takes book fields directly rather than
a single free-text prompt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

VIDEO_TYPES = {"book_trailer", "promo_clip"}
VIDEO_STATUSES = {"pending", "completed", "failed"}


@dataclass
class VideoGenerationResult:
    """What a VideoProvider adapter hands back after a successful render."""

    output_path: str
    provider: str
    size: str
    duration_sec: Optional[float] = None
    raw: Optional[Dict[str, Any]] = None


@dataclass
class VideoAsset:
    """A single generated (or in-flight) video, with provenance —
    same persistence shape as ImageAsset."""

    id: str
    project_id: str
    video_type: str
    title: str
    provider: str = ""
    status: str = "pending"
    output_path: Optional[str] = None
    size: str = "1080x1920"
    duration_sec: Optional[float] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    updated_at: float = 0.0
