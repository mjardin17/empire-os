#!/usr/bin/env python3
"""
Price Sync Agent: Syncs prices bidirectionally between Boss Listers and resale platforms.
Detects price changes and keeps inventory synchronized across all channels.
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime, timedelta
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.platform_connectors import get_all_connectors

BUZZ_RELAY_URL = os.getenv("BUZZ_RELAY_URL", "ws://localhost:3000")
BUZZ_PRIVATE_KEY = os.getenv("BUZZ_PRIVATE_KEY")
BOSS_LISTERS_DB = Path(__file__).parent.parent / "boss-listers-ai" / "data.json"
PRICE_SYNC_STATE_FILE = Path(__file__).parent.parent / "price_sync_state.json"

def post_to_buzz(message, channel="inventory-sync"):
    """Post status to Buzz (fallback to stdout if unavailable)."""
    print(f"[{datetime.now().isoformat()}] #{channel}: {message}")

    if not BUZZ_PRIVATE_KEY:
        return

    cmd = f"""BUZZ_PRIVATE_KEY={BUZZ_PRIVATE_KEY} BUZZ_RELAY_URL={BUZZ_RELAY_URL} \
    buzz-cli message --channel {channel} '{message}'"""

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"  ✓ Buzz posted")
    except (FileNotFoundError, OSError):
        pass  # buzz-cli not installed
    except:
        pass

def load_boss_listers_inventory():
    """Load inventory."""
    if not BOSS_LISTERS_DB.exists():
        return []

    try:
        with open(BOSS_LISTERS_DB) as f:
            return json.load(f).get("products", [])
    except:
        return []

def save_boss_listers_inventory(inventory):
    """Save updated inventory."""
    data = {"products": inventory}
    with open(BOSS_LISTERS_DB, 'w') as f:
        json.dump(data, f, indent=2)

def load_price_sync_state():
    """Load price tracking state."""
    if PRICE_SYNC_STATE_FILE.exists():
        try:
            with open(PRICE_SYNC_STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {"items": {}, "last_check": datetime.now().isoformat()}

def save_price_sync_state(state):
    """Save price sync state."""
    state["last_check"] = datetime.now().isoformat()
    with open(PRICE_SYNC_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def detect_price_changes(inventory):
    """Detect which items have price changes."""
    state = load_price_sync_state()
    tracked_items = state.get("items", {})

    changes = []

    for product in inventory:
        product_id = product.get("id", "unknown")
        current_price = product.get("price", 0)

        # Has this item been tracked?
        if product_id in tracked_items:
            last_price = tracked_items[product_id].get("price")

            # Price changed?
            if last_price != current_price:
                changes.append({
                    "product_id": product_id,
                    "product_name": product.get("name"),
                    "old_price": last_price,
                    "new_price": current_price,
                    "source": "boss_listers"
                })

                print(f"💰 Price change: {product.get('name')} ${last_price} → ${current_price}")

        # Track this item
        tracked_items[product_id] = {
            "name": product.get("name"),
            "price": current_price,
            "last_updated": datetime.now().isoformat()
        }

    return changes, tracked_items

def push_price_to_platforms(product_id, new_price, connectors):
    """Update price on all platforms."""
    updated_platforms = []

    for platform_name, connector in connectors.items():
        if not connector.authenticate():
            continue

        try:
            # In real implementation, would find listing_id from stored mapping
            # For now, we track just the product_id
            success = connector.update_listing(product_id, price=new_price)
            if success:
                updated_platforms.append(platform_name.capitalize())
                print(f"✓ Updated {platform_name} price to ${new_price}")
        except Exception as e:
            print(f"⚠️ Error updating {platform_name}: {e}")

    return updated_platforms

def main():
    """Main agent loop."""
    print("Price Sync Agent starting")
    print(f"Relay: {BUZZ_RELAY_URL}")

    post_to_buzz("🤖 Price Sync Agent online - monitoring for price changes")

    connectors = get_all_connectors()

    while True:
        try:
            print(f"\n[{datetime.now().isoformat()}] Checking for price changes...")

            # Load current inventory
            inventory = load_boss_listers_inventory()

            # Detect changes
            changes, tracked_items = detect_price_changes(inventory)

            if changes:
                print(f"Found {len(changes)} price changes")

                for change in changes:
                    product_id = change["product_id"]
                    new_price = change["new_price"]

                    # Push to platforms
                    platforms = push_price_to_platforms(product_id, new_price, connectors)

                    post_to_buzz(
                        f"💹 Price update: {change['product_name']}\n"
                        f"${change['old_price']} → ${new_price}\n"
                        f"Updated on: {', '.join(platforms) if platforms else 'pending'}"
                    )

                # Save state
                state = load_price_sync_state()
                state["items"] = tracked_items
                save_price_sync_state(state)
            else:
                print("No price changes detected")

            # Poll interval
            time.sleep(300)  # Check every 5 minutes

        except KeyboardInterrupt:
            post_to_buzz("🛑 Price Sync Agent stopping")
            break
        except Exception as e:
            print(f"Agent error: {e}")
            post_to_buzz(f"⚠️ Price sync error: {str(e)[:100]}")
            time.sleep(60)

if __name__ == "__main__":
    main()
