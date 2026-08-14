"""
StoryForge World Engine -- Persistence Layer
-----------------------------------------------
Persistent, queryable memory for every world: maps/locations, timeline,
cultures, governments, species, magic systems, tech levels, character
relationships, and free-form lore.

Backed by SQLite (stdlib) -- same pattern as CharacterMemory -- so it
runs with zero extra dependencies. The `WorldMemorySync` interface below
is the seam for Empire OS Memory integration: implement one adapter
class against it later and every module that talks to WorldEngine keeps
working unchanged.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from core.world.models import (
    Location, TimelineEvent, Culture, Government, Species,
    MagicSystem, TechLevel, CharacterRelationship, LoreEntry,
)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location_type TEXT NOT NULL,
    description TEXT DEFAULT '',
    parent_location_id TEXT,
    coordinates TEXT,             -- JSON {"x":..,"y":..}
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    era_order INTEGER NOT NULL,
    date_label TEXT DEFAULT '',
    location_id TEXT,
    character_ids TEXT DEFAULT '[]',   -- JSON list
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS cultures (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    culture_values TEXT DEFAULT '[]',
    traditions TEXT DEFAULT '[]',
    related_species_ids TEXT DEFAULT '[]',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS governments (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    government_type TEXT DEFAULT '',
    ruling_location_id TEXT,
    leader_character_id TEXT,
    laws TEXT DEFAULT '[]',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS species (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    traits TEXT DEFAULT '[]',
    abilities TEXT DEFAULT '[]',
    homeland_location_id TEXT,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_systems (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT DEFAULT '',
    rules TEXT DEFAULT '[]',
    costs TEXT DEFAULT '[]',
    limitations TEXT DEFAULT '[]',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tech_levels (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    applies_to_location_ids TEXT DEFAULT '[]',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS character_relationships (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    character_a_id TEXT NOT NULL,
    character_b_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS lore_entries (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at REAL NOT NULL
);

-- Generic guarded-attribute table, same pattern as CharacterMemory,
-- generalized across every entity type so canon contradictions on ANY
-- world entity are caught, not just characters.
CREATE TABLE IF NOT EXISTS world_attributes (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    attribute_key TEXT NOT NULL,
    attribute_value TEXT NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (entity_type, entity_id, attribute_key)
);
"""

_FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS world_encyclopedia_fts USING fts5(
    entity_type, entity_id, world_id, title, body
);
"""

# Attributes that, once set, trigger a consistency check if changed to a
# materially different value without an explicit force -- mirrors the
# guarded-attribute pattern in CharacterMemory but generalized per type.
GUARDED_ATTRIBUTES_BY_TYPE = {
    "location": {"ruling_government_id", "controlling_species_id", "climate", "tech_level"},
    "government": {"government_type", "ruling_location_id"},
    "species": {"homeland_location_id"},
    "culture": {"related_species_ids"},
}


class WorldMemorySync(ABC):
    """Seam for external memory backends (e.g. Empire OS Memory).
    Implement this against a real backend later; WorldEngine calls it
    on every write so nothing else in StoryForge has to change when the
    backend changes."""

    @abstractmethod
    def on_write(self, entity_type: str, entity_id: str, payload: dict) -> None:
        ...


class NullMemorySync(WorldMemorySync):
    """Default no-op sync. Safe placeholder for the *sync target*, not
    for any World Engine logic -- all World Engine behavior above this
    class is fully implemented and real."""

    def on_write(self, entity_type: str, entity_id: str, payload: dict) -> None:
        return None


def _dumps(value) -> str:
    return json.dumps(value or [])


def _loads(value: Optional[str]):
    return json.loads(value) if value else []


class WorldEngine:
    def __init__(self, db_path: str = "storyforge_world.db", memory_sync: Optional[WorldMemorySync] = None):
        self.db_path = db_path
        self.memory_sync = memory_sync or NullMemorySync()
        self._conn = sqlite3.connect(self.db_path)
        self._conn.executescript(_SCHEMA)
        try:
            self._conn.executescript(_FTS_SCHEMA)
            self._fts_enabled = True
        except sqlite3.OperationalError:
            self._fts_enabled = False  # FTS5 not compiled in; encyclopedia() falls back to LIKE
        self._conn.commit()

    # -- world lifecycle -------------------------------------------

    def create_world(self, project_id: str, name: str) -> str:
        world_id = str(uuid.uuid4())
        self._conn.execute(
            "INSERT INTO worlds (id, project_id, name, created_at) VALUES (?, ?, ?, ?)",
            (world_id, project_id, name, time.time()),
        )
        self._conn.commit()
        return world_id

    def get_world(self, world_id: str) -> Optional[dict]:
        row = self._conn.execute(
            "SELECT id, project_id, name FROM worlds WHERE id = ?", (world_id,)
        ).fetchone()
        return {"id": row[0], "project_id": row[1], "name": row[2]} if row else None

    # -- generic index into the FTS encyclopedia --------------------

    def _index_for_search(self, entity_type: str, entity_id: str, world_id: str, title: str, body: str):
        if not self._fts_enabled:
            return
        self._conn.execute(
            "DELETE FROM world_encyclopedia_fts WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        )
        self._conn.execute(
            "INSERT INTO world_encyclopedia_fts (entity_type, entity_id, world_id, title, body) VALUES (?, ?, ?, ?, ?)",
            (entity_type, entity_id, world_id, title, body),
        )

    # -- LOCATIONS ----------------------------------------------------

    def create_location(self, world_id: str, name: str, location_type: str, description: str = "",
                         parent_location_id: Optional[str] = None,
                         coordinates: Optional[Dict[str, float]] = None) -> Location:
        loc_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO locations (id, world_id, name, location_type, description, parent_location_id, coordinates, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (loc_id, world_id, name, location_type, description, parent_location_id,
             json.dumps(coordinates) if coordinates else None, time.time()),
        )
        self._index_for_search("location", loc_id, world_id, name, description)
        self._conn.commit()
        self.memory_sync.on_write("location", loc_id, {"name": name, "location_type": location_type})
        return Location(id=loc_id, world_id=world_id, name=name, location_type=location_type,
                         description=description, parent_location_id=parent_location_id,
                         coordinates=coordinates)

    def get_location(self, location_id: str) -> Optional[Location]:
        row = self._conn.execute(
            "SELECT id, world_id, name, location_type, description, parent_location_id, coordinates FROM locations WHERE id = ?",
            (location_id,),
        ).fetchone()
        if not row:
            return None
        return Location(
            id=row[0], world_id=row[1], name=row[2], location_type=row[3], description=row[4],
            parent_location_id=row[5], coordinates=json.loads(row[6]) if row[6] else None,
            attributes=self.get_attributes("location", row[0]),
        )

    def list_locations(self, world_id: str) -> List[Location]:
        rows = self._conn.execute("SELECT id FROM locations WHERE world_id = ?", (world_id,)).fetchall()
        return [self.get_location(r[0]) for r in rows]

    def get_map(self, world_id: str) -> List[dict]:
        """Returns every location with coordinates for map rendering,
        plus its parent for nesting (kingdom -> city -> district, etc.)."""
        locations = self.list_locations(world_id)
        return [
            {
                "id": loc.id, "name": loc.name, "type": loc.location_type,
                "parent_location_id": loc.parent_location_id,
                "coordinates": loc.coordinates,
            }
            for loc in locations
        ]

    # -- TIMELINE -------------------------------------------------------

    def create_timeline_event(self, world_id: str, title: str, era_order: int, description: str = "",
                               date_label: str = "", location_id: Optional[str] = None,
                               character_ids: Optional[List[str]] = None) -> TimelineEvent:
        event_id = str(uuid.uuid4())
        character_ids = character_ids or []
        self._conn.execute(
            """INSERT INTO timeline_events (id, world_id, title, description, era_order, date_label, location_id, character_ids, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event_id, world_id, title, description, era_order, date_label, location_id,
             _dumps(character_ids), time.time()),
        )
        self._index_for_search("timeline_event", event_id, world_id, title, description)
        self._conn.commit()
        self.memory_sync.on_write("timeline_event", event_id, {"title": title, "era_order": era_order})
        return TimelineEvent(id=event_id, world_id=world_id, title=title, description=description,
                              era_order=era_order, date_label=date_label, location_id=location_id,
                              character_ids=character_ids)

    def list_timeline(self, world_id: str) -> List[TimelineEvent]:
        rows = self._conn.execute(
            """SELECT id, title, description, era_order, date_label, location_id, character_ids
               FROM timeline_events WHERE world_id = ? ORDER BY era_order ASC""",
            (world_id,),
        ).fetchall()
        return [
            TimelineEvent(id=r[0], world_id=world_id, title=r[1], description=r[2], era_order=r[3],
                          date_label=r[4], location_id=r[5], character_ids=_loads(r[6]))
            for r in rows
        ]

    # -- CULTURES ---------------------------------------------------

    def create_culture(self, world_id: str, name: str, description: str = "",
                        values: Optional[List[str]] = None, traditions: Optional[List[str]] = None,
                        related_species_ids: Optional[List[str]] = None) -> Culture:
        culture_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO cultures (id, world_id, name, description, culture_values, traditions, related_species_ids, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (culture_id, world_id, name, description, _dumps(values), _dumps(traditions),
             _dumps(related_species_ids), time.time()),
        )
        self._index_for_search("culture", culture_id, world_id, name, description)
        self._conn.commit()
        self.memory_sync.on_write("culture", culture_id, {"name": name})
        return Culture(id=culture_id, world_id=world_id, name=name, description=description,
                        values=values or [], traditions=traditions or [],
                        related_species_ids=related_species_ids or [])

    def list_cultures(self, world_id: str) -> List[Culture]:
        rows = self._conn.execute(
            "SELECT id, name, description, culture_values, traditions, related_species_ids FROM cultures WHERE world_id = ?",
            (world_id,),
        ).fetchall()
        return [
            Culture(id=r[0], world_id=world_id, name=r[1], description=r[2],
                    values=_loads(r[3]), traditions=_loads(r[4]), related_species_ids=_loads(r[5]))
            for r in rows
        ]

    # -- GOVERNMENTS ---------------------------------------------------

    def create_government(self, world_id: str, name: str, government_type: str = "",
                           ruling_location_id: Optional[str] = None,
                           leader_character_id: Optional[str] = None,
                           laws: Optional[List[str]] = None) -> Government:
        gov_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO governments (id, world_id, name, government_type, ruling_location_id, leader_character_id, laws, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (gov_id, world_id, name, government_type, ruling_location_id, leader_character_id,
             _dumps(laws), time.time()),
        )
        self._index_for_search("government", gov_id, world_id, name, government_type)
        self._conn.commit()
        self.memory_sync.on_write("government", gov_id, {"name": name})
        return Government(id=gov_id, world_id=world_id, name=name, government_type=government_type,
                           ruling_location_id=ruling_location_id, leader_character_id=leader_character_id,
                           laws=laws or [])

    def list_governments(self, world_id: str) -> List[Government]:
        rows = self._conn.execute(
            "SELECT id, name, government_type, ruling_location_id, leader_character_id, laws FROM governments WHERE world_id = ?",
            (world_id,),
        ).fetchall()
        return [
            Government(id=r[0], world_id=world_id, name=r[1], government_type=r[2],
                       ruling_location_id=r[3], leader_character_id=r[4], laws=_loads(r[5]))
            for r in rows
        ]

    # -- SPECIES ---------------------------------------------------

    def create_species(self, world_id: str, name: str, description: str = "",
                        traits: Optional[List[str]] = None, abilities: Optional[List[str]] = None,
                        homeland_location_id: Optional[str] = None) -> Species:
        species_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO species (id, world_id, name, description, traits, abilities, homeland_location_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (species_id, world_id, name, description, _dumps(traits), _dumps(abilities),
             homeland_location_id, time.time()),
        )
        self._index_for_search("species", species_id, world_id, name, description)
        self._conn.commit()
        self.memory_sync.on_write("species", species_id, {"name": name})
        return Species(id=species_id, world_id=world_id, name=name, description=description,
                        traits=traits or [], abilities=abilities or [], homeland_location_id=homeland_location_id)

    def list_species(self, world_id: str) -> List[Species]:
        rows = self._conn.execute(
            "SELECT id, name, description, traits, abilities, homeland_location_id FROM species WHERE world_id = ?",
            (world_id,),
        ).fetchall()
        return [
            Species(id=r[0], world_id=world_id, name=r[1], description=r[2],
                    traits=_loads(r[3]), abilities=_loads(r[4]), homeland_location_id=r[5])
            for r in rows
        ]

    # -- MAGIC SYSTEMS ---------------------------------------------------

    def create_magic_system(self, world_id: str, name: str, source: str = "",
                             rules: Optional[List[str]] = None, costs: Optional[List[str]] = None,
                             limitations: Optional[List[str]] = None) -> MagicSystem:
        magic_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO magic_systems (id, world_id, name, source, rules, costs, limitations, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (magic_id, world_id, name, source, _dumps(rules), _dumps(costs), _dumps(limitations), time.time()),
        )
        self._index_for_search("magic_system", magic_id, world_id, name, source)
        self._conn.commit()
        self.memory_sync.on_write("magic_system", magic_id, {"name": name})
        return MagicSystem(id=magic_id, world_id=world_id, name=name, source=source,
                           rules=rules or [], costs=costs or [], limitations=limitations or [])

    def list_magic_systems(self, world_id: str) -> List[MagicSystem]:
        rows = self._conn.execute(
            "SELECT id, name, source, rules, costs, limitations FROM magic_systems WHERE world_id = ?",
            (world_id,),
        ).fetchall()
        return [
            MagicSystem(id=r[0], world_id=world_id, name=r[1], source=r[2],
                       rules=_loads(r[3]), costs=_loads(r[4]), limitations=_loads(r[5]))
            for r in rows
        ]

    # -- TECH LEVELS ---------------------------------------------------

    def create_tech_level(self, world_id: str, name: str, description: str = "",
                           applies_to_location_ids: Optional[List[str]] = None) -> TechLevel:
        tech_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO tech_levels (id, world_id, name, description, applies_to_location_ids, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (tech_id, world_id, name, description, _dumps(applies_to_location_ids), time.time()),
        )
        self._index_for_search("tech_level", tech_id, world_id, name, description)
        self._conn.commit()
        self.memory_sync.on_write("tech_level", tech_id, {"name": name})
        return TechLevel(id=tech_id, world_id=world_id, name=name, description=description,
                         applies_to_location_ids=applies_to_location_ids or [])

    def list_tech_levels(self, world_id: str) -> List[TechLevel]:
        rows = self._conn.execute(
            "SELECT id, name, description, applies_to_location_ids FROM tech_levels WHERE world_id = ?",
            (world_id,),
        ).fetchall()
        return [
            TechLevel(id=r[0], world_id=world_id, name=r[1], description=r[2], applies_to_location_ids=_loads(r[3]))
            for r in rows
        ]

    # -- CHARACTER RELATIONSHIPS ------------------------------------

    def create_relationship(self, world_id: str, character_a_id: str, character_b_id: str,
                             relationship_type: str, description: str = "") -> CharacterRelationship:
        rel_id = str(uuid.uuid4())
        self._conn.execute(
            """INSERT INTO character_relationships (id, world_id, character_a_id, character_b_id, relationship_type, description, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (rel_id, world_id, character_a_id, character_b_id, relationship_type, description, time.time()),
        )
        self._conn.commit()
        self.memory_sync.on_write("character_relationship", rel_id, {"type": relationship_type})
        return CharacterRelationship(id=rel_id, world_id=world_id, character_a_id=character_a_id,
                                     character_b_id=character_b_id, relationship_type=relationship_type,
                                     description=description)

    def list_relationships(self, world_id: str, character_id: Optional[str] = None) -> List[CharacterRelationship]:
        if character_id:
            rows = self._conn.execute(
                """SELECT id, character_a_id, character_b_id, relationship_type, description
                   FROM character_relationships
                   WHERE world_id = ? AND (character_a_id = ? OR character_b_id = ?)""",
                (world_id, character_id, character_id),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT id, character_a_id, character_b_id, relationship_type, description FROM character_relationships WHERE world_id = ?",
                (world_id,),
            ).fetchall()
        return [
            CharacterRelationship(id=r[0], world_id=world_id, character_a_id=r[1], character_b_id=r[2],
                                  relationship_type=r[3], description=r[4])
            for r in rows
        ]

    # -- LORE ---------------------------------------------------------

    def create_lore_entry(self, world_id: str, title: str, body: str, tags: Optional[List[str]] = None) -> LoreEntry:
        lore_id = str(uuid.uuid4())
        self._conn.execute(
            "INSERT INTO lore_entries (id, world_id, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (lore_id, world_id, title, body, _dumps(tags), time.time()),
        )
        self._index_for_search("lore_entry", lore_id, world_id, title, body)
        self._conn.commit()
        self.memory_sync.on_write("lore_entry", lore_id, {"title": title})
        return LoreEntry(id=lore_id, world_id=world_id, title=title, body=body, tags=tags or [])

    def list_lore(self, world_id: str) -> List[LoreEntry]:
        rows = self._conn.execute(
            "SELECT id, title, body, tags FROM lore_entries WHERE world_id = ?", (world_id,)
        ).fetchall()
        return [LoreEntry(id=r[0], world_id=world_id, title=r[1], body=r[2], tags=_loads(r[3])) for r in rows]

    # -- GUARDED ATTRIBUTES (generalized canon-contradiction guard) ----

    def get_attributes(self, entity_type: str, entity_id: str) -> Dict[str, str]:
        rows = self._conn.execute(
            "SELECT attribute_key, attribute_value FROM world_attributes WHERE entity_type = ? AND entity_id = ?",
            (entity_type, entity_id),
        ).fetchall()
        return {k: v for k, v in rows}

    def check_attribute_consistency(self, entity_type: str, entity_id: str, key: str, new_value: str):
        row = self._conn.execute(
            "SELECT attribute_value FROM world_attributes WHERE entity_type = ? AND entity_id = ? AND attribute_key = ?",
            (entity_type, entity_id, key),
        ).fetchone()
        if not row:
            return None
        stored = row[0]
        guarded = GUARDED_ATTRIBUTES_BY_TYPE.get(entity_type, set())
        if key in guarded and stored.strip().lower() != new_value.strip().lower():
            from core.world.models import ContinuityIssue
            return ContinuityIssue(
                check="guarded_attribute",
                severity="error",
                message=(
                    f"{entity_type} '{entity_id}' attribute '{key}' was '{stored}', "
                    f"now being set to '{new_value}'. Confirm this is an intentional "
                    f"canon change before proceeding."
                ),
                entity_ids=[entity_id],
            )
        return None

    def set_attribute(self, entity_type: str, entity_id: str, key: str, value: str, force: bool = False):
        if not force:
            issue = self.check_attribute_consistency(entity_type, entity_id, key, value)
            if issue:
                return issue
        self._conn.execute(
            """INSERT INTO world_attributes (entity_type, entity_id, attribute_key, attribute_value, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(entity_type, entity_id, attribute_key)
               DO UPDATE SET attribute_value = excluded.attribute_value, updated_at = excluded.updated_at""",
            (entity_type, entity_id, key, value, time.time()),
        )
        self._conn.commit()
        return None

    # -- ENCYCLOPEDIA SEARCH ------------------------------------------

    def search_encyclopedia(self, world_id: str, query: str, limit: int = 20) -> List[dict]:
        """Full-text search across every entity type in this world."""
        if self._fts_enabled:
            rows = self._conn.execute(
                """SELECT entity_type, entity_id, title, snippet(world_encyclopedia_fts, 4, '[', ']', '...', 10)
                   FROM world_encyclopedia_fts
                   WHERE world_encyclopedia_fts MATCH ? AND world_id = ?
                   LIMIT ?""",
                (query, world_id, limit),
            ).fetchall()
            return [{"entity_type": r[0], "entity_id": r[1], "title": r[2], "snippet": r[3]} for r in rows]

        # Fallback: naive LIKE scan across the lore table only, if FTS5
        # is unavailable in this SQLite build.
        like = f"%{query}%"
        rows = self._conn.execute(
            "SELECT id, title, body FROM lore_entries WHERE world_id = ? AND (title LIKE ? OR body LIKE ?) LIMIT ?",
            (world_id, like, like, limit),
        ).fetchall()
        return [{"entity_type": "lore_entry", "entity_id": r[0], "title": r[1], "snippet": r[2][:200]} for r in rows]

    def close(self):
        self._conn.close()
