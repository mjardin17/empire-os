"""
merch/connectors/base.py -- base interface for merch connectors.

Deliberately separate from `publishing/connectors/base.py`. That interface is
book-shaped -- `publish(manuscript_path, cover_path, metadata)` -- and pushing
a t-shirt through it would mean passing artwork as "manuscript_path". A merch
submission has a different shape: one artwork file, a product type, a retail
price, and a set of vendor variants (sizes/colours).

`ConnectorResult` IS reused, so both sides record outcomes
identically and state.py needs no second result format.

Every connector obeys the same two rules:

- **dry_run defaults True.** A real submission requires an explicit choice.
- **Preconditions are checked before the network.** Missing credentials,
  unusable artwork, and demo-seeded data all fail locally with a reason,
  rather than as an opaque vendor error.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from connector_core import ConnectorResult
from ..artwork import ArtworkSource

__all__ = [
    "MerchVariant",
    "MerchPublishRequest",
    "MerchConnector",
    "ConnectorResult",
]


@dataclass(frozen=True)
class MerchVariant:
    """One sellable variant (a size, a colour, or both).

    `vendor_variant_id` is the POD catalogue ID and has no default. Vendor
    catalogue IDs are not guessable and differ per blank -- a wrong one prints
    the right art on the wrong garment, so the caller must look it up.
    """

    vendor_variant_id: str
    label: str = ""
    retail_price: Optional[float] = None

    def price_for(self, default: float) -> float:
        return self.retail_price if self.retail_price is not None else default


@dataclass
class MerchPublishRequest:
    """Everything a POD vendor needs to create one product."""

    title: str
    artwork: ArtworkSource
    retail_price: float
    variants: list[MerchVariant] = field(default_factory=list)
    description: str = ""
    tags: list[str] = field(default_factory=list)
    sku: str = ""
    product_type: str = ""
    external_id: str = ""

    def validate(self, allow_local_upload: bool = False) -> list[str]:
        """Local problems that would make a submission fail or mislead.

        Returned rather than raised so a caller can report every problem at
        once instead of fixing them one round-trip at a time.

        `allow_local_upload` is supplied by the connector, because vendors
        differ on it -- see MerchConnector.accepts_local_upload.
        """
        problems: list[str] = []

        if not self.title.strip():
            problems.append("title is empty")
        if self.retail_price <= 0:
            problems.append(f"retail price must be positive, got {self.retail_price}")
        if not self.variants:
            problems.append("no variants -- nothing to list")

        seen: set[str] = set()
        for variant in self.variants:
            if not variant.vendor_variant_id:
                problems.append(f"variant {variant.label or '<unlabelled>'} has no vendor id")
            elif variant.vendor_variant_id in seen:
                problems.append(f"duplicate vendor variant id {variant.vendor_variant_id}")
            else:
                seen.add(variant.vendor_variant_id)
            if variant.retail_price is not None and variant.retail_price <= 0:
                problems.append(
                    f"variant {variant.label or variant.vendor_variant_id} "
                    f"has non-positive price {variant.retail_price}"
                )

        ok, reason = self.artwork.is_pod_ready(allow_local_upload=allow_local_upload)
        if not ok:
            problems.append(f"artwork: {reason}")

        return problems


class MerchConnector(ABC):
    """Base class for one POD vendor."""

    platform_id: str = "base"
    name: str = "Base Merch Connector"
    credential_env: tuple[str, ...] = ()

    accepts_local_upload: bool = False
    # True when the vendor accepts raw file contents (e.g. base64) rather than
    # only fetching from a URL. Printify does; Printful does not. Defaults to
    # the stricter answer so a new connector cannot accidentally claim it.

    # -- credentials ------------------------------------------------------

    def _credential(self, name: str, credentials: Optional[dict[str, str]]) -> str:
        """Read one credential, preferring an explicit dict over the environment."""
        if credentials and credentials.get(name):
            return str(credentials[name])
        return os.environ.get(name, "")

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        return all(self._credential(n, credentials) for n in self.credential_env)

    def missing_credentials(self, credentials: Optional[dict[str, str]] = None) -> list[str]:
        """Names only. Never returns a value -- these are secrets."""
        return [n for n in self.credential_env if not self._credential(n, credentials)]

    # -- results ----------------------------------------------------------

    def _failure(self, message: str, error_code: str, **metadata: Any
                 ) -> ConnectorResult:
        return ConnectorResult(
            success=False, message=message, platform_id=self.platform_id,
            error_code=error_code, metadata=metadata or None,
        )

    def _success(self, message: str, listing_url: Optional[str] = None,
                 **metadata: Any) -> ConnectorResult:
        return ConnectorResult(
            success=True, message=message, platform_id=self.platform_id,
            listing_url=listing_url, metadata=metadata or None,
        )

    # -- publish ----------------------------------------------------------

    def preflight(self, request: MerchPublishRequest,
                  credentials: Optional[dict[str, str]] = None
                  ) -> Optional[ConnectorResult]:
        """Everything checkable without the network.

        Returns a failure result if the submission cannot proceed, or None if
        it can. Runs identically in dry-run and live mode, so a passing dry run
        means the same checks passed.
        """
        missing = self.missing_credentials(credentials)
        if missing:
            return self._failure(
                f"{self.name}: missing credentials: {', '.join(missing)}",
                "missing_credentials",
            )

        problems = request.validate(allow_local_upload=self.accepts_local_upload)
        if problems:
            return self._failure(
                f"{self.name}: request is not submittable -- "
                + "; ".join(problems),
                "invalid_request",
            )

        return None

    @abstractmethod
    def publish(self, request: MerchPublishRequest,
                credentials: Optional[dict[str, str]] = None,
                dry_run: bool = True) -> ConnectorResult:
        """Create the product on the vendor.

        Args:
            request: the product to create.
            credentials: overrides for the connector's env vars.
            dry_run: when True (the default), run every local check and report
                what would be sent without making a network call.
        """
        ...
