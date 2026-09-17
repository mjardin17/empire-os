#!/usr/bin/env python3
"""
product_promos.py — CrossPost side of the content-to-commerce link.

Fetches currently active storefront products from the PUBLIC BossLister
storefront API and formats "shop" blocks for video descriptions, pinned
comments, and social captions.

ARCHITECTURE CONTRACT (do not violate):
  * READ-ONLY. This module (and all of CrossPost/social_clips) must never
    write inventory, quantities, prices, or listings. BossLister's shared
    Supabase database is the single commerce source of truth; CrossPost
    only consumes the public storefront API like any other visitor.
  * No credentials. The storefront API is public — this module needs no
    keys, and none may ever be added to it.

Usage (standalone check):
  python social_clips/product_promos.py

Usage (from auto_publisher / channel_uploader):
  from social_clips.product_promos import build_shop_block
  description += build_shop_block(campaign="GG_EP012")
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request

STOREFRONT_API = "https://jardins-outpost.pages.dev/api/storefront/products"
STOREFRONT_BASE = "https://jardins-outpost.pages.dev"
TIMEOUT_SECONDS = 10
MAX_PROMO_PRODUCTS = 3


def fetch_active_products() -> list[dict]:
    """Returns published, in-stock storefront products (may be empty).

    Never raises on network/API failure — a broken storefront must never
    block a video publish. Failures return [] and the caller just skips
    the shop block.
    """
    try:
        with urllib.request.urlopen(STOREFRONT_API, timeout=TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        products = payload.get("products", [])
        return [p for p in products if p.get("status") == "active" and p.get("quantity", 0) > 0]
    except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
        print(f"[product_promos] storefront unavailable, skipping promos: {exc}", file=sys.stderr)
        return []


def product_url(product: dict, campaign: str | None = None) -> str:
    """Public storefront URL for a product, with campaign tracking params."""
    slug = product.get("slug") or ""
    url = f"{STOREFRONT_BASE}/#inventory" if not slug else f"{STOREFRONT_BASE}/p/{slug}"
    if campaign:
        sep = "&" if "?" in url else "?"
        url += f"{sep}utm_source=crosspost&utm_campaign={urllib.parse.quote(campaign)}"
    return url


def build_shop_block(campaign: str | None = None, limit: int = MAX_PROMO_PRODUCTS) -> str:
    """Formatted 'shop' section for a video description ('' if no products)."""
    products = fetch_active_products()[:limit]
    if not products:
        return ""
    lines = ["", "🛒 SHOP THE EMPIRE:"]
    for p in products:
        price = p.get("price")
        price_str = f" — ${price:.2f}" if isinstance(price, (int, float)) else ""
        lines.append(f"• {p.get('title', 'Item')}{price_str}: {product_url(p, campaign)}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    block = build_shop_block(campaign="manual_test")
    if block:
        print(block)
    else:
        print("[product_promos] no active products (or storefront not deployed yet)")
