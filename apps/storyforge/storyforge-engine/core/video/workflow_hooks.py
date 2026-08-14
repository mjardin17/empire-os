"""
core/video/workflow_hooks.py — real handler for the "video" workflow step.

core/automation/workflow.py ships `_handle_video` as a deliberate seam
stub ("manual_or_provider_required") because no video provider shipped
with core StoryForge. register_step_handler("video", ...) overrides
that entry — "Add or override a step type. Nothing else in the engine
changes" (workflow.py's own docstring) — so this needs no changes to
workflow.py itself.

Reads book_metadata the same way _handle_publish_platform already does
(context["book_metadata"], set by the caller before run()), plus a new
context["cover_image_path"] convention the caller sets after Phase 4's
cover generation. Missing cover -> trailer still renders, just without
one; missing book_metadata -> step fails cleanly (not a crash) so the
workflow's own on_failure routing handles it, same as every other
handler here.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict

from core.video.video_studio import VideoStudio

_video_studio = VideoStudio(db_path="storyforge_videos.db", output_dir="generated_videos")

# YouTube is deliberately never in this default list. Standing rule
# (this workspace's CLAUDE.md): YouTube uploads always require manual
# approval, never automatic -- video-bot-pipeline's own
# social_clips/auto_publisher.py already respects this itself
# (publish_youtube_short() stages a .bat for Josh to run rather than
# posting), but this handler doesn't rely on that downstream safety
# net -- it just never queues youtube_shorts in the first place.
_DEFAULT_DISTRIBUTION_PLATFORMS = ["instagram", "tiktok", "facebook"]


def _handle_video_real(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("book_metadata")
    if metadata is None:
        return {"status": "error", "message": "context['book_metadata'] is required for the video step"}

    cover_image_path = context.get("cover_image_path") or config.get("cover_image_path")
    provider = config.get("provider", "video_pipeline")
    size = config.get("size", "1080x1920")

    asset = _video_studio.generate_video(
        project_id=getattr(metadata, "project_id", "") or config.get("project_id", ""),
        video_type=config.get("video_type", "book_trailer"),
        title=getattr(metadata, "title", "") or config.get("title", ""),
        description=getattr(metadata, "description", "") or config.get("description", ""),
        provider=provider,
        cover_image_path=cover_image_path,
        author=getattr(metadata, "author", ""),
        size=size,
    )

    context["video_output_path"] = asset.output_path
    return {
        "status": asset.status,
        "video_id": asset.id,
        "output_path": asset.output_path,
        "provider": asset.provider,
    }


def _video_pipeline_path() -> str | None:
    raw = os.environ.get("VIDEO_PIPELINE_PATH", "")
    if not raw or not Path(raw).exists():
        return None
    return raw


def _handle_distribute_social(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Queues the trailer for cross-platform posting via
    video-bot-pipeline's existing crosspost_bridge.py -- reuses that
    proven queue/publish infrastructure rather than building a second
    one here. Instagram posting is real there; TikTok/Facebook are
    still stubs in that pipeline as of this writing (queued safely,
    just won't actually post yet) -- that's video-bot-pipeline's status
    to fix, not something this handler papers over or duplicates."""
    video_path = context.get("video_output_path")
    if not video_path or not Path(video_path).exists():
        return {"status": "skipped", "message": "no video_output_path in context — run the video step first"}

    path = _video_pipeline_path()
    if path is None:
        return {"status": "skipped", "message": "VIDEO_PIPELINE_PATH not configured"}
    if path not in sys.path:
        sys.path.insert(0, path)

    try:
        from lib.crosspost_bridge import queue_commercial_for_posting
    except ImportError as e:
        return {"status": "error", "message": f"could not import crosspost_bridge: {e}"}

    metadata = context.get("book_metadata")
    title = getattr(metadata, "title", "") or config.get("title", "Untitled")
    book_id = getattr(metadata, "id", "") or config.get("book_id", "")
    platforms = config.get("platforms", _DEFAULT_DISTRIBUTION_PLATFORMS)

    ok = queue_commercial_for_posting(video_path, title, book_id, platforms=platforms)
    return {"status": "queued" if ok else "error", "platforms": platforms, "video_path": video_path}


def register() -> None:
    from core.automation.workflow import register_step_handler
    register_step_handler("video", _handle_video_real)
    register_step_handler("distribute_social", _handle_distribute_social)
