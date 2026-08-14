"""
core/video/router.py — Video Studio endpoint.

Additive APIRouter, same pattern as core/book/router.py and
empire_hooks/router.py.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.ai.provider import ProviderError
from core.video.providers import list_video_providers
from core.video.video_studio import VideoStudio, VideoStudioError

video_router = APIRouter(prefix="/videos", tags=["video-generation"])

# Same db_path/output_dir convention as _image_studio in main.py.
_video_studio = VideoStudio(db_path="storyforge_videos.db", output_dir="generated_videos")


class GenerateVideoRequest(BaseModel):
    project_id: str
    video_type: str = "book_trailer"
    title: str
    description: str = ""
    provider: str = "video_pipeline"
    cover_image_path: Optional[str] = None
    author: str = ""
    size: str = "1080x1920"
    extra: Optional[Dict[str, Any]] = None


@video_router.get("/providers")
def video_providers():
    return {"providers": list_video_providers()}


@video_router.post("/generate")
def generate_video_endpoint(req: GenerateVideoRequest):
    try:
        asset = _video_studio.generate_video(
            project_id=req.project_id,
            video_type=req.video_type,
            title=req.title,
            description=req.description,
            provider=req.provider,
            cover_image_path=req.cover_image_path,
            author=req.author,
            size=req.size,
            extra=req.extra,
        )
    except VideoStudioError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return asset


@video_router.get("/{video_id}")
def get_video_endpoint(video_id: str):
    asset = _video_studio.get_video(video_id)
    if not asset:
        raise HTTPException(status_code=404, detail="video not found")
    return asset


@video_router.get("")
def list_videos_endpoint(project_id: str, video_type: Optional[str] = None):
    return _video_studio.list_videos(project_id, video_type)
