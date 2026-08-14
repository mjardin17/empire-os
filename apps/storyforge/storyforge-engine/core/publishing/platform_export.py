"""
StoryForge Publishing Intelligence Studio -- Platform Export
----------------------------------------------------------------
Builds a platform-shaped listing package (metadata trimmed/validated
against that platform's known field constraints, plus an organized
folder of the asset files a human would need to complete the listing).

This does NOT publish anything automatically. Every platform without a
registered, credentialed `PublishingConnector` gets a `NullConnector`:
files and listing content are prepared to disk for human review, per
the requirement that "where direct publishing is not available,
prepare the files and listing content for the user to review before
posting."

Adding real direct publishing later:
  1. Subclass `PublishingConnector`.
  2. Implement `submit(package, credentials)`.
  3. Register it in `_CONNECTORS`.
Nothing else in Image Studio, Book Studio, or this module changes --
same seam pattern as `core.world.world_engine.WorldMemorySync` and
`core.image.providers.ImageProvider`.

Platform field limits below are the commonly documented ones as of this
writing; marketplaces change these without much notice, so
`constraint_warnings` are advisory, not a hard validation gate -- always
confirm against the platform's current seller/publisher documentation
before submitting.
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.publishing.models import BookMetadata, PlatformPackage, SELLING_PLATFORMS


class PlatformExportError(ValueError):
    pass


# Advisory, commonly-documented limits per platform. Not exhaustive --
# extend freely; unknown fields are simply not checked.
PLATFORM_CONSTRAINTS: Dict[str, Dict[str, Any]] = {
    "kdp": {"max_keywords": 7, "max_categories": 10, "max_title_chars": 200, "max_subtitle_chars": 200},
    "etsy": {"max_keywords": 13, "max_tag_chars": 20, "max_title_chars": 140},
    "shopify": {"max_title_chars": 70, "max_description_chars": 320},
    "gumroad": {"max_title_chars": 100},
    "payhip": {"max_title_chars": 100},
    "woocommerce": {"max_title_chars": 200},
    # Draft2Digital distributes one EPUB to B&N/Apple/Kobo/Scribd/Tolino/
    # Vivlio/BorrowBox in one call -- these are D2D's own limits, the
    # widest of that group's, since D2D itself validates per-retailer.
    "d2d": {"max_keywords": 7, "max_title_chars": 200},
}


def _check_constraints(platform: str, metadata: BookMetadata) -> List[str]:
    warnings: List[str] = []
    limits = PLATFORM_CONSTRAINTS.get(platform, {})

    max_kw = limits.get("max_keywords")
    if max_kw and len(metadata.keywords) > max_kw:
        warnings.append(
            f"{platform}: {len(metadata.keywords)} keywords supplied, commonly-documented limit is {max_kw}. "
            f"Trim before submitting."
        )
    max_cat = limits.get("max_categories")
    if max_cat and len(metadata.categories) > max_cat:
        warnings.append(f"{platform}: {len(metadata.categories)} categories supplied, limit is {max_cat}.")
    max_title = limits.get("max_title_chars")
    if max_title and len(metadata.title) > max_title:
        warnings.append(f"{platform}: title is {len(metadata.title)} chars, limit is {max_title}.")
    max_subtitle = limits.get("max_subtitle_chars")
    if max_subtitle and len(metadata.subtitle) > max_subtitle:
        warnings.append(f"{platform}: subtitle is {len(metadata.subtitle)} chars, limit is {max_subtitle}.")
    max_tag_chars = limits.get("max_tag_chars")
    if max_tag_chars:
        long_tags = [k for k in metadata.keywords if len(k) > max_tag_chars]
        if long_tags:
            warnings.append(f"{platform}: {len(long_tags)} tag(s) exceed {max_tag_chars} characters: {long_tags}")
    max_desc = limits.get("max_description_chars")
    if max_desc and len(metadata.description) > max_desc:
        warnings.append(f"{platform}: description is {len(metadata.description)} chars, limit is {max_desc}.")
    return warnings


def _shape_listing_fields(platform: str, metadata: BookMetadata) -> Dict[str, Any]:
    """Maps StoryForge's generic BookMetadata onto each platform's
    commonly-used field names. Kept as one small function per platform
    so adding a platform never touches the others."""
    base = {
        "title": metadata.title,
        "description": metadata.description,
        "price": metadata.price,
    }
    if platform == "kdp":
        return {**base, "subtitle": metadata.subtitle, "keywords": metadata.keywords[:7],
                "categories": metadata.categories[:10], "a_plus_content": metadata.a_plus_content}
    if platform == "d2d":
        return {**base, "subtitle": metadata.subtitle, "keywords": metadata.keywords[:7],
                "language": "en"}
    if platform == "etsy":
        return {**base, "tags": metadata.keywords[:13], "category_path": metadata.categories[:1]}
    if platform == "shopify":
        return {**base, "seo_title": metadata.title[:70], "tags": metadata.keywords,
                "product_type": (metadata.categories[:1] or [""])[0]}
    if platform in ("gumroad", "payhip"):
        return {**base, "summary": metadata.marketing_copy}
    if platform == "woocommerce":
        return {**base, "categories": metadata.categories, "tags": metadata.keywords}
    return base


class PublishingConnector(ABC):
    """Seam for real, credentialed direct-publish integrations."""

    name: str = "base"

    @abstractmethod
    def submit(self, package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        ...

    def is_configured(self, credentials: Optional[Dict[str, str]] = None) -> bool:
        return False


class NullConnector(PublishingConnector):
    """Default connector for every platform until a real one is wired
    up: never submits anything, always tells the caller to review the
    prepared package by hand. This is the honest default, not a stub
    standing in for missing logic -- direct marketplace submission
    requires seller credentials and each marketplace's own API
    (Amazon SP-API, Etsy Open API v3, Shopify Admin API, etc.), which
    this repo does not hold."""

    name = "null"

    def submit(self, package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        return {
            "status": "manual_review_required",
            "message": (
                f"No direct-publish connector is configured for '{package.platform}'. "
                f"The listing package has been prepared at the recorded asset paths -- "
                f"review and submit it through that platform's own seller dashboard, or "
                f"register a PublishingConnector subclass for '{package.platform}' once "
                f"you have API credentials."
            ),
        }


_CONNECTORS: Dict[str, PublishingConnector] = {}


def get_connector(platform: str) -> PublishingConnector:
    return _CONNECTORS.get(platform, NullConnector())


def register_connector(platform: str, connector: PublishingConnector) -> None:
    """Register a real, credentialed connector for a platform. Called
    once per platform when direct-publish support is added; everything
    else in this module keeps working unchanged."""
    _CONNECTORS[platform] = connector


class PlatformExporter:
    """Builds one PlatformPackage per requested platform: a shaped
    metadata dict plus an organized directory of the asset files a
    human needs to complete/review the listing."""

    def __init__(self, output_root: str = "publishing_exports"):
        self.output_root = output_root

    def export(
        self,
        metadata: BookMetadata,
        platform: str,
        source_assets: Optional[Dict[str, str]] = None,
    ) -> PlatformPackage:
        if platform not in SELLING_PLATFORMS:
            raise PlatformExportError(
                f"Unknown platform '{platform}'. Supported: {', '.join(sorted(SELLING_PLATFORMS))}"
            )

        package_dir = Path(self.output_root) / metadata.project_id / platform
        package_dir.mkdir(parents=True, exist_ok=True)

        asset_paths: Dict[str, str] = {}
        for kind, src in (source_assets or {}).items():
            src_path = Path(src)
            if not src_path.exists():
                continue
            dest = package_dir / src_path.name
            shutil.copy2(src_path, dest)
            asset_paths[kind] = str(dest)

        listing_fields = _shape_listing_fields(platform, metadata)
        warnings = _check_constraints(platform, metadata)

        listing_path = package_dir / "listing.json"
        listing_path.write_text(json.dumps(listing_fields, indent=2), encoding="utf-8")
        asset_paths["listing_json"] = str(listing_path)

        now = time.time()
        return PlatformPackage(
            id=str(uuid.uuid4()),
            project_id=metadata.project_id,
            book_metadata_id=metadata.id,
            platform=platform,
            status="ready" if not warnings else "draft",
            listing_fields=listing_fields,
            asset_paths=asset_paths,
            constraint_warnings=warnings,
            created_at=now,
            updated_at=now,
        )


def publish_package(package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """The call site that was missing: get_connector()/register_connector()
    were fully built but nothing ever called connector.submit(). This is
    that call. Mutates package.status in place based on the result so
    the caller can persist it (see main.py's POST
    /publishing/platform-packages/{id}/submit)."""
    connector = get_connector(package.platform)
    result = connector.submit(package, credentials)

    status = result.get("status", "")
    if status == "manual_review_required":
        package.status = "ready"
    elif status in ("success", "published", "submitted"):
        package.status = "published"
    elif status == "skipped":
        # Connector declined to attempt (missing credentials/asset) --
        # distinct from a real submission failure, same honesty split
        # NullConnector already draws for "no connector at all".
        package.status = "not_configured"
    else:
        package.status = "failed"
    package.updated_at = time.time()

    return {**result, "connector": connector.name, "package_status": package.status}
