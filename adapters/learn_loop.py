import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.logger import logger

FACTORY = "LEARN_LOOP"
VALID_OUTCOMES = ("success", "failure", "partial", "pending")
NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
MAX_METADATA_BYTES = 8192
DEFAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "learn_loop")
EVENTS_FILENAME = "events.jsonl"


class LearnLoopError(ValueError):
    """Raised when an event fails validation. Nothing is stored in that case."""


class LearnLoopAdapter:
    """
    Learn Loop Adapter (scoring interface STUB).
    Accepts an event {factory, action, outcome, score?, metadata?}, validates it, and
    appends it durably to output/learn_loop/events.jsonl (append-only; no Supabase, no
    credentials). score_summary() is a stub: event count + mean of the scores that were
    actually provided, per factory. There is no sales data yet, so no real scoring logic.
    """

    def __init__(self, storage_dir: str = DEFAULT_DIR):
        self.storage_dir = storage_dir
        self.path = os.path.join(storage_dir, EVENTS_FILENAME)

    @staticmethod
    def validate(event: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(event, dict):
            raise LearnLoopError("event must be a dict")
        for field in ("factory", "action"):
            value = event.get(field)
            if not isinstance(value, str) or not NAME_PATTERN.match(value):
                raise LearnLoopError(f"{field} must be a string of 1-64 chars [A-Za-z0-9_.-]")
        outcome = event.get("outcome")
        if outcome not in VALID_OUTCOMES:
            raise LearnLoopError(f"outcome must be one of {VALID_OUTCOMES}")
        score = event.get("score")
        if score is not None:
            if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
                raise LearnLoopError("score must be a finite number when provided")
        metadata = event.get("metadata")
        if metadata is not None:
            if not isinstance(metadata, dict):
                raise LearnLoopError("metadata must be a dict when provided")
            try:
                encoded = json.dumps(metadata, allow_nan=False)
            except (TypeError, ValueError) as e:
                raise LearnLoopError(f"metadata must be JSON-serializable: {e}")
            if len(encoded.encode("utf-8")) > MAX_METADATA_BYTES:
                raise LearnLoopError(f"metadata exceeds {MAX_METADATA_BYTES} bytes")
        return {
            "factory": event["factory"],
            "action": event["action"],
            "outcome": outcome,
            "score": score,
            "metadata": metadata or {},
        }

    def submit_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        job_id = f"job_learnloop_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        try:
            clean = self.validate(event)
        except LearnLoopError as e:
            logger.warning(f"Learn Loop event rejected: {e}", factory=FACTORY, data={"job_id": job_id})
            return {"job_id": job_id, "status": "REJECTED", "error": str(e), "event": None}

        record = {
            "event_id": f"evt_{uuid.uuid4().hex}",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            **clean,
        }
        try:
            os.makedirs(self.storage_dir, exist_ok=True)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, sort_keys=True) + "\n")
                f.flush()
                os.fsync(f.fileno())
        except OSError as e:
            logger.error(f"Learn Loop write failed: {e}", factory=FACTORY, data={"job_id": job_id})
            return {"job_id": job_id, "status": "FAILED", "error": str(e), "event": None}

        logger.info("Learn Loop event stored", factory=FACTORY,
                    data={"job_id": job_id, "event_id": record["event_id"], "path": self.path})
        return {"job_id": job_id, "status": "COMPLETED", "error": None, "event": record}

    def read_events(self, factory: Optional[str] = None) -> List[Dict[str, Any]]:
        if not os.path.exists(self.path):
            return []
        events, corrupt = [], 0
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    corrupt += 1
                    continue
                if factory is None or record.get("factory") == factory:
                    events.append(record)
        if corrupt:
            logger.warning(f"Learn Loop skipped {corrupt} unreadable line(s)", factory=FACTORY, data={"path": self.path})
        return events

    def score_summary(self, factory: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """STUB: per factory -> {count, scored_count, mean_score}. mean_score is None if no scores were provided."""
        summary: Dict[str, Dict[str, Any]] = {}
        totals: Dict[str, float] = {}
        for ev in self.read_events(factory):
            row = summary.setdefault(ev["factory"], {"count": 0, "scored_count": 0, "mean_score": None})
            row["count"] += 1
            if ev.get("score") is not None:
                row["scored_count"] += 1
                totals[ev["factory"]] = totals.get(ev["factory"], 0.0) + ev["score"]
        for name, total in totals.items():
            summary[name]["mean_score"] = total / summary[name]["scored_count"]
        return summary
