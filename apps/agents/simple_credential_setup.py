#!/usr/bin/env python3
"""Simplified credential setup - only platforms with public APIs."""

import os
from pathlib import Path

ENV_FILE = Path(".env")

EASY_PLATFORMS = {
    "etsy": {
        "name": "Etsy",
        "url": "https://www.etsy.com/developers/",
        "instructions": "Visit link → Get Started → Create App → Keys tab → Copy OAuth Token"
    },
    "shopify": {
        "name": "Shopify",
        "url": "https://shopify.dev/",
        "instructions": "Store Admin → Settings → Apps → Develop → Create App → API Credentials → Copy Access Token"
    },
    "woocommerce": {
        "name": "WooCommerce",
        "url": "https://woocommerce.com/",
        "instructions": "WordPress Admin → WooCommerce → Settings → REST API → Create Key → Copy Consumer Key:Secret"
    }
}

print("="*70)
print("CREDENTIAL SETUP - EASY PLATFORMS ONLY")
print("="*70)
print(f"\nSupported platforms: {', '.join(EASY_PLATFORMS.keys())}")
print("\nSkip any platform by pressing Enter without typing\n")

creds = {}

# Load existing .env if it exists
if ENV_FILE.exists():
    with open(ENV_FILE) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                creds[k] = v

# Collect credentials
for platform, info in EASY_PLATFORMS.items():
    print(f"\n{'─'*70}")
    print(f"📱 {info['name']}")
    print(f"{'─'*70}")
    print(f"🔗 {info['url']}")
    print(f"Steps: {info['instructions']}\n")

    token = input(f"Paste your {platform.upper()} token (or press Enter to skip): ").strip()

    if token:
        # Store with generic key
        creds[f"{platform.upper()}_TOKEN"] = token
        print(f"✓ Saved {platform}")
    else:
        print(f"⊘ Skipped {platform}")

# Save to .env
if creds:
    with open(ENV_FILE, "w") as f:
        f.write("# Inventory Sync Credentials\n")
        f.write("# Auto-generated - do not commit\n\n")
        for k, v in sorted(creds.items()):
            f.write(f"{k}={v}\n")

    print(f"\n{'='*70}")
    print(f"✅ Credentials saved to .env")
    print(f"{'='*70}")
    print(f"Saved {len(creds)} credentials")
    print("\nAgents will now use these tokens automatically!")
else:
    print("\nNo credentials configured")
