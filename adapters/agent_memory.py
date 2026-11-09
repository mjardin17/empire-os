import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DEFAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "agent_memory")
RECALL_LIMIT = 20
DIGITS = re.compile(r"\d+")
AGENT_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


def signature(error: str) -> str:
    """Normalise an error so the same failure matches across runs (ids and numbers removed)."""
    return DIGITS.sub("#", (error or "").strip().lower())[:160]


class AgentMemory:
    """
    Per-agent mistake memory. One append-only JSONL file per agent under output/agent_memory/.
    Every failure is written down with the lesson; the next run recalls it before it starts.
    """

    def __init__(self, storage_dir: str = DEFAULT_DIR):
        self.storage_dir = storage_dir

    def _path(self, agent: str) -> str:
        if not AGENT_NAME.match(agent):
            raise ValueError(f"invalid agent name '{agent}'")
        return os.path.join(self.storage_dir, f"{agent}.jsonl")

    def remember(self, agent: str, action: str, error: str, lesson: str) -> Dict[str, Any]:
        os.makedirs(self.storage_dir, exist_ok=True)
        record = {
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "action": action,
            "signature": signature(error),
            "error": (error or "")[:400],
            "lesson": lesson[:400],
        }
        with open(self._path(agent), "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        return record

    def recall(self, agent: str, action: Optional[str] = None) -> List[Dict[str, Any]]:
        path = self._path(agent)
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            rows = [json.loads(line) for line in f if line.strip()]
        if action is not None:
            rows = [r for r in rows if r.get("action") == action]
        return rows[-RECALL_LIMIT:]
