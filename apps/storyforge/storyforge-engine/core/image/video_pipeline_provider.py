"""
core/image/video_pipeline_provider.py — real book covers/illustrations
via the sibling video-bot-pipeline repo's image generation.

video-bot-pipeline already has a proven image-generation waterfall
(Wikimedia -> Gemini image gen -> Pollinations) used to produce
episode scene art. `empire_render.fetch_one_scene_image()` is the one
function in that stack with no episode/channel coupling — exactly
"generate one image for one prompt" — so this provider imports it
directly via a runtime sys.path addition rather than duplicating any
of that logic here.

Gated entirely behind VIDEO_PIPELINE_PATH: unset or pointing at a path
that doesn't exist -> is_configured() reports False and this provider
is simply unavailable, same as every other provider here when its
credentials/service aren't present. No subprocess, no HTTP service to
keep running — a plain in-process import, since both are Python.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from core.ai.provider import ProviderError
from core.image.models import GenerationResult
from core.image.providers import ImageProvider


def _video_pipeline_path() -> Optional[Path]:
    raw = os.environ.get("VIDEO_PIPELINE_PATH", "")
    if not raw:
        return None
    path = Path(raw)
    return path if path.exists() else None


class VideoPipelineImageProvider(ImageProvider):
    name = "video_pipeline"

    def is_configured(self) -> bool:
        return _video_pipeline_path() is not None

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: Optional[int],
        model: str,
        output_dir: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> GenerationResult:
        path = _video_pipeline_path()
        if path is None:
            raise ProviderError(
                "VIDEO_PIPELINE_PATH is not set or doesn't exist — "
                "video_pipeline image provider is unavailable."
            )

        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

        try:
            from empire_render import fetch_one_scene_image
        except ImportError as e:
            raise ProviderError(f"Could not import fetch_one_scene_image from video-bot-pipeline: {e}") from e

        dest = Path(self._new_output_path(output_dir, self.name, ext="png"))
        tag = (extra or {}).get("tag", "storyforge_cover")

        ok = fetch_one_scene_image(prompt=prompt, work_dir=dest.parent, tag=tag, dest=dest)
        if not ok or not dest.exists():
            raise ProviderError(f"fetch_one_scene_image produced no image for prompt: {prompt!r}")

        return GenerationResult(
            output_path=str(dest),
            provider=self.name,
            model=model or "video-pipeline-waterfall",
            width=width,
            height=height,
            seed=seed,
        )
