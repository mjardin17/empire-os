"""
StoryForge Empire Automation Studio -- Scheduler
------------------------------------------------------
Schedules publishing/marketing/workflow jobs across every connected
platform, with retry and failed-job recovery. No background daemon is
assumed -- `run_due()` is a plain function you call from a real cron
job, a FastAPI background task, or a manual "run due jobs" button
(exposed as `POST /automation/scheduler/run-due` in main.py). This
keeps the whole thing dependency-free and testable synchronously,
matching every other module in this repo.

Job execution itself is a plain handler registry (`register_job_handler`)
-- the scheduler doesn't know or care whether a job publishes a
platform listing, posts to social, or runs a workflow step; it only
manages timing, attempts, and backoff.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable, Dict, Optional

from core.automation.events import (
    EVENT_JOB_FAILED, EVENT_JOB_RETRYING, EVENT_JOB_SCHEDULED, EVENT_JOB_SUCCEEDED, EventBus,
)
from core.automation.models import ScheduledJob

JobHandler = Callable[[ScheduledJob], Dict[str, Any]]
# handler(job) -> result dict. Raise to indicate failure (triggers retry/backoff).

_JOB_HANDLERS: Dict[str, JobHandler] = {}


def register_job_handler(job_type: str, handler: JobHandler) -> None:
    _JOB_HANDLERS[job_type] = handler


def list_job_types() -> list:
    return sorted(_JOB_HANDLERS.keys())


# Exponential backoff in seconds per attempt number (1-indexed). Beyond
# the last entry, the last value repeats.
_BACKOFF_SECONDS = [60, 300, 1800, 7200]


def _backoff_for(attempt: int) -> float:
    idx = min(attempt - 1, len(_BACKOFF_SECONDS) - 1)
    return float(_BACKOFF_SECONDS[max(idx, 0)])


class Scheduler:
    def __init__(self, event_bus: Optional[EventBus] = None):
        self.event_bus = event_bus

    def schedule(
        self,
        project_id: str,
        job_type: str,
        run_at: Optional[float] = None,
        payload: Optional[Dict[str, Any]] = None,
        campaign_id: Optional[str] = None,
        platform: str = "",
        max_attempts: int = 3,
    ) -> ScheduledJob:
        now = time.time()
        job = ScheduledJob(
            id=str(uuid.uuid4()), project_id=project_id, job_type=job_type,
            payload=payload or {}, campaign_id=campaign_id, platform=platform,
            run_at=run_at if run_at is not None else now, status="pending",
            max_attempts=max_attempts, created_at=now, updated_at=now,
        )
        if self.event_bus:
            self.event_bus.publish(
                EVENT_JOB_SCHEDULED, project_id=project_id, campaign_id=campaign_id or "",
                payload={"job_id": job.id, "job_type": job_type, "run_at": job.run_at},
            )
        return job

    def execute(self, job: ScheduledJob, now: Optional[float] = None) -> ScheduledJob:
        """Runs one job through its registered handler, applying
        retry/backoff on failure. Mutates and returns the job -- caller
        persists it."""
        now = now if now is not None else time.time()
        handler = _JOB_HANDLERS.get(job.job_type)
        job.status = "running"
        job.attempts += 1

        if handler is None:
            job.status = "failed"
            job.last_error = f"no job handler registered for job_type '{job.job_type}'"
            job.updated_at = now
            if self.event_bus:
                self.event_bus.publish(
                    EVENT_JOB_FAILED, project_id=job.project_id, campaign_id=job.campaign_id or "",
                    payload={"job_id": job.id, "error": job.last_error},
                )
            return job

        try:
            result = handler(job)
            job.status = "succeeded"
            job.result = result or {}
            job.last_error = ""
            job.updated_at = now
            if self.event_bus:
                self.event_bus.publish(
                    EVENT_JOB_SUCCEEDED, project_id=job.project_id, campaign_id=job.campaign_id or "",
                    payload={"job_id": job.id, "job_type": job.job_type},
                )
        except Exception as e:
            job.last_error = str(e)
            job.updated_at = now
            if job.attempts >= job.max_attempts:
                job.status = "failed"
                if self.event_bus:
                    self.event_bus.publish(
                        EVENT_JOB_FAILED, project_id=job.project_id, campaign_id=job.campaign_id or "",
                        payload={"job_id": job.id, "error": job.last_error, "attempts": job.attempts},
                    )
            else:
                job.status = "retrying"
                job.run_at = now + _backoff_for(job.attempts)
                if self.event_bus:
                    self.event_bus.publish(
                        EVENT_JOB_RETRYING, project_id=job.project_id, campaign_id=job.campaign_id or "",
                        payload={"job_id": job.id, "attempts": job.attempts, "next_run_at": job.run_at},
                    )
        return job

    def run_due(self, jobs: list, now: Optional[float] = None) -> list:
        """Executes every job in `jobs` (typically the result of
        `AutomationStudio.list_due_jobs(...)`) whose run_at has passed
        and status is pending/retrying. Returns the executed jobs for
        the caller to persist."""
        now = now if now is not None else time.time()
        executed = []
        for job in jobs:
            if job.status in ("pending", "retrying") and job.run_at <= now:
                executed.append(self.execute(job, now=now))
        return executed

    @staticmethod
    def recover_failed(job: ScheduledJob, new_max_attempts: Optional[int] = None) -> ScheduledJob:
        """Manual failed-job recovery: resets a permanently-failed job
        back to pending with a fresh attempt budget, without discarding
        its history (last_error and prior attempts count remain visible
        until the next execute() overwrites them)."""
        job.status = "pending"
        job.run_at = time.time()
        if new_max_attempts is not None:
            job.max_attempts = new_max_attempts
        job.updated_at = time.time()
        return job
