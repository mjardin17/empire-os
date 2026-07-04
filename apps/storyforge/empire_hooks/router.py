"""
Empire OS Router — additive FastAPI endpoints for Module Gateway integration.

Add to main.py (two lines, additive only):
    from empire_hooks.router import empire_router, setup_event_bridge
    app.include_router(empire_router)
    setup_event_bridge(_automation_studio)   # Phase 5 — wire event bridge

Endpoints:
    GET  /empire/health   — polled every 30s by Empire OS Module Gateway
    GET  /empire/status   — full module descriptor for ModuleGateway.register()
    POST /empire/event    — receive events from Empire OS Event Bus
"""

from __future__ import annotations

import os
import time
import json
import logging
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)

empire_router = APIRouter(prefix="/empire", tags=["empire-os"])

_START_TIME = time.time()

MODULE_ID = "storyforge"
MODULE_VERSION = "5.0.0"
MODULE_BASE_URL = os.getenv("STORYFORGE_BASE_URL", "http://localhost:8001")
EMPIRE_EVENT_URL = os.getenv("EMPIRE_OS_EVENT_URL", "").rstrip("/")

# ── Event bridge (Phase 5) ─────────────────────────────────────────────────────

# Maps StoryForge Phase 5 event types to Empire OS TOPICS constants.
# Events not in this map are forwarded as-is under "agent.action".
_EVENT_TOPIC_MAP: Dict[str, str] = {
    "story.approved":             "script.created",
    "images.finished":            "render.completed",
    "video.finished":             "render.completed",
    "book.exported":              "agent.action",
    "published":                  "episode.uploaded",
    "campaign.started":           "agent.action",
    "campaign.completed":         "agent.action",
    "sales.milestone":            "agent.action",
    "analytics.updated":          "agent.action",
    "project.ready":              "agent.action",
    "format.generated":           "agent.action",
    "workflow.started":           "workflow.started",
    "workflow.step_completed":    "workflow.step.completed",
    "workflow.completed":         "workflow.completed",
    "workflow.failed":            "workflow.failed",
    "job.scheduled":              "agent.action",
    "job.succeeded":              "agent.action",
    "job.failed":                 "agent.error",
    "job.retrying":               "agent.action",
    "recommendation.generated":   "agent.action",
}


