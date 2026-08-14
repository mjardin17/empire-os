"""
StoryForge Publishing Intelligence Studio -- Persistence & Automation
-----------------------------------------------------------------------
SQLite-backed persistence for every artifact this module produces
(market research reports, design briefs, book metadata, platform
packages, marketing assets, approval/checklist records) -- same pattern
as `CharacterMemory`, `WorldEngine`, and `ImageStudio`. Swap `db_path`
for a real Postgres DSN later without changing the public API; this
class is the seam.

`approve_book()` is the automation entry point described in the spec:
when a user approves a book, this
  1. packages platform-ready exports for every requested platform
     (via `PlatformExporter`),
  2. saves every listing package as a draft (nothing is submitted --
     see `platform_export.NullConnector`),
  3. generates a real, checkable publishing checklist from the actual
     saved data (not a fixed placeholder list).
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import asdict
from typing import Dict, List, Optional

from core.publishing.models import (
    ApprovalRecord, BookMetadata, DesignBrief, MarketResearchReport, MarketingAsset,
    PlatformPackage, PublishingChecklistItem,
)
from core.publishing.platform_export import PlatformExportError, PlatformExporter


_SCHEMA = """
CREATE TABLE IF NOT EXISTS pub_research_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_design_briefs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    research_report_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_book_metadata (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_platform_packages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    book_metadata_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_marketing_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS pub_approvals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    book_metadata_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pub_research_project ON pub_research_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_pub_briefs_project ON pub_design_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_pub_metadata_project ON pub_book_metadata(project_id);
CREATE INDEX IF NOT EXISTS idx_pub_packages_project ON pub_platform_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_pub_packages_book ON pub_platform_packages(book_metadata_id);
CREATE INDEX IF NOT EXISTS idx_pub_marketing_project ON pub_marketing_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_pub_approvals_project ON pub_approvals(project_id);
"""


class PublishingStudioError(ValueError):
    pass


class PublishingStudio:
    def __init__(self, db_path: str = "storyforge_publishing.db", output_root: str = "publishing_exports"):
        self.db_path = db_path
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        self.exporter = PlatformExporter(output_root=output_root)

    # -- market research ------------------------------------------------

    def save_research_report(self, report: MarketResearchReport) -> str:
        self._conn.execute(
            "INSERT INTO pub_research_reports (id, project_id, category, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (report.id, report.project_id, report.category, json.dumps(asdict(report)), report.created_at),
        )
        self._conn.commit()
        return report.id

    def get_research_report(self, report_id: str) -> Optional[MarketResearchReport]:
        row = self._conn.execute(
            "SELECT payload FROM pub_research_reports WHERE id = ?", (report_id,)
        ).fetchone()
        return MarketResearchReport(**json.loads(row["payload"])) if row else None

    def list_research_reports(self, project_id: str) -> List[MarketResearchReport]:
        rows = self._conn.execute(
            "SELECT payload FROM pub_research_reports WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [MarketResearchReport(**json.loads(r["payload"])) for r in rows]

    # -- design briefs ----------------------------------------------------

    def save_design_brief(self, brief: DesignBrief) -> str:
        self._conn.execute(
            "INSERT INTO pub_design_briefs (id, project_id, research_report_id, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (brief.id, brief.project_id, brief.research_report_id, json.dumps(asdict(brief)), brief.created_at),
        )
        self._conn.commit()
        return brief.id

    def get_design_brief(self, brief_id: str) -> Optional[DesignBrief]:
        row = self._conn.execute("SELECT payload FROM pub_design_briefs WHERE id = ?", (brief_id,)).fetchone()
        return DesignBrief(**json.loads(row["payload"])) if row else None

    def list_design_briefs(self, project_id: str) -> List[DesignBrief]:
        rows = self._conn.execute(
            "SELECT payload FROM pub_design_briefs WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [DesignBrief(**json.loads(r["payload"])) for r in rows]

    # -- book metadata ----------------------------------------------------

    def save_book_metadata(self, metadata: BookMetadata) -> str:
        self._conn.execute(
            """INSERT INTO pub_book_metadata (id, project_id, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at""",
            (metadata.id, metadata.project_id, json.dumps(asdict(metadata)), metadata.created_at, metadata.updated_at),
        )
        self._conn.commit()
        return metadata.id

    def get_book_metadata(self, metadata_id: str) -> Optional[BookMetadata]:
        row = self._conn.execute("SELECT payload FROM pub_book_metadata WHERE id = ?", (metadata_id,)).fetchone()
        return BookMetadata(**json.loads(row["payload"])) if row else None

    def list_book_metadata(self, project_id: str) -> List[BookMetadata]:
        rows = self._conn.execute(
            "SELECT payload FROM pub_book_metadata WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [BookMetadata(**json.loads(r["payload"])) for r in rows]

    # -- platform packages --------------------------------------------------

    def save_platform_package(self, package: PlatformPackage) -> str:
        self._conn.execute(
            """INSERT INTO pub_platform_packages (id, project_id, book_metadata_id, platform, payload, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (package.id, package.project_id, package.book_metadata_id, package.platform,
             json.dumps(asdict(package)), package.created_at, package.updated_at),
        )
        self._conn.commit()
        return package.id

    def update_platform_package(self, package: PlatformPackage) -> None:
        """Persist a status change (e.g. after publish_package() submits
        it) to an already-saved package. save_platform_package() is
        insert-only (id is the primary key) so a second save would
        raise a UNIQUE constraint error -- this is the update path."""
        self._conn.execute(
            "UPDATE pub_platform_packages SET payload = ?, updated_at = ? WHERE id = ?",
            (json.dumps(asdict(package)), package.updated_at, package.id),
        )
        self._conn.commit()

    def get_platform_package(self, package_id: str) -> Optional[PlatformPackage]:
        row = self._conn.execute("SELECT payload FROM pub_platform_packages WHERE id = ?", (package_id,)).fetchone()
        return PlatformPackage(**json.loads(row["payload"])) if row else None

    def list_platform_packages(self, project_id: str, book_metadata_id: Optional[str] = None) -> List[PlatformPackage]:
        if book_metadata_id:
            rows = self._conn.execute(
                "SELECT payload FROM pub_platform_packages WHERE project_id = ? AND book_metadata_id = ? ORDER BY created_at DESC",
                (project_id, book_metadata_id),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT payload FROM pub_platform_packages WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
            ).fetchall()
        return [PlatformPackage(**json.loads(r["payload"])) for r in rows]

    # -- marketing assets --------------------------------------------------

    def save_marketing_asset(self, asset: MarketingAsset) -> str:
        self._conn.execute(
            "INSERT INTO pub_marketing_assets (id, project_id, channel, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (asset.id, asset.project_id, asset.channel, json.dumps(asdict(asset)), asset.created_at),
        )
        self._conn.commit()
        return asset.id

    def list_marketing_assets(self, project_id: str) -> List[MarketingAsset]:
        rows = self._conn.execute(
            "SELECT payload FROM pub_marketing_assets WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [MarketingAsset(**json.loads(r["payload"])) for r in rows]

    # -- approval / automation workflow -------------------------------------

    def approve_book(
        self,
        project_id: str,
        book_metadata_id: str,
        platforms: List[str],
        source_assets: Optional[Dict[str, str]] = None,
        marketing_asset_ids: Optional[List[str]] = None,
    ) -> ApprovalRecord:
        """The automation entry point: package every requested platform's
        listing, save every draft, and generate a real checklist from
        what was actually produced."""
        metadata = self.get_book_metadata(book_metadata_id)
        if not metadata:
            raise PublishingStudioError(f"book metadata '{book_metadata_id}' not found")
        if metadata.project_id != project_id:
            raise PublishingStudioError("book metadata does not belong to this project")

        packages: List[PlatformPackage] = []
        for platform in platforms:
            try:
                package = self.exporter.export(metadata, platform, source_assets)
            except PlatformExportError as e:
                raise PublishingStudioError(str(e)) from e
            self.save_platform_package(package)
            packages.append(package)

        checklist = self._build_checklist(metadata, packages, marketing_asset_ids or [])

        approval = ApprovalRecord(
            id=str(uuid.uuid4()),
            project_id=project_id,
            book_metadata_id=book_metadata_id,
            approved=True,
            platform_packages=[p.id for p in packages],
            marketing_assets=marketing_asset_ids or [],
            checklist=checklist,
            created_at=time.time(),
        )
        self._conn.execute(
            "INSERT INTO pub_approvals (id, project_id, book_metadata_id, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            (approval.id, project_id, book_metadata_id, json.dumps(asdict(approval)), approval.created_at),
        )
        self._conn.commit()
        return approval

    def get_approval(self, approval_id: str) -> Optional[ApprovalRecord]:
        row = self._conn.execute("SELECT payload FROM pub_approvals WHERE id = ?", (approval_id,)).fetchone()
        return ApprovalRecord(**json.loads(row["payload"])) if row else None

    def list_approvals(self, project_id: str) -> List[ApprovalRecord]:
        rows = self._conn.execute(
            "SELECT payload FROM pub_approvals WHERE project_id = ? ORDER BY created_at DESC", (project_id,)
        ).fetchall()
        return [ApprovalRecord(**json.loads(r["payload"])) for r in rows]

    @staticmethod
    def _build_checklist(metadata: BookMetadata, packages: List[PlatformPackage],
                          marketing_asset_ids: List[str]) -> List[PublishingChecklistItem]:
        """Every item here is a real check against the data just
        produced -- not a fixed static list."""
        items: List[PublishingChecklistItem] = []

        items.append(PublishingChecklistItem(
            label="Title and description present",
            done=bool(metadata.title.strip() and metadata.description.strip()),
            detail=f"title={'set' if metadata.title.strip() else 'MISSING'}, "
                    f"description={'set' if metadata.description.strip() else 'MISSING'}",
        ))
        items.append(PublishingChecklistItem(
            label="Keywords present",
            done=len(metadata.keywords) > 0,
            detail=f"{len(metadata.keywords)} keyword(s)",
        ))
        items.append(PublishingChecklistItem(
            label="Categories present",
            done=len(metadata.categories) > 0,
            detail=f"{len(metadata.categories)} categorie(s)",
        ))
        items.append(PublishingChecklistItem(
            label="Price set",
            done=metadata.price is not None,
            detail=f"price={metadata.price}",
        ))

        for package in packages:
            items.append(PublishingChecklistItem(
                label=f"{package.platform}: listing package prepared",
                done=True,
                detail=f"package_id={package.id}, status={package.status}",
            ))
            items.append(PublishingChecklistItem(
                label=f"{package.platform}: no outstanding constraint warnings",
                done=len(package.constraint_warnings) == 0,
                detail="; ".join(package.constraint_warnings) if package.constraint_warnings else "none",
            ))
            items.append(PublishingChecklistItem(
                label=f"{package.platform}: cover asset attached",
                done="cover" in package.asset_paths,
                detail=str(list(package.asset_paths.keys())),
            ))
            items.append(PublishingChecklistItem(
                label=f"{package.platform}: submit via seller dashboard (manual step)",
                done=False,
                detail="No direct-publish connector is registered for this platform yet -- "
                       "submit the prepared listing.json and assets by hand.",
            ))

        items.append(PublishingChecklistItem(
            label="Marketing assets prepared",
            done=len(marketing_asset_ids) > 0,
            detail=f"{len(marketing_asset_ids)} marketing asset(s) attached to this approval",
        ))

        return items

    def close(self) -> None:
        self._conn.close()
