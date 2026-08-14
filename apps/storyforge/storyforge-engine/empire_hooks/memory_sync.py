"""
Empire OS Memory Sync — StoryForge integration seam.

Implements WorldMemorySync so every World Engine write (locations,
timeline events, cultures, etc.) is forwarded to the Empire OS
Memory Bus without changing a single line of existing StoryForge code.

Activation: set EMPIRE_OS_MEMORY_URL env var.
Without it this behaves identically to NullMemorySync (silent no-op).

Usage in main.py (additive — one change):
    from empire_hooks.memory_sync import make_sync
    ...
    _world_engine = WorldEngine(db_path="...", sync=make_sync())
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

from core.world.world_engine import WorldMemorySync

log = logging.getLogger(__name__)

EMPIRE_MEMORY_URL: str = os.getenv("EMPIRE_OS_MEMORY_URL", "").rstrip("/")
EMPIRE_EVENT_URL: str = os.getenv("EMPIRE_OS_EVENT_URL", "").rstrip("/")
TIMEOUT_SECONDS: int = 2


def _post(url: str, payload: dict) -> None:
    """Fire-and-forget HTTP POST. Logs on failure, never raises."""
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS):
            pass
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        log.debug("[EmpireSync] %s POST failed (non-fatal): %s", url, exc)


class EmpireMemorySync(WorldMemorySync):
    """
    Forwards every World Engine write to the Empire OS Memory Bus.
    Constructs a stable Memory Bus key: storyforge:world:<entity_type>:<entity_id>

    Also emits an event to the Empire OS Event Bus (agent.action topic)
    when EMPIRE_OS_EVENT_URL is configured.

    All failures are logged at DEBUG level — StoryForge keeps working
    whether Empire OS is up or not.
    """

    def on_write(self, entity_type: str, entity_id: str, payload: dict) -> None:
        if EMPIRE_MEMORY_URL:
            _post(
                f"{EMPIRE_MEMORY_URL}/write",
                {
                    "key": f"storyforge:world:{entity_type}:{entity_id}",
                    "value": payload,
                    "scope": "module",
                    "moduleId": "storyforge",
                    "tags": ["storyforge", "world-engine", entity_type],
                },
            )

        if EMPIRE_EVENT_URL:
            _post(
                f"{EMPIRE_EVENT_URL}/publish",
                {
                    "topic": "agent.action",
                    "source": "storyforge",
                    "payload": {
                        "action": "world.write",
                        "entityType": entity_type,
                        "entityId": entity_id,
                    },
                },
            )


def make_sync() -> WorldMemorySync:
    """
    Return EmpireMemorySync if EMPIRE_OS_MEMORY_URL is configured,
    otherwise NullMemorySync. Call this once at app startup.
    """
    from core.world.world_engine import NullMemorySync

    if EMPIRE_MEMORY_URL:
        log.info("[EmpireSync] Memory sync active → %s", EMPIRE_MEMORY_URL)
        return EmpireMemorySync()
    else:
        log.info("[EmpireSync] No EMPIRE_OS_MEMORY_URL set — using NullMemorySync")
        return NullMemorySync()