def _forward_to_empire(event_record) -> None:
    """Fire-and-forget: push a StoryForge event to the Empire OS Event Bus."""
    if not EMPIRE_EVENT_URL:
        return
    empire_topic = _EVENT_TOPIC_MAP.get(event_record.event_type, "agent.action")
    try:
        payload = json.dumps({
            "topic": empire_topic,
            "source": "storyforge",
            "payload": {
                "storyforgeTopic": event_record.event_type,
                "projectId": event_record.project_id,
                "campaignId": event_record.campaign_id,
                **event_record.payload,
            },
            "correlationId": event_record.id,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{EMPIRE_EVENT_URL}/publish",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        log.debug("[EmpireBridge] event forward failed (non-fatal): %s", exc)


def setup_event_bridge(automation_studio) -> None:
    """
    Wire StoryForge Phase 5 EventBus → Empire OS Event Bus.

    Call once at app startup after creating AutomationStudio:

        from empire_hooks.router import empire_router, setup_event_bridge
        app.include_router(empire_router)
        setup_event_bridge(_automation_studio)

    Every event the automation studio emits will be forwarded to the
    Empire OS Event Bus. If EMPIRE_OS_EVENT_URL is not set, this is a
    safe no-op (events still fire internally, just not forwarded).
    """
    if not EMPIRE_EVENT_URL:
        log.info("[EmpireBridge] No EMPIRE_OS_EVENT_URL set — event bridge inactive")
        return
    automation_studio.events.subscribe(_forward_to_empire, event_type=None)
    log.info("[EmpireBridge] Event bridge active → %s", EMPIRE_EVENT_URL)


# ── Health & Status ────────────────────────────────────────────────────────────

@empire_router.get("/health")
def empire_health():
    """
    Health endpoint polled by Empire OS Module Gateway every 30s.
    Returns 200 + JSON while the process is alive.
    """
    return {
        "status": "healthy",
        "moduleId": MODULE_ID,
        "version": MODULE_VERSION,
        "phases": [1, 2, 3, 4, 5],
        "uptimeSeconds": round(time.time() - _START_TIME, 1),
        "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@empire_router.get("/status")
def empire_status():
    """
    Full ModuleDescriptor for Empire OS ModuleGateway.register().
    """
    return {
        "id": MODULE_ID,
        "name": "StoryForge Engine",
        "version": MODULE_VERSION,
        "description": (
            "Narrative synthesis + publishing + automation engine. "
            "Phases 1-5: story science, character memory, world engine, image studio, "
            "publishing intelligence, empire automation studio (campaigns, formats, workflows, scheduler)."
        ),
        "capabilities": [
            # Phase 1
            "story-science", "character-memory", "character-get", "council-review", "book-export",
            # Phase 2
            "world-engine", "world-search", "continuity-validate",
            # Phase 3
            "image-generate", "image-list",
            # Phase 4
            "publishing-studio", "market-research", "design-brief", "book-metadata",
            "listing-copy", "marketing-generate", "platform-export", "approve-publish",
            # Phase 5
            "automation-ready", "automation-status", "format-generate", "format-generate-all",
            "campaign-create", "campaign-start", "campaign-improve", "analytics-record",
            "analytics-summary", "workflow-run", "schedule-job", "event-poll",
        ],
        "endpoints": [
            # Phase 1
            {"path": "/science/analyze",                "method": "POST"},
            {"path": "/characters",                      "method": "POST"},
            {"path": "/council/review",                  "method": "POST"},
            {"path": "/book/export/epub",                "method": "POST"},
            # Phase 2
            {"path": "/worlds",                          "method": "POST"},
            {"path": "/worlds/{id}/encyclopedia/search", "method": "GET"},
            {"path": "/worlds/{id}/continuity/validate", "method": "GET"},
            # Phase 3
            {"path": "/images/generate",                 "method": "POST"},
            {"path": "/images",                          "method": "GET"},
            # Phase 4
            {"path": "/publishing/research/analyze",     "method": "POST"},
            {"path": "/publishing/approve",              "method": "POST"},
            # Phase 5
            {"path": "/automation/projects/{id}/ready",  "method": "POST"},
            {"path": "/automation/projects/{id}/status", "method": "GET"},
            {"path": "/automation/format-packages/generate", "method": "POST"},
            {"path": "/automation/format-packages/generate-all", "method": "POST"},
            {"path": "/automation/campaigns",            "method": "POST"},
            {"path": "/automation/campaigns/{id}/start", "method": "POST"},
            {"path": "/automation/campaigns/{id}/improve","method": "POST"},
            {"path": "/automation/analytics/metrics",    "method": "POST"},
            {"path": "/automation/workflows",            "method": "POST"},
            {"path": "/automation/workflows/{id}/run",   "method": "POST"},
            {"path": "/automation/schedule",             "method": "POST"},
            {"path": "/automation/events",               "method": "GET"},
            {"path": "/empire/health",                   "method": "GET", "auth": False},
            {"path": "/empire/status",                   "method": "GET", "auth": False},
        ],
        "healthPath": "/empire/health",
        "baseUrl": MODULE_BASE_URL,
        "priority": 20,
    }


# ── Inbound Empire OS events ───────────────────────────────────────────────────

class EmpireEvent(BaseModel):
    topic: str
    source: str
    payload: Optional[Dict[str, Any]] = None
    correlationId: Optional[str] = None


@empire_router.post("/event")
async def receive_empire_event(event: EmpireEvent):
    """
    Receive events from Empire OS Event Bus.
    Extend handlers below to react to platform events.
    """
    log.debug("[StoryForge] Empire OS event: %s from %s", event.topic, event.source)

    if event.topic == "render.completed":
        # Higgsfield render finished — update Image Studio asset status
        pass

    elif event.topic == "workflow.step.completed":
        # Empire OS workflow advanced — check if it's a story-to-render step
        pass

    elif event.topic == "system.alert":
        # Platform alert — log prominently
        log.warning("[StoryForge] Empire OS system.alert: %s", event.payload)

    return {"status": "received", "topic": event.topic}
