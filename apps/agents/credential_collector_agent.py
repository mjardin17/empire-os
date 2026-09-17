#!/usr/bin/env python3
"""Interactive credential collector for all 14 platforms."""

import os
import json
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.platform_connectors import get_connector, PLATFORMS

class CredentialCollector:
    """Collects and validates credentials for all platforms."""

    ENV_PATH = Path(".env")

    PLATFORM_GUIDES = {
        "etsy": {
            "name": "Etsy",
            "url": "https://www.etsy.com/developers/",
            "steps": [
                "Go to https://www.etsy.com/developers/",
                "Click 'Get Started'",
                "Create a new app (name it 'Inventory Sync')",
                "Go to 'Keys' tab",
                "Copy OAuth Token (or create one if needed)",
                "Paste below:"
            ],
            "env_var": "ETSY_TOKEN",
            "test_endpoint": "https://api.etsy.com/v3/application/user-profile"
        },
        "depop": {
            "name": "Depop",
            "url": "https://developer.depop.com/",
            "steps": [
                "Go to https://developer.depop.com/",
                "Sign in with your Depop account",
                "Create a new app",
                "Generate API key",
                "Copy the Bearer token",
                "Paste below:"
            ],
            "env_var": "DEPOP_TOKEN",
            "test_endpoint": "https://api.depop.com/api/v1/user"
        },
        "shopify": {
            "name": "Shopify",
            "url": "https://shopify.dev/",
            "steps": [
                "Go to your Shopify store admin",
                "Navigate to Settings → Apps and integrations",
                "Click 'Develop apps'",
                "Create an app",
                "Go to Configuration → Admin API scopes",
                "Enable: read_products, write_products, read_orders",
                "Click 'Save'",
                "Go to 'Credentials' tab",
                "Copy the 'Access token'",
                "Also note your store name (e.g., mystore.myshopify.com)",
                "Paste token below:"
            ],
            "env_var": "SHOPIFY_TOKEN",
            "store_var": "SHOPIFY_STORE_NAME"
        },
        "woocommerce": {
            "name": "WooCommerce",
            "url": "https://woocommerce.com/",
            "steps": [
                "Go to your WooCommerce store (WordPress admin)",
                "Navigate to WooCommerce → Settings → Advanced → REST API",
                "Click 'Create an API key'",
                "Set Description: 'Inventory Sync'",
                "Set User: your admin account",
                "Set Permissions: Read/Write",
                "Click 'Generate API key'",
                "Copy Consumer Key and Consumer Secret",
                "Paste below (format: key:secret)"
            ],
            "env_var": "WOOCOMMERCE_KEY",
            "url_var": "WOOCOMMERCE_URL"
        },
        "grailed": {
            "name": "Grailed",
            "url": "https://www.grailed.com/developers",
            "steps": [
                "Go to https://www.grailed.com/developers",
                "Click 'Create an App'",
                "Fill in app details",
                "Copy the API Key",
                "Paste below:"
            ],
            "env_var": "GRAILED_TOKEN"
        },
        "vinted": {
            "name": "Vinted",
            "url": "https://www.vinted.com/api-docs/",
            "steps": [
                "Go to https://www.vinted.com/api-docs/",
                "Sign in with your Vinted account",
                "Create an app",
                "Copy the API token",
                "Paste below:"
            ],
            "env_var": "VINTED_TOKEN"
        },
        "vestiaire": {
            "name": "Vestiaire Collective",
            "url": "https://www.vestiairecollective.com/developer",
            "steps": [
                "Go to https://www.vestiairecollective.com/developer",
                "Sign in with your account",
                "Create a new API application",
                "Copy the API Key and Secret",
                "Paste below (format: key:secret):"
            ],
            "env_var": "VESTIAIRE_TOKEN"
        },
        "ebay": {
            "name": "eBay",
            "url": "https://developer.ebay.com/",
            "steps": [
                "Go to https://developer.ebay.com/",
                "Sign in with your eBay account",
                "Go to 'My Account'",
                "Create a new application",
                "Click on the app to see keys",
                "Go to 'Keys & OAuth' tab",
                "Copy the User Token",
                "Paste below:"
            ],
            "env_var": "EBAY_TOKEN"
        },
        "facebook": {
            "name": "Facebook Marketplace",
            "url": "https://developers.facebook.com/",
            "steps": [
                "Go to https://developers.facebook.com/",
                "Create or sign into your app",
                "Go to Settings → Basic",
                "Copy the App ID and App Secret",
                "Go to Tools → Graph API Explorer",
                "Generate an access token with user_friends scope",
                "Paste token below:"
            ],
            "env_var": "FACEBOOK_TOKEN"
        },
        "mercadolibre": {
            "name": "Mercado Libre",
            "url": "https://developers.mercadolibre.com.ar/",
            "steps": [
                "Go to https://developers.mercadolibre.com.ar/",
                "Sign in with your Mercado Libre account",
                "Create a new app",
                "Go to 'My Application'",
                "Copy the Client ID",
                "Generate OAuth token via their OAuth flow",
                "Paste token below:"
            ],
            "env_var": "MERCADOLIBRE_TOKEN"
        },
        "reverb": {
            "name": "Reverb.com",
            "url": "https://reverb.com/api",
            "steps": [
                "Go to https://reverb.com/api",
                "Sign in with your Reverb account",
                "Click 'Generate Token'",
                "Copy your API token",
                "Paste below:"
            ],
            "env_var": "REVERB_TOKEN"
        },
        "realreal": {
            "name": "The RealReal",
            "url": "https://api.therealreal.com/",
            "steps": [
                "Go to https://api.therealreal.com/",
                "Sign in with your seller account",
                "Create an API key",
                "Copy the authentication token",
                "Paste below:"
            ],
            "env_var": "REALREAL_TOKEN"
        },
        "mercari": {
            "name": "Mercari",
            "url": "https://www.mercariapi.com/",
            "steps": [
                "Go to https://www.mercariapi.com/",
                "Sign in with your Mercari account",
                "Create an app",
                "Copy the API token",
                "Paste below (waiting for official API docs):"
            ],
            "env_var": "MERCARI_TOKEN"
        },
        "poshmark": {
            "name": "Poshmark",
            "url": "https://poshmark.com/developers",
            "steps": [
                "Go to https://poshmark.com/developers",
                "Sign in with your Poshmark account",
                "Create an API key",
                "Copy the token",
                "Paste below (waiting for API access approval):"
            ],
            "env_var": "POSHMARK_TOKEN"
        }
    }

    def __init__(self):
        self.credentials = self._load_env()
        self.log_file = Path("credential_collection_log.txt")

    def _load_env(self) -> dict:
        """Load existing credentials from .env file."""
        credentials = {}
        if self.ENV_PATH.exists():
            with open(self.ENV_PATH) as f:
                for line in f:
                    line = line.strip()
                    if line and "=" in line and not line.startswith("#"):
                        key, value = line.split("=", 1)
                        credentials[key.strip()] = value.strip()
        return credentials

    def _save_env(self):
        """Save credentials to .env file."""
        with open(self.ENV_PATH, "w") as f:
            f.write("# Inventory Sync Credentials\n")
            f.write(f"# Generated: {datetime.now().isoformat()}\n\n")
            for key, value in sorted(self.credentials.items()):
                f.write(f"{key}={value}\n")
        print(f"✓ Credentials saved to .env")

    def _test_credential(self, platform: str, token: str) -> bool:
        """Test if a credential actually works."""
        try:
            connector = get_connector(platform)
            if not connector:
                return False

            # Set token temporarily
            connector.auth_token = token

            # Test authentication
            return connector.authenticate()
        except:
            return False

    def _log(self, message: str):
        """Log collection progress."""
        with open(self.log_file, "a") as f:
            f.write(f"[{datetime.now().isoformat()}] {message}\n")

    def collect_platform_credential(self, platform: str) -> bool:
        """Collect credential for a single platform."""
        guide = self.PLATFORM_GUIDES.get(platform)
        if not guide:
            return False

        print(f"\n{'='*70}")
        print(f"📱 {guide['name']}")
        print(f"{'='*70}")

        # Show existing credential if any
        env_var = guide.get("env_var")
        if env_var in self.credentials:
            print(f"✓ Already configured: {env_var}={self.credentials[env_var][:20]}...")
            return True

        # Show setup guide
        print(f"\n🔗 Visit: {guide['url']}\n")
        print("Steps:")
        for i, step in enumerate(guide["steps"], 1):
            print(f"  {i}. {step}")

        # Collect primary credential
        while True:
            token = input(f"\n▶ Enter {env_var}: ").strip()
            if not token:
                print("  (Skipping this platform)")
                self._log(f"Skipped {platform}")
                return False

            # Validate credential works
            print(f"  Validating {guide['name']}...")
            if self._test_credential(platform, token):
                self.credentials[env_var] = token
                print(f"  ✓ {guide['name']} credential validated!")
                self._log(f"✓ {platform}: {env_var} configured and validated")
                break
            else:
                print(f"  ⚠️ Credential validation failed (token may be invalid or already saved)")
                retry = input(f"  Try another token? (y/n): ").strip().lower()
                if retry != "y":
                    return False

        # Collect secondary credentials if needed
        if "store_var" in guide:
            store_name = input(f"▶ Enter {guide['store_var']}: ").strip()
            if store_name:
                self.credentials[guide["store_var"]] = store_name
                self._log(f"✓ {platform}: {guide['store_var']}={store_name}")

        if "url_var" in guide:
            url = input(f"▶ Enter {guide['url_var']}: ").strip()
            if url:
                self.credentials[guide["url_var"]] = url
                self._log(f"✓ {platform}: {guide['url_var']}={url}")

        return True

    def run_interactive(self):
        """Run interactive credential collection."""
        print("\n" + "="*70)
        print("🔑 MULTI-PLATFORM CREDENTIAL COLLECTOR")
        print("="*70)
        print(f"\nConfiguring credentials for {len(self.PLATFORM_GUIDES)} platforms")
        print("This will validate each credential against the actual API")
        print("\nYou can skip any platform by pressing Enter without typing")

        collected = 0
        skipped = 0

        for platform in sorted(self.PLATFORM_GUIDES.keys()):
            if self.collect_platform_credential(platform):
                collected += 1
            else:
                skipped += 1
            time.sleep(0.5)  # Rate limiting

        # Save all collected credentials
        if collected > 0:
            self._save_env()
            print(f"\n{'='*70}")
            print(f"✅ COLLECTION COMPLETE")
            print(f"{'='*70}")
            print(f"✓ Collected: {collected} platform credentials")
            print(f"⊘ Skipped:   {skipped} platforms")
            print(f"📄 Saved to: .env")
            self._log(f"Session complete: {collected} collected, {skipped} skipped")
        else:
            print(f"\nNo credentials collected")

    def run_guided(self, platform: str):
        """Collect credential for specific platform."""
        if platform not in self.PLATFORM_GUIDES:
            print(f"❌ Unknown platform: {platform}")
            print(f"Available: {', '.join(sorted(self.PLATFORM_GUIDES.keys()))}")
            return

        if self.collect_platform_credential(platform):
            self._save_env()
            print(f"\n✅ {platform} credential saved!")
        else:
            print(f"\n⊘ {platform} credential not configured")

if __name__ == "__main__":
    collector = CredentialCollector()

    if len(sys.argv) > 1:
        # Single platform mode
        collector.run_guided(sys.argv[1])
    else:
        # Interactive mode for all platforms
        collector.run_interactive()
