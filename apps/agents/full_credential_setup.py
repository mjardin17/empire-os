#!/usr/bin/env python3
"""Complete credential setup for all 14+ platforms (API + Browser automation)."""

import os
from pathlib import Path

ENV_FILE = Path(".env")

ALL_PLATFORMS = {
    # REST API Platforms (need API tokens)
    "API": {
        "etsy": {
            "name": "Etsy",
            "url": "https://www.etsy.com/developers/",
            "instructions": "Get Started → Create App → Keys tab → Copy OAuth Token",
            "env_var": "ETSY_TOKEN"
        },
        "shopify": {
            "name": "Shopify",
            "url": "https://shopify.dev/",
            "instructions": "Store Admin → Settings → Apps → Develop → Create App → API Credentials → Access Token",
            "env_vars": ["SHOPIFY_TOKEN", "SHOPIFY_STORE_NAME"]
        },
        "woocommerce": {
            "name": "WooCommerce",
            "url": "https://woocommerce.com/",
            "instructions": "WordPress Admin → WooCommerce → Settings → REST API → Create Key → Consumer Key:Secret",
            "env_vars": ["WOOCOMMERCE_KEY", "WOOCOMMERCE_SECRET", "WOOCOMMERCE_URL"]
        },
        "grailed": {
            "name": "Grailed",
            "url": "https://www.grailed.com/developers",
            "instructions": "Create App → Copy API Key",
            "env_var": "GRAILED_TOKEN"
        },
        "vinted": {
            "name": "Vinted",
            "url": "https://www.vinted.com/api-docs/",
            "instructions": "Create App → Copy API Token",
            "env_var": "VINTED_TOKEN"
        },
        "ebay": {
            "name": "eBay",
            "url": "https://developer.ebay.com/",
            "instructions": "Create App → Keys & OAuth → Copy User Token",
            "env_var": "EBAY_TOKEN"
        },
        "reverb": {
            "name": "Reverb.com",
            "url": "https://reverb.com/api",
            "instructions": "Generate Token → Copy API Token",
            "env_var": "REVERB_TOKEN"
        },
        "realreal": {
            "name": "The RealReal",
            "url": "https://api.therealreal.com/",
            "instructions": "Create API Key → Copy Auth Token",
            "env_var": "REALREAL_TOKEN"
        }
    },

    # Browser Automation Platforms (need username/password)
    "BROWSER": {
        "poshmark": {
            "name": "Poshmark",
            "login_url": "https://poshmark.com/login",
            "instructions": "Your Poshmark username and password",
            "env_var": "POSHMARK_USERNAME",
            "env_var_password": "POSHMARK_PASSWORD"
        },
        "mercari": {
            "name": "Mercari",
            "login_url": "https://www.mercariapp.com/auth/login",
            "instructions": "Your Mercari email and password",
            "env_var": "MERCARI_EMAIL",
            "env_var_password": "MERCARI_PASSWORD"
        },
        "depop": {
            "name": "Depop",
            "login_url": "https://www.depop.com/auth/login",
            "instructions": "Your Depop username and password",
            "env_var": "DEPOP_USERNAME",
            "env_var_password": "DEPOP_PASSWORD"
        },
        "facebook": {
            "name": "Facebook Marketplace",
            "login_url": "https://www.facebook.com/login",
            "instructions": "Your Facebook email/phone and password",
            "env_var": "FACEBOOK_EMAIL",
            "env_var_password": "FACEBOOK_PASSWORD"
        }
    }
}

def main():
    print("="*70)
    print("🔐 COMPLETE CREDENTIAL SETUP FOR ALL 14+ PLATFORMS")
    print("="*70)
    print(f"\n3 categories to set up:")
    print(f"  1. API Platforms (REST APIs) — 8 platforms")
    print(f"  2. Browser Automation (Username/Password) — 4 platforms")
    print(f"  3. Optional — Grailed, Vinted, etc.")
    print(f"\nSkip any platform by pressing Enter without typing\n")

    creds = {}

    # Load existing credentials
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    creds[k] = v

    # REST API Platforms
    print(f"\n{'─'*70}")
    print("📡 REST API PLATFORMS (API Tokens)")
    print(f"{'─'*70}")

    for platform, info in ALL_PLATFORMS["API"].items():
        print(f"\n📱 {info['name']}")
        print(f"   🔗 {info['url']}")
        print(f"   Steps: {info['instructions']}\n")

        if "env_vars" in info:
            # Multi-part credential (e.g., Shopify needs token + store name)
            collected = []
            for var in info["env_vars"]:
                label = var.replace("_", " ").title()
                value = input(f"   ▶ {label}: ").strip()
                if value:
                    creds[var] = value
                    collected.append(var)
            if collected:
                print(f"   ✓ Saved {len(collected)} credential parts")
            else:
                print(f"   ⊘ Skipped")
        else:
            # Single credential
            value = input(f"   ▶ Enter API Token: ").strip()
            if value:
                creds[info["env_var"]] = value
                print(f"   ✓ Saved")
            else:
                print(f"   ⊘ Skipped")

    # Browser Automation Platforms
    print(f"\n{'─'*70}")
    print("🌐 BROWSER AUTOMATION PLATFORMS (Username/Password)")
    print(f"{'─'*70}")
    print("\nThese platforms don't have public APIs.")
    print("We'll use browser automation to manage your listings.")
    print("Your credentials are stored securely in .env (gitignored)\n")

    for platform, info in ALL_PLATFORMS["BROWSER"].items():
        print(f"\n📱 {info['name']}")
        print(f"   Login: {info['login_url']}")
        print(f"   Credentials: {info['instructions']}\n")

        username = input(f"   ▶ Username/Email: ").strip()
        if username:
            password = input(f"   ▶ Password: ").strip()
            if password:
                # Store as username:password for browser connector
                creds[info["env_var"]] = username
                creds[info["env_var_password"]] = password
                print(f"   ✓ Saved")
            else:
                print(f"   ⊘ Skipped (password empty)")
        else:
            print(f"   ⊘ Skipped")

    # Save all credentials
    if creds:
        with open(ENV_FILE, "w") as f:
            f.write("# Inventory Sync Credentials\n")
            f.write("# API Tokens + Browser Login Credentials\n")
            f.write("# Auto-generated - NEVER commit this file\n\n")

            # Group by category
            f.write("# REST API Tokens\n")
            for k in sorted(creds.keys()):
                if any(x in k for x in ["TOKEN", "KEY", "SECRET", "STORE"]):
                    if not any(x in k for x in ["USERNAME", "PASSWORD", "EMAIL"]):
                        f.write(f"{k}={creds[k]}\n")

            f.write("\n# Browser Automation Credentials\n")
            for k in sorted(creds.keys()):
                if any(x in k for x in ["USERNAME", "PASSWORD", "EMAIL"]):
                    f.write(f"{k}={creds[k]}\n")

        print(f"\n{'='*70}")
        print(f"✅ CREDENTIALS SAVED")
        print(f"{'='*70}")
        print(f"✓ Total credentials saved: {len(creds)}")
        print(f"📄 File: .env (gitignored)")
        print(f"\nAgents will now automatically:")
        print(f"  • Sync inventory to all configured platforms")
        print(f"  • Track sales across all platforms")
        print(f"  • Update prices automatically")
        print(f"\nNext step: Run START_AGENTS.bat")
    else:
        print(f"\nNo credentials configured")

if __name__ == "__main__":
    main()
