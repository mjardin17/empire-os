"""
StoryForge Empire Automation Studio -- Event Bus
-----------------------------------------------------
A small, dependency-free pub/sub bus plus a persisted event log so any
external system (Empire Assistant, a Telegram bot, a dashboard) can
either subscribe in-process or poll `AutomationStudio.list_events(...)`
for everything that happened while it wasn't listening.

Mirrors the seam pattern used throughout this codebase (AIProvider,
ImageProvider, PublishingConnector): `EventBus` doesn't know about
SQLite, FastAPI, or Empire Assistant -- it just calls an optional
`persist_fn` and fans out to subscribers. `studio.AutomationStudio`
wires the persistence side; `main.py` wires the HTTP side.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from core.automation.models import EventRecord

# The exact event vocabulary requested for Empire Assistant, plus the
# handful of Phase-5-internal events the automation engine needs to
# describe its own state machine (job lifecycle, workflow lifecycle).
# Emitting an event type not in this set is still allowed -- new event
# types are additive by nature -- but these are the ones every StoryForge
# module standardizes on.
EVENT_STORY_APPROVED = "story.approved"
EVENT_BOOK_EXPORTED = "book.exported"
EVENT_IMAGES_FINISHED = "images.finished"
EVENT_VIDEO_FINISHED = "video.finished"
EVENT_PUBLISHED = "published"
EVENT_CAMPAIGN_STARTED = "campaign.started"
EVENT_CAMPAIGN_COMPLETED = "campaign.completed"
EVENT_SALES_MILESTONE = "sales.milestone"
EVENT_ANALYTICS_UPDATED = "analytics.updated"

# Internal, additional lifecycle events -- useful to subscribers but not
# part of the originally requested vocabulary.
EVENT_PROJECT_READY = "project.ready"
EVENT_FORMAT_GENERATED = "format.generated"
EVENT_WORKFLOW_STARTED = "workflow.started"
EVENT_WORKFLOW_STEP_COMPLETED = "workflow.step_completed"
EVENT_WORKFLOW_COMPLETED = "workflow.completed"
EVENT_WORKFLOW_FAILED = "workflow.failed"
EVENT_JOB_SCHEDULED = "job.scheduled"
EVENT_JOB_SUCCEEDED = "job.succeeded"
EVENT_JOB_FAILED = "job.failed"
EVENT_JOB_RETRYING = "job.retrying"
EVENT_RECOMMENDATION_GENERATED = "recommendation.generated"

EVENT_TYPES = {
    EVENT_STORY_APPROVED, EVENT_BOOK_EXPORTED, EVENT_IMAGES_FINISHED,
    EVENT_VIDEO_FINISHED, EVENT_PUBLISHED, EVENT_CAMPAIGN_STARTED,
    EVENT_CAMPAIGN_COMPLETED, EVENT_SALES_MILESTONE, EVENT_ANALYTICS_UPDATED,
    EVENT_PROJECT_READY, EVENT_FORMAT_GENERATED, EVENT_WORKFLOW_STARTED,
    EVENT_WORKFLOW_STEP_COMPLETED, EVENT_WORKFLOW_COMPLETED, EVENT_WORKFLOW_FAILED,
    EVENT_JOB_SCHEDULED, EVENT_JOB_SUCCEEDED, EVENT_JOB_FAILED, EVENT_JOB_RETRYING,
    EVENT_RECOMMENDATION_GENERATED,
}

Subscriber = Callable[[EventRecord], None]


class EventBus:
    """In-process pub/sub. `persist_fn`, if given, is called with every
    published `EventRecord` so it survives past this process's memory
    (see `AutomationStudio.save_event`). Subscribers registered with
    `event_type=None` receive every event -- this is the hook Empire
    Assistant (or any other consumer) uses to watch the whole studio."""

    def __init__(self, persist_fn: Optional[Callable[[EventRecord], None]] = None):
        self._persist_fn = persist_fn
        self._subscribers: List[tuple[Optional[str], Subscriber]] = []

    def subscribe(self, callback: Subscriber, event_type: Optional[str] = None) -> None:
        self._subscribers.append((event_type, callback))

    def publish(
        self,
        event_type: str,
        project_id: str = "",
        campaign_id: str = "",
        payload: Optional[Dict[str, Any]] = None,
    ) -> EventRecord:
        event = EventRecord(
            id=str(uuid.uuid4()),
            event_type=event_type,
            project_id=project_id,
            campaign_id=campaign_id,
            payload=payload or {},
            created_at=time.time(),
        )
        if self._persist_fn:
            self._persist_fn(event)
        for wanted_type, callback in list(self._subscribers):
            if wanted_type is None or wanted_type == event_type:
                # A misbehaving subscriber must never break the publisher.
                try:
                    callback(event)
                except Exception:
                    pass
        return event
