"""
storyforge2/dedup.py — content-hash duplicate detection.

Same technique already proven in this repo's video pipeline
(auto_render.py's _used_image_hashes.json / _USED_IMAGE_HASHES set) —
reused here, not reimplemented differently, but in Story Forge 2's own
namespace so it never collides with the video pipeline's episode-scene
hash history.

Standing rule this repo already enforces for video scenes ("No scene
reuse — ever," CLAUDE.md) — this module is what lets Story Forge 2
apply the same rule to book illustrations and manuscript text, which
had no enforcement anywhere before this.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
from pathlib import Path


class DuplicateContentStore:
    """Tracks content hashes already used within a project (or across
    projects, if given a shared path) so an image or a chunk of text
    doesn't get generated-and-accepted twice."""

    def __init__(self, path: str = "storyforge2_used_hashes.json"):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._hashes: set[str] = self._load()

    def _load(self) -> set[str]:
        if not self.path.exists():
            return set()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return set(data.get("hashes", []))
        except (json.JSONDecodeError, OSError):
            return set()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True) if self.path.parent != Path(".") else None
        self.path.write_text(json.dumps({"hashes": sorted(self._hashes)}, indent=2), encoding="utf-8")

    @staticmethod
    def hash_bytes(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def hash_file(path: str | Path) -> str:
        return DuplicateContentStore.hash_bytes(Path(path).read_bytes())

    @staticmethod
    def hash_text(text: str) -> str:
        """Normalized so trivial whitespace/casing differences don't
        defeat dedup — this is exact-duplicate detection (like the
        video pipeline's image hashing), not near-duplicate/plagiarism
        detection, which is a heavier, separate capability."""
        normalized = re.sub(r"\s+", " ", text.strip().lower())
        return DuplicateContentStore.hash_bytes(normalized.encode("utf-8"))

    def is_duplicate(self, content_hash: str) -> bool:
        with self._lock:
            return content_hash in self._hashes

    def register(self, content_hash: str) -> None:
        with self._lock:
            self._hashes.add(content_hash)
            self._save()

    def check_and_register(self, content_hash: str) -> bool:
        """Returns True if this hash was already seen (a duplicate);
        registers it either way so the check is also the record."""
        with self._lock:
            is_dup = content_hash in self._hashes
            self._hashes.add(content_hash)
            self._save()
            return is_dup
