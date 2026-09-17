#!/usr/bin/env python3
"""
Crosslister Agent: Monitors Boss Listers inventory and creates commercials.
Detects new items, generates commercial render missions, tells Video Pipeline Agent.
"""

import os
import json
import time
from pathlib import Path
import subprocess
from datetime import datetime
import hashlib

# Add lib to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.commercial_generator import create_commercial_mission, add_to_mission_board

BUZZ_RELAY_URL = os.getenv("BUZZ_RELAY_URL", "ws://localhost:3000")
BUZZ_PRIVATE_KEY = os.getenv("BUZZ_PRIVATE_KEY")
BOSS_LISTERS_DB = Path(__file__).parent.parent / "boss-listers-ai" / "data.json"
MISSION_BOARD_PATH = Path(__file__).parent.parent / "MISSION_BOARD.json"

def post_to_buzz(message, channel="commercials"):
    """Post message to Buzz channel (fallback to stdout if unavailable)."""
    print(f"[{datetime.now().isoformat()}] #{channel}: {message}")

    if not BUZZ_PRIVATE_KEY:
        return

    cmd = f"""BUZZ_PRIVATE_KEY={BUZZ_PRIVATE_KEY} BUZZ_RELAY_URL={BUZZ_RELAY_URL} \
    buzz-cli message --channel {channel} '{message}'"""

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print(f"  ✓ Buzz posted")
        elif "not found" not in result.stderr.lower():
            print(f"  ⚠️ Buzz error: {result.stderr[:50]}")
    except (FileNotFoundError, OSError):
        pass  # buzz-cli not installed
    except Exception as e:
        pass

def load_boss_listers_inventory():
    """Load inventory from Boss Listers database."""
    if not BOSS_LISTERS_DB.exists():
        return []

    try:
        with open(BOSS_LISTERS_DB) as f:
            data = json.load(f)
            return data.get("products", [])
    except Exception as e:
        print(f"Error loading Boss Listers inventory: {e}")
        return []

def get_inventory_hash(products):
    """Create hash of inventory to detect changes."""
    product_ids = sorted([p.get("id", "") for p in products])
    return hashlib.md5(json.dumps(product_ids).encode()).hexdigest()

def create_commercial_for_product(product):
    """Create a commercial render mission for a product."""
    product_id = product.get("id", "unknown")
    product_name = product.get("name", "Unknown Product")
    description = product.get("description", "High quality item")
    price = product.get("price", 0)
    images = product.get("images", [])

    # Create mission ID (unique per product)
    mission_id = f"commercial-{product_id}-{int(time.time())}"

    # Generate commercial mission
    mission = create_commercial_mission(
        product_name=product_name,
        product_description=description,
        price=price,
        image_urls=images,
        mission_id=mission_id
    )

    # Add to mission board
    success = add_to_mission_board(mission, MISSION_BOARD_PATH)

    if success:
        post_to_buzz(
            f"📹 New commercial queued: {product_name} (${price})\n"
            f"Mission: {mission_id}\n"
            f"Status: Waiting for video pipeline agent",
            channel="commercials"
        )
        print(f"✓ Commercial mission created: {mission_id}")
        return True
    else:
        print(f"⚠ Commercial already exists for {product_id}")
        return False

def main():
    """Main agent loop."""
    print(f"Crosslister Agent starting")
    print(f"Relay: {BUZZ_RELAY_URL}")
    print(f"Boss Listers DB: {BOSS_LISTERS_DB}")
    print(f"Mission Board: {MISSION_BOARD_PATH}")

    post_to_buzz(
        "🤖 Crosslister Agent online - monitoring inventory for new items",
        channel="commercials"
    )

    last_inventory_hash = None
    processed_products = set()

    while True:
        try:
            # Load current inventory
            inventory = load_boss_listers_inventory()
            current_hash = get_inventory_hash(inventory)

            # Check for new items
            if current_hash != last_inventory_hash:
                print(f"Inventory changed. Scanning {len(inventory)} items...")

                for product in inventory:
                    product_id = product.get("id", "unknown")

                    # Skip if already processed
                    if product_id in processed_products:
                        continue

                    # Check if should create commercial
                    should_create_commercial = (
                        product.get("status") == "for_sale" and
                        product.get("create_commercial") is not False
                    )

                    if should_create_commercial:
                        create_commercial_for_product(product)
                        processed_products.add(product_id)

                last_inventory_hash = current_hash

            # Poll interval
            time.sleep(60)

        except KeyboardInterrupt:
            post_to_buzz("🛑 Crosslister Agent stopping", channel="commercials")
            break
        except Exception as e:
            print(f"Agent error: {e}")
            post_to_buzz(f"⚠️ Crosslister error: {str(e)[:100]}", channel="commercials")
            time.sleep(60)

if __name__ == "__main__":
    main()
