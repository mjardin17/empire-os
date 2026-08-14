"""
core/video/video_studio.py — Video Studio.

Persistent, provider-agnostic book-trailer generation. Same pattern as
core/image/image_studio.py: every attempt is recorded before the
provider runs (so a crash mid-render still leaves an auditable
pending/failed row), backed by SQLite, provider selection fully
pluggable via core/video/providers.py.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from core.ai.provider import ProviderError
from core.video.models import VIDEO_TYPES, VideoAsset
from core.video.providers import get_video_provider


_SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    video_type TEXT NOT NULL,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output_path TEXT,
    size TEXT NOT NULL DEFAULT '1080x1920',
    duration_sec REAL,
    error_message TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(video_type);
"""


class VideoStudioError(ValueError):
    """Bad input (unknown video_type, etc.) -- maps to 400, distinct
    from ProviderError (502/upstream), same split as ImageStudioError."""


def _row_to_asset(row: sqlite3.Row) -> VideoAsset:
    return VideoAsset(
        id=row["id"],
        project_id=row["project_id"],
        video_type=row["video_type"],
        title=row["title"],
        provider=row["provider"],
        status=row["status"],
        output_path=row["output_path"],
        size=row["size"],
        duration_sec=row["duration_sec"],
        error_message=row["error_message"],
        metadata=json.loads(row["metadata"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class VideoStudio:
    def __init__(self, db_path: str = "storyforge_videos.db", output_dir: str = "generated_videos"):
        self.db_path = db_path
        self.output_dir = output_dir
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def generate_video(
        self,
        project_id: str,
        video_type: str,
        title: str,
        description: str,
        provider: str = "video_pipeline",
        cover_image_path: Optional[str] = None,
        author: str = "",
        size: str = "1080x1920",
        extra: Optional[Dict[str, Any]] = None,
    ) -> VideoAsset:
        if video_type not in VIDEO_TYPES:
            raise VideoStudioError(f"Unknown video_type '{video_type}'. Valid types: {', '.join(sorted(VIDEO_TYPES))}")
        if not title.strip():
            raise VideoStudioError("title must not be empty")

        now = time.time()
        video_id = str(uuid.uuid4())

        self._conn.execute(
            """INSERT INTO videos (id, project_id, video_type, title, provider, status, size, metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'pending', ?, '{}', ?, ?)""",
            (video_id, project_id, video_type, title, provider, size, now, now),
        )
        self._conn.commit()

        try:
            adapter = get_video_provider(provider)
            result = adapter.generate(
                title=title, description=description, output_dir=self.output_dir,
                cover_image_path=cover_image_path, author=author, size=size, extra=extra,
            )
        except ProviderError as e:
            self._mark_failed(video_id, str(e))
            raise
        except Exception as e:  # noqa: BLE001 -- any adapter bug still lands as a recorded failure
            self._mark_failed(video_id, f"unexpected error: {e}")
            raise

        self._conn.execute(
            """UPDATE videos SET status = 'completed', output_path = ?, provider = ?,
               size = ?, duration_sec = ?, metadata = ?, updated_at = ? WHERE id = ?""",
            (result.output_path, result.provider, result.size, result.duration_sec,
             json.dumps(result.raw or {}), time.time(), video_id),
        )
        self._conn.commit()
        return self.get_video(video_id)

    def _mark_failed(self, video_id: str, message: str) -> None:
        self._conn.execute(
            "UPDATE videos SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
            (message, time.time(), video_id),
        )
        self._conn.commit()

    def get_video(self, video_id: str) -> Optional[VideoAsset]:
        row = self._conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return _row_to_asset(row) if row else None

    def list_videos(self, project_id: str, video_type: Optional[str] = None) -> List[VideoAsset]:
        if video_type:
            rows = self._conn.execute(
                "SELECT * FROM videos WHERE project_id = ? AND video_type = ? ORDER BY created_at DESC",
                (project_id, video_type),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM videos WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
            ).fetchall()
        return [_row_to_asset(r) for r in rows]
