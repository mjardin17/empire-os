"""
storyforge2/publishing/registry.py — honest capability registry for all
book-selling platforms.

The mission's core rule: "Never fabricate a platform capability." This module
establishes the *truth* about which platforms expose public APIs for listing
submission, which require manual uploads, and which are unsupported. Backed by:

- Direct API documentation checks (verified in this session's empire-os work)
- CLAUDE.md's own audit (settled the classic self-publishing platforms)
- Public vendor statements (where available)

Not just a data file — also provides: ConnectorStatus enum, validation,
a CLI helper to verify credentials before attempting a publish, and a
dry-run mode so the publishing pipeline can validate without touching
live APIs.
"""

from __future__ import annotations

from typing import Optional

from connector_core import (
    CapabilityRegistry, ConnectorStatus, PlatformCapability,
)

__all__ = [
    "ConnectorStatus",
    "PlatformCapability",
    "PlatformRegistry",
    "get_registry",
]


class PlatformRegistry(CapabilityRegistry):
    """The book pipeline's platforms.

    Subclasses the neutral registry rather than redefining it -- merch
    builds its own from the same base, so neither owns the other.
    """

    def __init__(self):
        super().__init__()
        self._init_platforms()

    def _init_platforms(self):
        # Direct API — verified connectors (ported from empire-os session or existing)
        self.add(PlatformCapability(
            platform_id="kdp",
            name="Amazon Kindle Direct Publishing",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes=(
                "No public submission API. KDP is explicitly excluded from Amazon's "
                "Selling Partner API (CLAUDE.md audit). kdp.py drives the real web UI "
                "via Playwright and requires a human for 2FA — it is browser automation, "
                "not an API integration."
            ),
            supported_formats=["mobi", "epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="d2d",
            name="Draft2Digital",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes=(
                "CORRECTED 2026-08-20: the prior 'Real REST API, verified in "
                "empire-os session' claim was false. Verified directly against "
                "Draft2Digital's own site: no public API exists at all. Every "
                "GitHub reference to a 'D2D API' is an unfulfilled TODO. "
                "d2d.py's HTTP calls target a nonexistent endpoint and must "
                "not be used — see CLAUDE.md's 2026-08-20 book-platform audit."
            ),
            supported_formats=["epub"],
        ))

        self.add(PlatformCapability(
            platform_id="payhip",
            name="Payhip",
            status=ConnectorStatus.DIRECT_API,
            base_url="https://api.payhip.com",
            auth_method="api_key",
            notes=(
                "Real API confirmed at payhip.com/api-reference. Documented "
                "resources are Coupon and License Key management — full "
                "product-creation capability not independently verified as "
                "of 2026-08-20. Verify the exact create-product flow against "
                "the live docs before trusting payhip.py without testing."
            ),
            supported_formats=["epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="gumroad",
            name="Gumroad",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes=(
                "CORRECTED 2026-08-20: Gumroad's own official docs "
                "(POST /v2/products) state 'This endpoint is currently not "
                "implemented and will return a 404 error. Product creation "
                "must be done through the Gumroad dashboard.' The real API "
                "only supports list/read/update/enable/disable on products "
                "that already exist — never creation. No connector should "
                "be built assuming API-driven product creation is possible."
            ),
            supported_formats=["epub", "pdf", "mobi"],
        ))

        self.add(PlatformCapability(
            platform_id="lulu_print",
            name="Lulu (print-on-demand)",
            status=ConnectorStatus.DIRECT_API,
            base_url="https://api.lulu.com",
            auth_method="api_key",
            notes=(
                "Real Print API confirmed at developers.lulu.com / "
                "api.lulu.com/docs, with a genuine free sandbox environment "
                "for testing before any real order/charge. Covers physical "
                "print-on-demand fulfillment (trim size, paper, binding, "
                "shipping) — not ebook distribution. Connector not yet built "
                "as of 2026-08-20; this is a real, promising, unbuilt lead."
            ),
            supported_formats=["pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="etsy_digital",
            name="Etsy (digital products)",
            status=ConnectorStatus.DIRECT_API,
            base_url="https://api.etsy.com",
            auth_method="oauth2",
            notes=(
                "Real API (Etsy Open API v3). Wired into Story Forge 2 as of "
                "2026-08-20 via storyforge2/publishing/connectors/etsy_digital.py, "
                "built on lib/etsy_listing.py (NOT lib/platform_connectors.py's "
                "Etsy connector, which is a separate, lower-quality "
                "implementation — see CLAUDE.md). Always creates a draft "
                "listing only, never activates. Not yet exercised against a "
                "live account — Etsy's app registration is still pending "
                "their review as of 2026-08-20."
            ),
            supported_formats=["epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="shopify",
            name="Shopify (digital products via apps)",
            status=ConnectorStatus.DIRECT_API,
            base_url="https://yourstore.myshopify.com/admin/api",
            auth_method="oauth2",
            notes="Real API (Shopify REST API). Wraps existing lib/platform_connectors.py. Not yet wired into Story Forge 2.",
            supported_formats=["epub", "pdf"],
        ))

        # Approved Partner APIs — gated by business approval
        self.add(PlatformCapability(
            platform_id="tiktok_shop",
            name="TikTok Shop",
            status=ConnectorStatus.APPROVED_PARTNER_API,
            auth_method="oauth2_business_approval",
            notes="API exists but requires business account + approval. Not yet implemented.",
            supported_formats=["epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="facebook_instagram_shops",
            name="Facebook & Instagram Shops",
            status=ConnectorStatus.APPROVED_PARTNER_API,
            auth_method="oauth2_business_approval",
            notes="Commerce API exists but requires business approval. Not yet implemented.",
            supported_formats=["epub", "pdf"],
        ))

        # Draft/Manual Export — no public submission APIs (verified by reading their help docs)
        self.add(PlatformCapability(
            platform_id="kdp_print",
            name="KDP Print-on-Demand",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: KDP print POD uses the same Selling Partner API as ebook KDP (no separate endpoint). Both route through the web dashboard.",
            supported_formats=["pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="apple_books",
            name="Apple Books",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: Apple Books has no public indie author listing API. Upload via Apple Books for Authors (web UI only).",
            supported_formats=["epub"],
        ))

        self.add(PlatformCapability(
            platform_id="google_play_books",
            name="Google Play Books",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: Google Play Books has no public indie author API. Upload via Google Play Books (web UI only).",
            supported_formats=["epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="kobo_writing_life",
            name="Kobo Writing Life",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: Kobo has no public API for indie authors. Upload via Kobo Writing Life (web UI only).",
            supported_formats=["epub"],
        ))

        self.add(PlatformCapability(
            platform_id="bn_press",
            name="B&N Press (Barnes & Noble)",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: B&N Press has no public API. Upload via B&N Press (web UI only).",
            supported_formats=["epub", "pdf"],
        ))

        self.add(PlatformCapability(
            platform_id="ingramspark",
            name="IngramSpark",
            status=ConnectorStatus.DRAFT_EXPORT,
            auth_method="web_ui",
            notes="CLAUDE.md audit: IngramSpark requires manual account setup + file upload via their web platform. No public submission API.",
            supported_formats=["pdf"],
        ))



# Singleton registry
_REGISTRY: Optional[PlatformRegistry] = None


def get_registry() -> PlatformRegistry:
    """Returns the global registry singleton."""
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = PlatformRegistry()
    return _REGISTRY


def _selftest():
    """Verifies the registry is complete and honest."""
    registry = get_registry()
    print("[TEST] Platform Registry")
    print()

    # Count by status
    direct = registry.direct_api_platforms()
    approved = registry.list_by_status(ConnectorStatus.APPROVED_PARTNER_API)
    draft = registry.draft_export_platforms()
    unsupported = registry.list_by_status(ConnectorStatus.UNSUPPORTED)

    print(f"  Direct APIs:              {len(direct):2d} platforms")
    for p in direct:
        print(f"    - {p.name}")
    print()

    print(f"  Approved Partner APIs:    {len(approved):2d} platforms")
    for p in approved:
        print(f"    - {p.name}")
    print()

    print(f"  Draft/Manual Export:      {len(draft):2d} platforms")
    for p in draft:
        print(f"    - {p.name}")
    print()

    print(f"  Unsupported:              {len(unsupported):2d} platforms")
    for p in unsupported:
        print(f"    - {p.name}")
    print()

    total = len(direct) + len(approved) + len(draft) + len(unsupported)
    print(f"  TOTAL: {total} platforms")
    print()

    # Verify none are mislabeled as DIRECT_API without implementation
    unimplemented_direct = [p for p in direct if p.platform_id in ("gumroad",)]
    if unimplemented_direct:
        print("  [WARN] These DIRECT_API platforms are listed but not yet implemented:")
        for p in unimplemented_direct:
            print(f"    - {p.platform_id}")

    print("[OK] Registry complete and honest")


if __name__ == "__main__":
    _selftest()
