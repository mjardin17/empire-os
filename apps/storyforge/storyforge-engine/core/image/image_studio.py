"""
StoryForge Image Studio
-------------------------
Persistent, provider-agnostic image generation. Every generated (or
attempted) image is recorded with its full prompt, provider, model,
seed, dimensions, status, output path, and links back into the story
graph (character / scene / world / project) -- so nothing is ever
generated and then lost, and every image is reproducible and
attributable.

Backed by SQLite (stdlib), same pattern as
`core/memory/character_memory.py` and `core/world/world_engine.py`.
Swap `db_path` for a real Postgres DSN later without changing the
public API -- this class is the seam.

Provider selection is fully pluggable via `core/image/providers.py`;
Image Studio itself never imports a specific provider by name except
through the registry, so adding a new backend never touches this file.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from core.ai.provider import ProviderError
from core.image.models import IMAGE_STATUSES, IMAGE_TYPES, ImageAsset
from core.image.providers import get_image_provider


_SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    image_type TEXT NOT NULL,
    prompt TEXT NOT NULL,
    negative_prompt TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    seed INTEGER,
    width INTEGER NOT NULL DEFAULT 1024,
    height INTEGER NOT NULL DEFAULT 1024,
    status TEXT NOT NULL DEFAULT 'pending',
    output_path TEXT,
    error_message TEXT,
    character_id TEXT,
    scene_id TEXT,
    world_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
CREATE INDEX IF NOT EXISTS idx_images_character ON images(character_id);
CREATE INDEX IF NOT EXISTS idx_images_scene ON images(scene_id);
CREATE INDEX IF NOT EXISTS idx_images_world ON images(world_id);
CREATE INDEX IF NOT EXISTS idx_images_type ON images(image_type);
"""


class ImageStudioError(ValueError):
    """Raised for bad input (unknown image_type/status, etc.) -- maps to
    a 400 in the REST layer, distinct from ProviderError (502/upstream)."""


def _row_to_asset(row: sqlite3.Row) -> ImageAsset:
    return ImageAsset(
        id=row["id"],
        project_id=row["project_id"],
        image_type=row["image_type"],
        prompt=row["prompt"],
        negative_prompt=row["negative_prompt"],
        provider=row["provider"],
        model=row["model"],
        seed=row["seed"],
        width=row["width"],
        height=row["height"],
        status=row["status"],
        output_path=row["output_path"],
        error_message=row["error_message"],
        character_id=row["character_id"],
        scene_id=row["scene_id"],
        world_id=row["world_id"],
        metadata=json.loads(row["metadata"] or "{}"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class ImageStudio:
    def __init__(self, db_path: str = "storyforge_images.db", output_dir: str = "generated_images"):
        self.db_path = db_path
        self.output_dir = output_dir
        # check_same_thread=False: FastAPI runs sync endpoints in a
        # threadpool, so the same connection is legitimately reused
        # across worker threads. All access here is still effectively
        # serialized by the GIL + short-lived cursors, matching the
        # existing CharacterMemory/WorldEngine usage pattern.
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # -- generation -------------------------------------------------

    def generate_image(
        self,
        project_id: str,
        image_type: str,
        prompt: str,
        provider: str = "placeholder",
        negative_prompt: str = "",
        model: str = "",
        seed: Optional[int] = None,
        width: int = 1024,
        height: int = 1024,
        character_id: Optional[str] = None,
        scene_id: Optional[str] = None,
        world_id: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> ImageAsset:
        if image_type not in IMAGE_TYPES:
            raise ImageStudioError(
                f"Unknown image_type '{image_type}'. Valid types: {', '.join(sorted(IMAGE_TYPES))}"
            )
        if not prompt.strip():
            raise ImageStudioError("prompt must not be empty")

        now = time.time()
        image_id = str(uuid.uuid4())

        # Record the attempt *before* calling the provider, so a crash
        # mid-generation still leaves an auditable "pending"/"failed"
        # row instead of silently losing the request.
        self._conn.execute(
            """INSERT INTO images
               (id, project_id, image_type, prompt, negative_prompt, provider, model,
                seed, width, height, status, character_id, scene_id, world_id,
                metadata, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, '{}', ?, ?)""",
            (
                image_id, project_id, image_type, prompt, negative_prompt, provider, model,
                seed, width, height, character_id, scene_id, world_id, now, now,
            ),
        )
        self._conn.commit()

        try:
            adapter = get_image_provider(provider)
            result = adapter.generate(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                seed=seed,
                model=model,
                output_dir=self.output_dir,
                extra=extra,
            )
        except ProviderError as e:
            self._mark_failed(image_id, str(e))
            raise
        except Exception as e:  # noqa: BLE001 -- any adapter bug still lands as a recorded failure
            self._mark_failed(image_id, f"unexpected error: {e}")
            raise

        self._conn.execute(
            """UPDATE images
               SET status = 'completed', output_path = ?, provider = ?, model = ?,
                   seed = ?, width = ?, height = ?, metadata = ?, updated_at = ?
               WHERE id = ?""",
            (
                result.output_path, result.provider, result.model, result.seed,
                result.width, result.height, json.dumps(result.raw or {}), time.time(),
                image_id,
            ),
        )
        self._conn.commit()
        return self.get_image(image_id)

    def _mark_failed(self, image_id: str, message: str) -> None:
        self._conn.execute(
            "UPDATE images SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
            (message, time.time(), image_id),
        )
        self._conn.commit()

    # -- retrieval ----------------------------------------------------

    def get_image(self, image_id: str) -> Optional[ImageAsset]:
        row = self._conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        return _row_to_asset(row) if row else None

    def list_images(
        self,
        project_id: Optional[str] = None,
        character_id: Optional[str] = None,
        scene_id: Optional[str] = None,
        world_id: Optional[str] = None,
        image_type: Optional[str] = None,
        provider: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> List[ImageAsset]:
        if status is not None and status not in IMAGE_STATUSES:
            raise ImageStudioError(f"Unknown status '{status}'. Valid statuses: {', '.join(sorted(IMAGE_STATUSES))}")

        clauses, params = [], []
        for column, value in (
            ("project_id", project_id),
            ("character_id", character_id),
            ("scene_id", scene_id),
            ("world_id", world_id),
            ("image_type", image_type),
            ("provider", provider),
            ("status", status),
        ):
            if value is not None:
                clauses.append(f"{column} = ?")
                params.append(value)

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        rows = self._conn.execute(
            f"SELECT * FROM images {where} ORDER BY created_at DESC LIMIT ?", params
        ).fetchall()
        return [_row_to_asset(r) for r in rows]

    def delete_image(self, image_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def close(self) -> None:
        self._conn.close()


def asset_to_dict(asset: ImageAsset) -> Dict[str, Any]:
    return asdict(asset)
