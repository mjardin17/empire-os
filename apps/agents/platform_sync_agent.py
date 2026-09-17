#!/usr/bin/env python3
"""
Platform Sync Agent: Pushes inventory from Boss Listers to crosslisting platforms.
Syncs new items, updates prices, and monitors quantities across Poshmark, Mercari, Etsy, etc.
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.platform_connectors import get_all_connectors, get_connector

BUZZ_RELAY_URL = os.getenv("BUZZ_RELAY_URL", "ws://localhost:3000")
BUZZ_PRIVATE_KEY = os.getenv("BUZZ_PRIVATE_KEY")
BOSS_LISTERS_DB = Path(__file__).parent.parent / "boss-listers-ai" / "data.json"
SYNC_STATE_FILE = Path(__file__).parent.parent / "crosslist_sync_state.json"

def post_to_buzz(message, channel="inventory-sync"):
    """Post status to Buzz channel (fallback to stdout if buzz-cli unavailable)."""
    print(f"[{datetime.now().isoformat()}] #{channel}: {message}")

    if not BUZZ_PRIVATE_KEY:
        return

    cmd = f"""BUZZ_PRIVATE_KEY={BUZZ_PRIVATE_KEY} BUZZ_RELAY_URL={BUZZ_RELAY_URL} \
    buzz-cli message --channel {channel} '{message}'"""

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"  ✓ Buzz posted")
    except FileNotFoundError:
        pass  # buzz-cli not installed, stdout logging is sufficient
    except Exception as e:
        print(f"  ⚠️ Buzz error: {str(e)[:50]}")

def load_boss_listers_inventory():
    """Load inventory from Boss Listers."""
    if not BOSS_LISTERS_DB.exists():
        return []

    try:
        with open(BOSS_LISTERS_DB) as f:
            data = json.load(f)
            return data.get("products", [])
    except Exception as e:
        print(f"Error loading inventory: {e}")
        return []

def load_sync_state():
    """Load which items have been synced."""
    if SYNC_STATE_FILE.exists():
        try:
            with open(SYNC_STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {"synced_items": {}, "last_sync": None}

def save_sync_state(state):
    """Save sync state."""
    state["last_sync"] = datetime.now().isoformat()
    with open(SYNC_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def sync_item_to_platforms(product, connectors):
    """Push product to all platforms."""
    product_id = product.get("id", "unknown")
    product_name = product.get("name", "Unknown")
    price = product.get("price", 0)
    description = product.get("description", "")
    images = product.get("images", [])

    platforms_synced = []

    for platform_name, connector in connectors.items():
        if not connector.authenticate():
            print(f"⚠️ {platform_name}: Auth failed, skipping")
            continue

        try:
            listing = connector.create_listing(product_name, description, price, images)
            if listing:
                platforms_synced.append(platform_name.capitalize())
                print(f"✓ Synced to {platform_name}: {product_name}")
            else:
                print(f"⚠️ Failed to sync to {platform_name}")
        except Exception as e:
            print(f"❌ Error syncing to {platform_name}: {e}")

    if platforms_synced:
        post_to_buzz(
            f"📤 Synced to platforms: {', '.join(platforms_synced)}\n"
            f"Product: {product_name} (${price})\n"
            f"ID: {product_id}"
        )

    return platforms_synced

def main():
    """Main agent loop."""
    print("Platform Sync Agent starting")
    print(f"Relay: {BUZZ_RELAY_URL}")
    print(f"Boss Listers DB: {BOSS_LISTERS_DB}")

    post_to_buzz("🤖 Platform Sync Agent online - monitoring inventory")

    connectors = get_all_connectors()
    print(f"🚀 Connected to {len(connectors)} platforms: {', '.join(sorted(connectors.keys()))}")
    post_to_buzz(f"🌐 NETWORK EXPANDED: {len(connectors)} platforms active\n{', '.join(sorted(connectors.keys()))}")

    sync_state = load_sync_state()
    synced_items = sync_state.get("synced_items", {})

    while True:
        try:
            inventory = load_boss_listers_inventory()
            print(f"Checking {len(inventory)} items for sync...")

            for product in inventory:
                product_id = product.get("id", "unknown")

                # Skip if already synced and unchanged
                if product_id in synced_items:
                    last_hash = synced_items[product_id].get("hash")
                    current_hash = hash(json.dumps(product, sort_keys=True, default=str))
                    if last_hash == current_hash:
                        continue  # No changes, skip

                # Should sync?
                if product.get("status") == "for_sale" and product.get("sync_to_platforms") is not False:
                    print(f"\n📦 Syncing: {product.get('name', 'Product')}")

                    platforms = sync_item_to_platforms(product, connectors)

                    # Record sync
                    synced_items[product_id] = {
                        "name": product.get("name"),
                        "synced_platforms": platforms,
                        "synced_at": datetime.now().isoformat(),
                        "hash": hash(json.dumps(product, sort_keys=True, default=str))
                    }

            # Save state
            sync_state["synced_items"] = synced_items
            save_sync_state(sync_state)

            # Poll interval
            time.sleep(120)  # Check every 2 minutes

        except KeyboardInterrupt:
            post_to_buzz("🛑 Platform Sync Agent stopping")
            break
        except Exception as e:
            print(f"Agent error: {e}")
            post_to_buzz(f"⚠️ Sync error: {str(e)[:100]}")
            time.sleep(60)

if __name__ == "__main__":
    main()
