"""
merch/export_ingest.py -- load and validate a MerchPulse export.

A MerchPulse export is a single JSON object of entity_name -> list[record].
The records form a chain:

    TrendSignal -> Opportunity -> Concept -> Design -> Product -> Listing
                                                    \\-> Campaign -> PublishJob
                                                                 \\-> Order
                                                                 \\-> SalesMetric

This module does three jobs, in order of importance:

1. **Quarantine demo data.** Every entity carries `is_demo`. Seeded demo
   records are structurally identical to real ones, so anything downstream
   that publishes must be able to ask "is this real?" and get a hard answer.
   `real_campaigns()` is the only list a publish path may consume.

2. **Check referential integrity.** A dangling foreign key means the export
   is partial or the app wrote an orphan. Silently ingesting one produces a
   listing with no design, which is exactly the kind of failure that only
   shows up after it is public.

3. **Report reach, not just validity.** A trend with no Opportunity has never
   been acted on. Surfacing that is the difference between "the pipeline ran"
   and "the pipeline produced something".

Structural problems raise. Content observations are returned as findings --
they are judgements about the data, not proof it is broken.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional

__all__ = [
    "MerchExportError",
    "MerchPulseExport",
    "CampaignChain",
    "Finding",
    "load_export",
]

# Entity name -> the foreign keys it declares, as (field_name, target_entity).
# Only keys that must resolve when present are listed. A null value is treated
# as "not linked", which is legal; a non-null value that does not resolve is a
# structural error.
FOREIGN_KEYS: dict[str, tuple[tuple[str, str], ...]] = {
    "Opportunity": (("trend_id", "TrendSignal"),),
    "Concept": (("opportunity_id", "Opportunity"), ("campaign_id", "Campaign")),
    "Design": (("concept_id", "Concept"), ("campaign_id", "Campaign")),
    "Product": (("design_id", "Design"), ("campaign_id", "Campaign")),
    "Listing": (("product_id", "Product"), ("campaign_id", "Campaign")),
    "Campaign": (
        ("trend_id", "TrendSignal"),
        ("opportunity_id", "Opportunity"),
        ("concept_id", "Concept"),
        ("design_id", "Design"),
        ("product_id", "Product"),
        ("listing_id", "Listing"),
    ),
    "PublishJob": (("campaign_id", "Campaign"), ("channel_id", "Channel")),
    "Order": (
        ("campaign_id", "Campaign"),
        ("channel_id", "Channel"),
        ("product_id", "Product"),
    ),
    "SalesMetric": (("campaign_id", "Campaign"), ("channel_id", "Channel")),
}

KNOWN_ENTITIES: tuple[str, ...] = (
    "TrendSignal",
    "Opportunity",
    "Concept",
    "Design",
    "Product",
    "Listing",
    "Campaign",
    "Channel",
    "PublishJob",
    "Order",
    "SalesMetric",
    "AuditLog",
)

# A PublishJob in this state has actually reached a live platform.
LIVE_PUBLISH_STATUSES: frozenset[str] = frozenset({"published", "live", "success"})


class MerchExportError(Exception):
    """The export is structurally unusable -- malformed, or a foreign key that
    is present does not resolve."""


@dataclass(frozen=True)
class Finding:
    """An observation about the export's content rather than its structure.

    `severity` is advisory: "blocker" means do not publish from this export,
    "warn" means a human should look, "info" is context.
    """

    severity: str
    entity: str
    message: str

    def __str__(self) -> str:
        return f"[{self.severity.upper():7}] {self.entity}: {self.message}"


@dataclass(frozen=True)
class CampaignChain:
    """One campaign resolved into the full set of records it points at.

    Every field except `campaign` may be None -- a campaign that is missing its
    design or listing is incomplete, not invalid, and `is_publishable()` is
    what decides whether it may be acted on.
    """

    campaign: dict[str, Any]
    trend: Optional[dict[str, Any]] = None
    opportunity: Optional[dict[str, Any]] = None
    concept: Optional[dict[str, Any]] = None
    design: Optional[dict[str, Any]] = None
    product: Optional[dict[str, Any]] = None
    listing: Optional[dict[str, Any]] = None

    @property
    def name(self) -> str:
        return str(self.campaign.get("name", self.campaign.get("id", "<unnamed>")))

    @property
    def is_demo(self) -> bool:
        """True if *any* record in the chain is demo-seeded.

        Deliberately pessimistic: a chain is only real if every part of it is.
        A real campaign hanging off a demo design would still put demo artwork
        on a live product.
        """
        parts = (
            self.campaign, self.trend, self.opportunity,
            self.concept, self.design, self.product, self.listing,
        )
        return any(bool(p.get("is_demo")) for p in parts if p is not None)

    @property
    def missing_parts(self) -> list[str]:
        required = {
            "concept": self.concept,
            "design": self.design,
            "product": self.product,
            "listing": self.listing,
        }
        return sorted(name for name, value in required.items() if value is None)

    def is_publishable(self) -> tuple[bool, str]:
        """Whether this chain may be handed to a publish connector.

        Returns (ok, reason). Reason is always populated on failure so the
        caller can report *why* rather than just skipping silently.
        """
        if self.is_demo:
            return False, "chain contains demo-seeded records"
        if self.missing_parts:
            return False, f"incomplete chain, missing: {', '.join(self.missing_parts)}"
        if not self.campaign.get("approved"):
            return False, "campaign is not approved"
        if self.design and not self.design.get("print_quality_ok"):
            return False, "design has not passed the print-quality check"
        if self.concept and self.concept.get("ip_vetoed"):
            return False, "concept was vetoed on IP grounds"
        return True, "ok"


class MerchPulseExport:
    """Parsed, index-backed view over a MerchPulse export file."""

    def __init__(self, data: dict[str, list[dict[str, Any]]], source: str = "<memory>"):
        if not isinstance(data, dict):
            raise MerchExportError(f"{source}: top level must be an object of entity lists")
        self.source = source
        self.data = data
        self._index: dict[str, dict[str, dict[str, Any]]] = {}
        self._build_index()
        self._check_referential_integrity()

    # -- construction -----------------------------------------------------

    def _build_index(self) -> None:
        for entity, records in self.data.items():
            if not isinstance(records, list):
                raise MerchExportError(
                    f"{self.source}: entity '{entity}' must map to a list, got {type(records).__name__}"
                )
            by_id: dict[str, dict[str, Any]] = {}
            for i, record in enumerate(records):
                if not isinstance(record, dict):
                    raise MerchExportError(
                        f"{self.source}: {entity}[{i}] must be an object, got {type(record).__name__}"
                    )
                record_id = record.get("id")
                if not record_id:
                    raise MerchExportError(f"{self.source}: {entity}[{i}] has no id")
                if record_id in by_id:
                    raise MerchExportError(
                        f"{self.source}: {entity} has duplicate id {record_id!r}"
                    )
                by_id[record_id] = record
            self._index[entity] = by_id

    def _check_referential_integrity(self) -> None:
        """Every non-null foreign key must resolve. Null means 'not linked',
        which the schema allows (a Concept can exist before its Campaign)."""
        errors: list[str] = []
        for entity, keys in FOREIGN_KEYS.items():
            for record in self.records(entity):
                for field_name, target in keys:
                    ref = record.get(field_name)
                    if ref is None or ref == "":
                        continue
                    if self.get(target, ref) is None:
                        errors.append(
                            f"{entity}[{record.get('id')}].{field_name} -> "
                            f"{target}[{ref}] does not exist"
                        )
        if errors:
            raise MerchExportError(
                f"{self.source}: {len(errors)} dangling reference(s):\n  "
                + "\n  ".join(errors)
            )

    # -- access -----------------------------------------------------------

    def records(self, entity: str) -> list[dict[str, Any]]:
        return list(self._index.get(entity, {}).values())

    def get(self, entity: str, record_id: Optional[str]) -> Optional[dict[str, Any]]:
        if record_id is None:
            return None
        return self._index.get(entity, {}).get(record_id)

    def counts(self) -> dict[str, int]:
        return {entity: len(rows) for entity, rows in self._index.items()}

    def unknown_entities(self) -> list[str]:
        """Entities present in the file that this module does not model.

        Not an error -- the app may have added one -- but it means anything in
        them is being ignored, which the caller should know.
        """
        return sorted(set(self._index) - set(KNOWN_ENTITIES))

    # -- chains -----------------------------------------------------------

    def campaign_chains(self) -> list[CampaignChain]:
        chains: list[CampaignChain] = []
        for campaign in self.records("Campaign"):
            chains.append(CampaignChain(
                campaign=campaign,
                trend=self.get("TrendSignal", campaign.get("trend_id")),
                opportunity=self.get("Opportunity", campaign.get("opportunity_id")),
                concept=self.get("Concept", campaign.get("concept_id")),
                design=self.get("Design", campaign.get("design_id")),
                product=self.get("Product", campaign.get("product_id")),
                listing=self.get("Listing", campaign.get("listing_id")),
            ))
        return chains

    def real_campaigns(self) -> list[CampaignChain]:
        """The only list a publish path may consume."""
        return [c for c in self.campaign_chains() if not c.is_demo]

    def demo_campaigns(self) -> list[CampaignChain]:
        return [c for c in self.campaign_chains() if c.is_demo]

    def publishable_campaigns(self) -> list[CampaignChain]:
        return [c for c in self.campaign_chains() if c.is_publishable()[0]]

    # -- findings ---------------------------------------------------------

    def findings(self) -> list[Finding]:
        """Content-level observations. Ordered blocker -> warn -> info."""
        out: list[Finding] = []
        out.extend(self._demo_findings())
        out.extend(self._trend_findings())
        out.extend(self._reach_findings())
        out.extend(self._publish_findings())

        rank = {"blocker": 0, "warn": 1, "info": 2}
        return sorted(out, key=lambda f: (rank.get(f.severity, 3), f.entity))

    def _demo_findings(self) -> Iterator[Finding]:
        chains = self.campaign_chains()
        demo = [c for c in chains if c.is_demo]
        if demo and len(demo) == len(chains):
            yield Finding(
                "blocker", "Campaign",
                f"all {len(chains)} campaign(s) are demo-seeded -- this export "
                f"contains no real product. Nothing here may be published.",
            )
        elif demo:
            yield Finding(
                "warn", "Campaign",
                f"{len(demo)} of {len(chains)} campaign(s) are demo-seeded and "
                f"are excluded from publishing.",
            )

        for entity in ("Order", "SalesMetric"):
            rows = self.records(entity)
            if rows and all(r.get("is_demo") for r in rows):
                yield Finding(
                    "warn", entity,
                    f"every {entity} row is demo-seeded -- revenue and profit "
                    f"figures derived from this export are fictional.",
                )

    def _trend_findings(self) -> Iterator[Finding]:
        for trend in self.records("TrendSignal"):
            if trend.get("is_demo"):
                continue
            phrase = trend.get("phrase", trend.get("id"))
            source = trend.get("source", "")
            if source == "web_search" and not (trend.get("source_url") or "").strip():
                yield Finding(
                    "warn", "TrendSignal",
                    f"{phrase!r} cites source='web_search' but carries no "
                    f"source_url -- its evidence cannot be checked.",
                )

    def _reach_findings(self) -> Iterator[Finding]:
        """Trends that never became opportunities never went anywhere."""
        acted_on = {
            o.get("trend_id") for o in self.records("Opportunity") if o.get("trend_id")
        }
        stranded = [
            t for t in self.records("TrendSignal")
            if not t.get("is_demo") and t.get("id") not in acted_on
        ]
        if stranded:
            names = ", ".join(repr(t.get("phrase")) for t in stranded[:3])
            more = f" (+{len(stranded) - 3} more)" if len(stranded) > 3 else ""
            yield Finding(
                "info", "TrendSignal",
                f"{len(stranded)} real trend(s) have no Opportunity -- researched "
                f"but never acted on: {names}{more}",
            )

    def _publish_findings(self) -> Iterator[Finding]:
        jobs = self.records("PublishJob")
        if not jobs:
            return
        live = [j for j in jobs if str(j.get("status", "")).lower() in LIVE_PUBLISH_STATUSES]
        if not live:
            modes = sorted({str(j.get("mode", "?")) for j in jobs})
            yield Finding(
                "info", "PublishJob",
                f"{len(jobs)} publish job(s), none live -- all in mode(s): "
                f"{', '.join(modes)}. Nothing has reached a real platform.",
            )

        connected = {c.get("id") for c in self.records("Channel") if c.get("connected")}
        for job in live:
            if job.get("channel_id") not in connected:
                yield Finding(
                    "blocker", "PublishJob",
                    f"job {job.get('id')} claims status "
                    f"{job.get('status')!r} on channel "
                    f"{job.get('channel_name')!r}, which is not connected.",
                )


def load_export(path: str | Path) -> MerchPulseExport:
    """Load a MerchPulse export from disk.

    Raises MerchExportError on anything that makes the file unusable, so a
    caller that gets a return value has a structurally sound export.
    """
    p = Path(path)
    if not p.is_file():
        raise MerchExportError(f"{p}: not a file")
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise MerchExportError(f"{p}: invalid JSON -- {exc}") from exc
    return MerchPulseExport(raw, source=str(p))
