"""
storyforge2/publishing/connectors/etsy_digital.py — Etsy digital-download
book listings, built on the real, tested lib/etsy_listing.py client.

This is NOT an independent Etsy implementation. lib/etsy_listing.py is the
canonical Etsy client for this repo (see CLAUDE.md's 2026-08-20 decision
after a third-party Node connector duplicated and re-broke logic already
fixed here) — this connector only builds an EtsyProduct/EtsyDigitalFileSource
from the pipeline's real book files and hands them to EtsyListingClient. No
validation or request-shape logic is duplicated here.

Draft-only, always. create_listing() is called with target_state="draft" —
never "active" — regardless of the `dry_run` flag this connector receives.
Creating a draft is free and buyer-invisible; activating a listing spends
Etsy's per-listing fee and makes it public. That is a deliberate, separate,
human-gated action (same reasoning as the eBay/Etsy bridge service's
two-gate live-publish design in scripts/listing_service.py), not something
this pipeline stage should ever do on its own.

Credentials (env var or passed `credentials` dict — same lookup pattern as
payhip.py): ETSY_ACCESS_TOKEN, ETSY_SHOP_ID, ETSY_API_KEY, ETSY_TAXONOMY_ID.
ETSY_TAXONOMY_ID has no safe default — Etsy has no default category, and a
guessed one produces a listing filed under the wrong section (same reasoning
lib/etsy_listing.py already documents for shipping_profile_id). All four are
required for is_configured() to return True; as of 2026-08-20 none of them
exist yet (Etsy's app registration is still pending Etsy's own review — see
CLAUDE.md) so this connector is exercised only in dry-run so far.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from lib.etsy_listing import (
    EtsyDigitalFileSource,
    EtsyImageSource,
    EtsyListingClient,
    EtsyListingError,
    EtsyProduct,
    EtsyValidationError,
)
from storyforge2.publishing.connectors.base import PublishingConnector, PublishingConnectorResult

__all__ = ["EtsyDigitalConnector"]

DEFAULT_PRICE_USD = "9.99"

# Digital books have nothing physical to hold — who_made is honestly "i_did"
# (the account holder is the seller of record for a Book Factory title) and
# when_made is "made_to_order" (the file is generated/available on demand,
# not tied to a historical manufacture date). Neither triggers the
# who_made=="someone_else" vintage cross-check in EtsyProduct.__post_init__.
WHO_MADE = "i_did"
WHEN_MADE = "made_to_order"


class EtsyDigitalConnector(PublishingConnector):
    platform_id = "etsy_digital"
    name = "Etsy (digital products)"

    # Maps this connector's internal config keys to the env var / credentials
    # dict key a human would actually set — used both to read config and to
    # report exactly which of the four is missing.
    _CONFIG_ENV_KEYS = {
        "access_token": "ETSY_ACCESS_TOKEN",
        "shop_id": "ETSY_SHOP_ID",
        "api_key": "ETSY_API_KEY",
        "taxonomy_id": "ETSY_TAXONOMY_ID",
    }

    def _read_config(self, credentials: Optional[dict[str, str]]) -> dict[str, str]:
        credentials = credentials or {}
        return {
            key: credentials.get(env_key) or os.environ.get(env_key, "")
            for key, env_key in self._CONFIG_ENV_KEYS.items()
        }

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        config = self._read_config(credentials)
        return all(config.values())

    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        config = self._read_config(credentials)
        missing = [self._CONFIG_ENV_KEYS[k] for k, v in config.items() if not v]
        if missing:
            return PublishingConnectorResult(
                success=False,
                message=f"Etsy credentials not configured: missing {', '.join(missing)}",
                platform_id=self.platform_id,
                error_code="missing_credentials",
            )

        if not manuscript_path.exists():
            return PublishingConnectorResult(
                success=False,
                message=f"Manuscript not found: {manuscript_path}",
                platform_id=self.platform_id,
                error_code="file_not_found",
            )

        title = metadata.get("title", "")
        slug = metadata.get("slug") or "book"
        description = metadata.get("description") or f"{title} — a digital ebook download."
        price = str(metadata.get("price") or DEFAULT_PRICE_USD)

        images: tuple[EtsyImageSource, ...] = ()
        if cover_path and cover_path.exists():
            images = (EtsyImageSource(local_path=str(cover_path)),)

        try:
            product = EtsyProduct(
                sku=f"BOOK-{slug}".upper(),
                title=title,
                description=description,
                price=price,
                who_made=WHO_MADE,
                when_made=WHEN_MADE,
                taxonomy_id=config["taxonomy_id"],
                listing_type="download",
                images=images,
                digital_files=(EtsyDigitalFileSource(
                    local_path=str(manuscript_path), filename=manuscript_path.name),),
            )
        except EtsyValidationError as exc:
            return PublishingConnectorResult(
                success=False,
                message=f"Listing rejected before any request was sent: {exc}",
                platform_id=self.platform_id,
                error_code="validation_error",
            )

        client = EtsyListingClient(
            config["access_token"], config["shop_id"], config["api_key"])

        try:
            # target_state is always "draft" — see module docstring. Real
            # activation is a deliberate, separate, human-gated step this
            # connector never performs on its own.
            result = client.create_listing(product, target_state="draft", dry_run=dry_run)
        except EtsyListingError as exc:
            return PublishingConnectorResult(
                success=False,
                message=str(exc),
                platform_id=self.platform_id,
                error_code=f"etsy_{exc.step}_failed",
                metadata={"listing_id": exc.listing_id, "etsy_status": exc.status,
                          "etsy_body": exc.body},
            )

        if result.dry_run:
            message = (
                f"[DRY_RUN] Would create an Etsy draft listing for '{title}' "
                f"(shop {config['shop_id']}, type=download, "
                f"{len(product.digital_files)} file(s), {len(images)} image(s))"
            )
        else:
            message = (
                f"Etsy draft listing created (listing_id={result.listing_id}) — "
                "NOT published. Activating it (spends Etsy's listing fee, makes "
                "it public) is a separate, manual step."
            )

        return PublishingConnectorResult(
            success=True,
            message=message,
            platform_id=self.platform_id,
            metadata={
                "listing_id": result.listing_id,
                "dry_run": result.dry_run,
                "published": result.published,
                "files_uploaded": result.files_uploaded,
                "images_uploaded": result.images_uploaded,
                "steps": result.steps,
                "payloads": result.payloads,
            },
        )
