"""
StoryForge Empire Automation Studio -- Persistence
------------------------------------------------------
SQLite-backed persistence for every Phase 5 artifact (project
readiness, format packages, campaigns, analytics metrics,
recommendations, workflow definitions/runs, scheduled jobs, events) --
the exact same pattern as `PublishingStudio`, `WorldEngine`,
`CharacterMemory`, and `ImageStudio`. Swap `db_path` for a real
Postgres DSN later without changing the public API.

Versioning rule: `save_format_package` and `save_recommendation` always
INSERT a new row (never UPDATE/overwrite), so every version stays
retrievable -- "never overwrite originals, version everything" from the
spec is enforced here, not just by convention in the calling code.

This class also owns the process-wide `EventBus` (`self.events`), wired
to persist every published event into `automation_events` so Empire
Assistant (or anything else) can poll `list_events(...)` for history it
missed while not subscribed in-process.
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict
from typing import Dict, List, Optional

from core.automation.events import EventBus
from core.automation.models import (
    AnalyticsMetric, Campaign, EventRecord, FormatPackage, ProjectReadiness,
    Recommendation, ScheduledJob, WorkflowDefinition, WorkflowRun,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS automation_project_status (
    project_id TEXT PRIMARY KEY,
    book_metadata_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_format_packages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    book_metadata_id TEXT NOT NULL,
    format_type TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_campaigns (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    book_metadata_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_analytics_metrics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    campaign_id TEXT,
    metric_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    recorded_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_recommendations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    category TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_workflow_definitions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    started_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_scheduled_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    campaign_id TEXT,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    run_at REAL NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    project_id TEXT,
    campaign_id TEXT,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auto_fmt_project ON automation_format_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_fmt_book ON automation_format_packages(book_metadata_id);
CREATE INDEX IF NOT EXISTS idx_auto_campaigns_project ON automation_campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_metrics_project ON automation_analytics_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_metrics_campaign ON automation_analytics_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_auto_recs_campaign ON automation_recommendations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_auto_workflows_project ON automation_workflow_definitions(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_runs_workflow ON automation_workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_auto_jobs_status_runat ON automation_scheduled_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_auto_jobs_project ON automation_scheduled_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_events_project ON automation_events(project_id);
CREATE INDEX IF NOT EXISTS idx_auto_events_type ON automation_events(event_type);
"""


class AutomationStudioError(ValueError):
    pass


