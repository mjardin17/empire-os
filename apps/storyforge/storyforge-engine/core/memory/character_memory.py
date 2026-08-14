"""
StoryForge Character Memory
---------------------------
Persistent, queryable memory for every character so they stay consistent
across every story, book, video, and game in the franchise.

Backed by SQLite (stdlib) so it works out of the box; swap `db_path` for
a real Postgres DSN + psycopg later without changing the public API —
the CharacterMemory class is the seam.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


_SCHEMA = """
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS character_attributes (
    character_id TEXT NOT NULL,
    attribute_key TEXT NOT NULL,
    attribute_value TEXT NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (character_id, attribute_key),
    FOREIGN KEY (character_id) REFERENCES characters(id)
);

CREATE TABLE IF NOT EXISTS character_events (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    event_type TEXT NOT NULL,      -- e.g. 'memory', 'growth', 'costume_change'
    description TEXT NOT NULL,
    story_context TEXT,
    created_at REAL NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id)
);
"""

# Canonical attribute keys we actively guard for contradictions.
_GUARDED_ATTRIBUTES = {
    "hair_color", "eye_color", "skin_tone", "height", "age",
    "voice_description", "signature_catchphrase", "species",
}


@dataclass
class ConsistencyIssue:
    attribute: str
    stored_value: str
    new_value: str
    message: str


@dataclass
class Character:
    id: str
    project_id: str
    name: str
    attributes: Dict[str, str] = field(default_factory=dict)


class CharacterMemory:
    def __init__(self, db_path: str = "storyforge_characters.db"):
        self.db_path = db_path
        self._conn = sqlite3.connect(self.db_path)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # -- lifecycle --------------------------------------------------

    def create_character(self, project_id: str, name: str,
                          attributes: Optional[Dict[str, str]] = None) -> Character:
        char_id = str(uuid.uuid4())
        now = time.time()
        self._conn.execute(
            "INSERT INTO characters (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
            (char_id, project_id, name, now),
        )
        self._conn.commit()
        char = Character(id=char_id, project_id=project_id, name=name)
        if attributes:
            for key, value in attributes.items():
                self.set_attribute(char_id, key, value, force=True)
                char.attributes[key] = value
        return char

    def get_character(self, character_id: str) -> Optional[Character]:
        row = self._conn.execute(
            "SELECT id, project_id, name FROM characters WHERE id = ?", (character_id,)
        ).fetchone()
        if not row:
            return None
        char = Character(id=row[0], project_id=row[1], name=row[2])
        attr_rows = self._conn.execute(
            "SELECT attribute_key, attribute_value FROM character_attributes WHERE character_id = ?",
            (character_id,),
        ).fetchall()
        char.attributes = {k: v for k, v in attr_rows}
        return char

    def list_characters(self, project_id: str) -> List[Character]:
        rows = self._conn.execute(
            "SELECT id FROM characters WHERE project_id = ?", (project_id,)
        ).fetchall()
        return [self.get_character(r[0]) for r in rows]

    # -- attributes & consistency ------------------------------------

    def check_consistency(self, character_id: str, key: str, new_value: str) -> Optional[ConsistencyIssue]:
        """Returns a ConsistencyIssue if a guarded attribute is being
        changed to a materially different value, else None."""
        row = self._conn.execute(
            "SELECT attribute_value FROM character_attributes WHERE character_id = ? AND attribute_key = ?",
            (character_id, key),
        ).fetchone()
        if not row:
            return None
        stored_value = row[0]
        if key in _GUARDED_ATTRIBUTES and stored_value.strip().lower() != new_value.strip().lower():
            return ConsistencyIssue(
                attribute=key,
                stored_value=stored_value,
                new_value=new_value,
                message=(
                    f"Character attribute '{key}' was previously '{stored_value}' "
                    f"and is now being set to '{new_value}'. This is a guarded "
                    f"attribute — confirm this is an intentional canon change "
                    f"(e.g. a costume/growth arc) before proceeding."
                ),
            )
        return None

    def set_attribute(self, character_id: str, key: str, value: str, force: bool = False) -> Optional[ConsistencyIssue]:
        issue = None if force else self.check_consistency(character_id, key, value)
        if issue and not force:
            return issue
        now = time.time()
        self._conn.execute(
            """INSERT INTO character_attributes (character_id, attribute_key, attribute_value, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(character_id, attribute_key)
               DO UPDATE SET attribute_value = excluded.attribute_value, updated_at = excluded.updated_at""",
            (character_id, key, value, now),
        )
        self._conn.commit()
        return None

    # -- events / memories --------------------------------------------

    def add_event(self, character_id: str, event_type: str, description: str,
                  story_context: Optional[str] = None) -> str:
        event_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO character_events (id, character_id, event_type, description, story_context, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (event_id, character_id, event_type, description, story_context, time.time()),
        )
        self._conn.commit()
        return event_id

    def get_history(self, character_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT event_type, description, story_context, created_at
               FROM character_events WHERE character_id = ? ORDER BY created_at ASC""",
            (character_id,),
        ).fetchall()
        return [
            {"event_type": r[0], "description": r[1], "story_context": r[2], "created_at": r[3]}
            for r in rows
        ]

    def close(self):
        self._conn.close()
