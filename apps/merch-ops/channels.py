"""
merch/channels.py -- honest capability registry for merch channels.

Reuses the book side's ConnectorStatus vocabulary unchanged, because the
distinction it encodes is the same one that matters here: a platform either
exposes a real submission API, gates that API behind business approval, or
requires a human at a web form. Print-on-demand does not change that shape.

Platform IDs are namespaced (`etsy_merch`, not `etsy_digital`) so this
registry can be merged with the book registry without an ID collision --
the two describe different product types on the same vendor.

Sourcing note: the POD API facts below come from Josh's own research pass
recorded in CLAUDE.md and are marked there as [Reported, not Certain]. They
are carried at that same confidence here -- `notes` says so per platform
rather than laundering a reported fact into a verified one. Confirm a
platform's endpoint before the first real call against it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from connector_core import CapabilityRegistry, ConnectorStatus, PlatformCapability

__all__ = [
    "MERCH_CHANNELS",
    "merch_registry",
    "CONNECTOR_TYPE_TO_STATUS",
    "ChannelMismatch",
    "reconcile_export_channels",
]


# MerchPulse's own connector_type vocabulary -> our status enum.
CONNECTOR_TYPE_TO_STATUS: dict[str, ConnectorStatus] = {
    "OFFICIAL_API": ConnectorStatus.DIRECT_API,
    "UPLOAD_PACKAGE": ConnectorStatus.MANUAL_UPLOAD_PACKAGE,
    "UNSUPPORTED": ConnectorStatus.UNSUPPORTED,
}

# Formats a print-on-demand channel accepts for artwork upload.
_ART = ["png", "svg"]


MERCH_CHANNELS: tuple[PlatformCapability, ...] = (
    PlatformCapability(
        platform_id="printful",
        name="Printful",
        status=ConnectorStatus.DIRECT_API,
        base_url="https://api.printful.com",
        auth_method="api_key",
        notes=(
            "Real REST API for product creation and order submission. "
            "Unofficial-but-current JS SDK (printful-sdk-js-v2). "
            "[Reported, not Certain] -- from Josh's research pass, CLAUDE.md; "
            "confirm the endpoint before the first live call."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="printify",
        name="Printify",
        status=ConnectorStatus.DIRECT_API,
        base_url="https://api.printify.com",
        auth_method="api_key",
        notes=(
            "Real REST API. Unofficial SDK (printify-sdk-js) by the same author "
            "as Printful's, near-identical shape. [Reported, not Certain] -- "
            "from Josh's research pass, CLAUDE.md; confirm before first live call."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="gooten",
        name="Gooten",
        status=ConnectorStatus.DIRECT_API,
        base_url="https://api.print.io",
        auth_method="api_key",
        notes=(
            "Real REST API and the only one of the three POD vendors with an "
            "OFFICIAL company-maintained SDK (github.com/printdotio) -- making it "
            "the strongest fallback or primary. [Reported, not Certain] -- the "
            "versioned path under this host must be confirmed before first use."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="etsy_merch",
        name="Etsy (physical merch)",
        status=ConnectorStatus.DIRECT_API,
        base_url="https://api.etsy.com",
        auth_method="oauth2",
        notes=(
            "Etsy Open API v3 supports listing creation for physical goods. "
            "Separate registry entry from etsy_digital because the listing "
            "shape and fulfilment differ; same vendor and credentials."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="shopify_merch",
        name="Shopify (physical merch)",
        status=ConnectorStatus.DIRECT_API,
        base_url="https://yourstore.myshopify.com/admin/api",
        auth_method="oauth2",
        notes=(
            "Shopify Admin API creates products and variants directly. Base URL "
            "is per-store and must be filled in from the shop domain."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="tiktok_shop_merch",
        name="TikTok Shop (physical merch)",
        status=ConnectorStatus.APPROVED_PARTNER_API,
        auth_method="oauth2_business_approval",
        notes=(
            "A real Partner API exists for product listing, but access is gated "
            "on an approved seller/partner account. Not UNSUPPORTED -- the "
            "blocker is an approval step, not a missing API."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="amazon_merch",
        name="Amazon Merch on Demand",
        status=ConnectorStatus.MANUAL_UPLOAD_PACKAGE,
        auth_method="web_ui",
        notes=(
            "Invite-only programme with no public listing-submission API; "
            "artwork and product setup go through the Merch on Demand web "
            "dashboard. Same posture as KDP on the book side."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="redbubble",
        name="Redbubble",
        status=ConnectorStatus.MANUAL_UPLOAD_PACKAGE,
        auth_method="web_ui",
        notes=(
            "No usable public API for listing creation. CLAUDE.md policy is "
            "explicit that no scraper should be built against it -- generate an "
            "upload package and let a human complete it."
        ),
        supported_formats=_ART,
    ),
    PlatformCapability(
        platform_id="spring",
        name="Spring (formerly Teespring)",
        status=ConnectorStatus.MANUAL_UPLOAD_PACKAGE,
        auth_method="web_ui",
        notes=(
            "No usable public API. CLAUDE.md policy: skip, and do not build a "
            "scraper against it. Upload package only."
        ),
        supported_formats=_ART,
    ),
)


def merch_registry() -> CapabilityRegistry:
    """A registry containing only merch channels.

    Built fresh each call, so nothing that inspects it can affect another
    pipeline's view. CapabilityRegistry starts empty by design -- an earlier
    version had to clear book platforms out of it first, which is exactly the
    coupling connector_core removed.
    """
    return CapabilityRegistry(list(MERCH_CHANNELS))


# MerchPulse Channel.name -> our platform_id. Names come from the export's
# seeded channel list.
_NAME_TO_PLATFORM_ID: dict[str, str] = {
    "printful": "printful",
    "printify": "printify",
    "gooten": "gooten",
    "etsy": "etsy_merch",
    "shopify": "shopify_merch",
    "tiktok shop": "tiktok_shop_merch",
    "amazon merch on demand": "amazon_merch",
    "redbubble": "redbubble",
    "spring": "spring",
    "teespring": "spring",
}


@dataclass(frozen=True)
class ChannelMismatch:
    """A channel whose exported classification disagrees with the registry,
    or which the registry does not model at all."""

    channel_name: str
    export_type: str
    export_status: Optional[ConnectorStatus]
    registry_status: Optional[ConnectorStatus]
    detail: str

    def __str__(self) -> str:
        return f"{self.channel_name}: {self.detail}"


def reconcile_export_channels(channels: list[dict[str, Any]]) -> list[ChannelMismatch]:
    """Compare a MerchPulse export's Channel rows against this registry.

    A disagreement is not automatically the export being wrong -- it means two
    sources of truth diverged and a human has to settle it. Returning them
    rather than silently preferring one is the whole point.
    """
    registry = merch_registry()
    mismatches: list[ChannelMismatch] = []

    for channel in channels:
        name = str(channel.get("name", "")).strip()
        export_type = str(channel.get("connector_type", "")).strip()
        export_status = CONNECTOR_TYPE_TO_STATUS.get(export_type)

        platform_id = _NAME_TO_PLATFORM_ID.get(name.lower())
        capability = registry.get(platform_id) if platform_id else None

        if capability is None:
            mismatches.append(ChannelMismatch(
                channel_name=name,
                export_type=export_type,
                export_status=export_status,
                registry_status=None,
                detail=(
                    f"present in the export as {export_type or '<no type>'} but "
                    f"not modelled in the merch registry -- its capability is unverified"
                ),
            ))
            continue

        if export_status is None:
            mismatches.append(ChannelMismatch(
                channel_name=name,
                export_type=export_type,
                export_status=None,
                registry_status=capability.status,
                detail=(
                    f"unrecognised connector_type {export_type!r}; registry says "
                    f"{capability.status.value}"
                ),
            ))
            continue

        if export_status is not capability.status:
            mismatches.append(ChannelMismatch(
                channel_name=name,
                export_type=export_type,
                export_status=export_status,
                registry_status=capability.status,
                detail=(
                    f"export says {export_status.value}, registry says "
                    f"{capability.status.value} -- {capability.notes.split('.')[0]}."
                ),
            ))

        if channel.get("connected") and capability.is_draft_export():
            mismatches.append(ChannelMismatch(
                channel_name=name,
                export_type=export_type,
                export_status=export_status,
                registry_status=capability.status,
                detail=(
                    "marked connected, but this platform has no submission API -- "
                    "a 'connected' flag here cannot mean an authenticated API session"
                ),
            ))

    return mismatches
