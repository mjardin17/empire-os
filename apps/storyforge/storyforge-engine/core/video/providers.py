"""
core/video/providers.py — book trailer generation via video-bot-pipeline.

render_commercial.py (video-bot-pipeline repo root) was built as a
dedicated "N images + narration -> short vertical MP4" tool, explicitly
because the main episode renderer (empire_render.py) couldn't handle
non-episode content. A book trailer is exactly that shape, so this
provider builds a commercial-script JSON from a book's title/
description/cover and calls render_commercial() directly rather than
duplicating any FFmpeg/TTS logic here.

Same VIDEO_PIPELINE_PATH-gated sys.path pattern as
core/image/video_pipeline_provider.py.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional

from core.ai.provider import ProviderError
from core.video.models import VideoGenerationResult


def _video_pipeline_path() -> Optional[Path]:
    raw = os.environ.get("VIDEO_PIPELINE_PATH", "")
    if not raw:
        return None
    path = Path(raw)
    return path if path.exists() else None


class VideoProvider(ABC):
    name: str = "base"

    @abstractmethod
    def generate(
        self,
        title: str,
        description: str,
        output_dir: str,
        cover_image_path: Optional[str] = None,
        author: str = "",
        size: str = "1080x1920",
        extra: Optional[Dict[str, Any]] = None,
    ) -> VideoGenerationResult:
        ...

    def is_configured(self) -> bool:
        return True

    @staticmethod
    def _new_output_path(output_dir: str, provider_name: str, ext: str = "mp4") -> str:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        return str(Path(output_dir) / f"{provider_name}_{uuid.uuid4().hex}.{ext}")


def _build_trailer_script(title: str, description: str, cover_image_path: Optional[str], author: str) -> Dict[str, Any]:
    """A 4-scene commercial script matching render_commercial.py's exact
    scene-type contract (title / product_showcase / description /
    price_and_cta — verified against render_scene()'s handling of each)."""
    cover_ref = [cover_image_path] if cover_image_path and Path(cover_image_path).exists() else []
    hook = description.strip().split(".")[0].strip() if description.strip() else title
    return {
        "audio": {"voice": "af_sarah"},
        "scenes": [
            {"type": "title", "duration": 4, "text": title, "product_images": cover_ref},
            {
                "type": "product_showcase", "duration": 6, "product_images": cover_ref,
                "caption": f"by {author}" if author else "",
                "audio": f"tts:{hook}" if hook else "",
            },
            {
                "type": "description", "duration": 8, "product_images": cover_ref,
                "audio": f"tts:{description.strip()[:600]}" if description.strip() else "",
            },
            {
                "type": "price_and_cta", "duration": 4, "product_images": cover_ref,
                "price": "Available Now", "cta_button": "Get Your Copy",
            },
        ],
    }


class VideoPipelineVideoProvider(VideoProvider):
    name = "video_pipeline"

    def is_configured(self) -> bool:
        return _video_pipeline_path() is not None

    def generate(
        self,
        title: str,
        description: str,
        output_dir: str,
        cover_image_path: Optional[str] = None,
        author: str = "",
        size: str = "1080x1920",
        extra: Optional[Dict[str, Any]] = None,
    ) -> VideoGenerationResult:
        path = _video_pipeline_path()
        if path is None:
            raise ProviderError(
                "VIDEO_PIPELINE_PATH is not set or doesn't exist — "
                "video_pipeline video provider is unavailable."
            )

        path_str = str(path)
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

        try:
            from render_commercial import render_commercial
        except ImportError as e:
            raise ProviderError(f"Could not import render_commercial from video-bot-pipeline: {e}") from e

        script = _build_trailer_script(title, description, cover_image_path, author)

        with tempfile.TemporaryDirectory(prefix="storyforge_trailer_") as tmp:
            script_path = Path(tmp) / "trailer_script.json"
            script_path.write_text(json.dumps(script, indent=2), encoding="utf-8")

            out_path = Path(self._new_output_path(output_dir, self.name, ext="mp4"))
            music_path_str = (extra or {}).get("music_path")
            music_path = Path(music_path_str) if music_path_str else None

            ok = render_commercial(script_path, out_path, size=size, music_path=music_path)

        if not ok or not out_path.exists():
            raise ProviderError(f"render_commercial produced no video for {title!r}")

        return VideoGenerationResult(output_path=str(out_path), provider=self.name, size=size)


_VIDEO_PROVIDERS: Dict[str, type] = {
    "video_pipeline": VideoPipelineVideoProvider,
}


def register_video_provider(name: str, provider_cls: type) -> None:
    """Add or override a video provider. Same extensibility pattern as
    core/ai/provider.py and core/image/providers.py — mainly useful for
    tests to register a fake/offline provider without touching this file."""
    _VIDEO_PROVIDERS[name] = provider_cls


def get_video_provider(name: str) -> VideoProvider:
    if name not in _VIDEO_PROVIDERS:
        raise ProviderError(
            f"Unknown video provider '{name}'. Available: {', '.join(_VIDEO_PROVIDERS.keys())}. "
            f"Add new adapters by subclassing VideoProvider and registering in _VIDEO_PROVIDERS."
        )
    return _VIDEO_PROVIDERS[name]()


def list_video_providers() -> Dict[str, bool]:
    return {name: cls().is_configured() for name, cls in _VIDEO_PROVIDERS.items()}