class AutomationStudio:
    def __init__(self, db_path: str = "storyforge_automation.db"):
        self.db_path = db_path
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        # Every event this studio publishes is persisted here automatically.
        self.events = EventBus(persist_fn=self._persist_event)

    # -- project readiness --------------------------------------------

    def mark_ready(self, project_id: str, book_metadata_id: str) -> ProjectReadiness:
        now = time.time()
        status = ProjectReadiness(
            project_id=project_id, book_metadata_id=book_metadata_id,
            status="ready", marked_ready_at=now, updated_at=now,
        )
        self._conn.execute(
            """INSERT INTO automation_project_status (project_id, book_metadata_id, payload, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(project_id) DO UPDATE SET
                 book_metadata_id = excluded.book_metadata_id,
                 payload = excluded.payload, updated_at = excluded.updated_at""",
            (project_id, book_metadata_id, json.dumps(asdict(status)), now),
        )
        self._conn.commit()
        return status

    def set_project_status(self, project_id: str, status: ProjectReadiness) -> None:
        status.updated_at = time.time()
        self._conn.execute(
            """INSERT INTO automation_project_status (project_id, book_metadata_id, payload, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(project_id) DO UPDATE SET
                 book_metadata_id = excluded.book_metadata_id,
                 payload = excluded.payload, updated_at = excluded.updated_at""",
            (project_id, status.book_metadata_id, json.dumps(asdict(status)), status.updated_at),
        )
        self._conn.commit()

    def get_project_status(self, project_id: str) -> Optional[ProjectReadiness]:
        row = self._conn.execute(
            "SELECT payload FROM automation_project_status WHERE project_id = ?", (project_id,)
        ).fetchone()
        return ProjectReadiness(**json.loads(row["payload"])) if row else None

    def list_ready_projects(self) -> List[ProjectReadiness]:
        rows = self._conn.execute(
            "SELECT payload FROM automation_project_status WHERE payload LIKE '%\"status\": \"ready\"%'"
        ).fetchall()
        return [ProjectReadiness(**json.loads(r["payload"])) for r in rows]

    # -- format packages (versioned, insert-only) -----------------------

    def save_format_package(self, package: FormatPackage) -> str:
        existing = self._conn.execute(
            "SELECT COALESCE(MAX(version), 0) AS v FROM automation_format_packages "
            "WHERE book_metadata_id = ? AND format_type = ?",
            (package.book_metadata_id, package.format_type),
        ).fetchone()
        package.version = (existing["v"] if existing else 0) + 1
        self._conn.execute(
            """INSERT INTO automation_format_packages
               (id, project_id, book_metadata_id, format_type, version, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (package.id, package.project_id, package.book_metadata_id, package.format_type,
             package.version, json.dumps(asdict(package)), package.created_at),
        )
        self._conn.commit()
        return package.id

    def list_format_packages(self, project_id: str, format_type: Optional[str] = None) -> List[FormatPackage]:
        if format_type:
            rows = self._conn.execute(
                "SELECT payload FROM automation_format_packages WHERE project_id = ? AND format_type = ? "
                "ORDER BY created_at DESC", (project_id, format_type),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT payload FROM automation_format_packages WHERE project_id = ? ORDER BY created_at DESC",
                (project_id,),
            ).fetchall()
        return [FormatPackage(**json.loads(r["payload"])) for r in rows]

    # -- campaigns --------------------------------------------------------

    def save_campaign(self, campaign: Campaign) -> str:
        self._conn.execute(
            """INSERT INTO automation_campaigns (id, project_id, book_metadata_id, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at""",
            (campaign.id, campaign.project_id, campaign.book_metadata_id,
             json.dumps(asdict(campaign)), campaign.created_at, campaign.updated_at),
        )
        self._conn.commit()
        return campaign.id

    def get_campaign(self, campaign_id: str) -> Optional[Campaign]:
        row = self._conn.execute("SELECT payload FROM automation_campaigns WHERE id = ?", (campaign_id,)).fetchone()
        return Campaign(**json.loads(row["payload"])) if row else None

    def list_campaigns(self, project_id: str) -> List[Campaign]:
        rows = self._conn.execute(
            "SELECT payload FROM automation_campaigns WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [Campaign(**json.loads(r["payload"])) for r in rows]

    def list_active_campaigns(self) -> List[Campaign]:
        rows = self._conn.execute("SELECT payload FROM automation_campaigns").fetchall()
        campaigns = [Campaign(**json.loads(r["payload"])) for r in rows]
        return [c for c in campaigns if c.status == "active"]

    # -- analytics ----------------------------------------------------------

    def save_metric(self, metric: AnalyticsMetric) -> str:
        self._conn.execute(
            """INSERT INTO automation_analytics_metrics
               (id, project_id, campaign_id, metric_type, payload, recorded_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (metric.id, metric.project_id, metric.campaign_id, metric.metric_type,
             json.dumps(asdict(metric)), metric.recorded_at),
        )
        self._conn.commit()
        return metric.id

    def list_metrics(self, project_id: str, campaign_id: Optional[str] = None) -> List[AnalyticsMetric]:
        if campaign_id:
            rows = self._conn.execute(
                "SELECT payload FROM automation_analytics_metrics WHERE project_id = ? AND campaign_id = ? "
                "ORDER BY recorded_at ASC", (project_id, campaign_id),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT payload FROM automation_analytics_metrics WHERE project_id = ? ORDER BY recorded_at ASC",
                (project_id,),
            ).fetchall()
        return [AnalyticsMetric(**json.loads(r["payload"])) for r in rows]

    # -- recommendations (versioned, insert-only) -------------------------

    def save_recommendation(self, rec: Recommendation) -> str:
        self._conn.execute(
            """INSERT INTO automation_recommendations
               (id, project_id, campaign_id, category, version, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (rec.id, rec.project_id, rec.campaign_id, rec.category, rec.version,
             json.dumps(asdict(rec)), rec.created_at),
        )
        self._conn.commit()
        return rec.id

    def list_recommendations(self, campaign_id: str) -> List[Recommendation]:
        rows = self._conn.execute(
            "SELECT payload FROM automation_recommendations WHERE campaign_id = ? ORDER BY created_at DESC",
            (campaign_id,),
        ).fetchall()
        return [Recommendation(**json.loads(r["payload"])) for r in rows]

    def count_recommendations(self, campaign_id: str) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) AS c FROM automation_recommendations WHERE campaign_id = ?", (campaign_id,)
        ).fetchone()
        return row["c"] if row else 0

    # -- workflow definitions & runs ----------------------------------------

    def save_workflow(self, workflow: WorkflowDefinition) -> str:
        self._conn.execute(
            """INSERT INTO automation_workflow_definitions (id, project_id, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at""",
            (workflow.id, workflow.project_id, json.dumps(asdict(workflow)), workflow.created_at, workflow.updated_at),
        )
        self._conn.commit()
        return workflow.id

    def get_workflow(self, workflow_id: str) -> Optional[WorkflowDefinition]:
        row = self._conn.execute(
            "SELECT payload FROM automation_workflow_definitions WHERE id = ?", (workflow_id,)
        ).fetchone()
        return WorkflowDefinition(**json.loads(row["payload"])) if row else None

    def list_workflows(self, project_id: Optional[str] = None) -> List[WorkflowDefinition]:
        if project_id:
            rows = self._conn.execute(
                "SELECT payload FROM automation_workflow_definitions WHERE project_id = ? ORDER BY updated_at DESC",
                (project_id,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT payload FROM automation_workflow_definitions ORDER BY updated_at DESC"
            ).fetchall()
        return [WorkflowDefinition(**json.loads(r["payload"])) for r in rows]

    def save_workflow_run(self, run: WorkflowRun) -> str:
        """`run.context` may hold live objects a caller stashed there for
        step handlers to use (provider instances, dataclass records from
        other Phase 4 modules, etc.). Only JSON-safe entries are persisted
        (dataclasses are expanded, anything else unrepresentable is
        dropped) so this never crashes on a live object the caller forgot
        to strip; the in-memory `run` object itself is left untouched."""

        def _default(o):
            if hasattr(o, "__dataclass_fields__"):
                return asdict(o)
            return str(o)

        payload = asdict(run)
        payload["context"] = json.loads(json.dumps(run.context, default=_default))
        self._conn.execute(
            """INSERT INTO automation_workflow_runs (id, workflow_id, project_id, payload, started_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload = excluded.payload""",
            (run.id, run.workflow_id, run.project_id, json.dumps(payload), run.started_at),
        )
        self._conn.commit()
        return run.id

    def get_workflow_run(self, run_id: str) -> Optional[WorkflowRun]:
        row = self._conn.execute("SELECT payload FROM automation_workflow_runs WHERE id = ?", (run_id,)).fetchone()
        return WorkflowRun(**json.loads(row["payload"])) if row else None

    def list_workflow_runs(self, workflow_id: str) -> List[WorkflowRun]:
        rows = self._conn.execute(
            "SELECT payload FROM automation_workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC",
            (workflow_id,),
        ).fetchall()
        return [WorkflowRun(**json.loads(r["payload"])) for r in rows]

    # -- scheduled jobs --------------------------------------------------

    def save_job(self, job: ScheduledJob) -> str:
        self._conn.execute(
            """INSERT INTO automation_scheduled_jobs
               (id, project_id, campaign_id, job_type, status, run_at, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 status = excluded.status, run_at = excluded.run_at,
                 payload = excluded.payload, updated_at = excluded.updated_at""",
            (job.id, job.project_id, job.campaign_id, job.job_type, job.status, job.run_at,
             json.dumps(asdict(job)), job.created_at, job.updated_at),
        )
        self._conn.commit()
        return job.id

    def get_job(self, job_id: str) -> Optional[ScheduledJob]:
        row = self._conn.execute("SELECT payload FROM automation_scheduled_jobs WHERE id = ?", (job_id,)).fetchone()
        return ScheduledJob(**json.loads(row["payload"])) if row else None

    def list_jobs(self, project_id: Optional[str] = None, status: Optional[str] = None) -> List[ScheduledJob]:
        clauses, params = [], []
        if project_id:
            clauses.append("project_id = ?")
            params.append(project_id)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self._conn.execute(
            f"SELECT payload FROM automation_scheduled_jobs {where} ORDER BY run_at ASC", params
        ).fetchall()
        return [ScheduledJob(**json.loads(r["payload"])) for r in rows]

    def list_due_jobs(self, now: Optional[float] = None) -> List[ScheduledJob]:
        now = now if now is not None else time.time()
        rows = self._conn.execute(
            "SELECT payload FROM automation_scheduled_jobs WHERE status IN ('pending','retrying') AND run_at <= ? "
            "ORDER BY run_at ASC",
            (now,),
        ).fetchall()
        return [ScheduledJob(**json.loads(r["payload"])) for r in rows]

    def list_failed_jobs(self, project_id: Optional[str] = None) -> List[ScheduledJob]:
        return self.list_jobs(project_id=project_id, status="failed")

    # -- events -------------------------------------------------------------

    def _persist_event(self, event: EventRecord) -> None:
        self._conn.execute(
            """INSERT INTO automation_events (id, event_type, project_id, campaign_id, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (event.id, event.event_type, event.project_id, event.campaign_id,
             json.dumps(asdict(event)), event.created_at),
        )
        self._conn.commit()

    def list_events(
        self, project_id: Optional[str] = None, event_type: Optional[str] = None, limit: int = 100,
    ) -> List[EventRecord]:
        clauses, params = [], []
        if project_id:
            clauses.append("project_id = ?")
            params.append(project_id)
        if event_type:
            clauses.append("event_type = ?")
            params.append(event_type)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        rows = self._conn.execute(
            f"SELECT payload FROM automation_events {where} ORDER BY created_at DESC LIMIT ?", params
        ).fetchall()
        return [EventRecord(**json.loads(r["payload"])) for r in rows]

    def close(self) -> None:
        self._conn.close()
