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

from typing import Any, Dict

from core.video.video_studio import VideoStudio

_video_studio = VideoStudio(db_path="storyforge_videos.db", output_dir="generated_videos")


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


def register() -> None:
    from core.automation.workflow import register_step_handler
    register_step_handler("video", _handle_video_real)
