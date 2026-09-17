#!/usr/bin/env python3
"""Council Bot 16: Whatnot Specialist - optimized for Whatnot live streaming and inventory."""

import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from lib.platform_connectors import get_connector


class WhatnotSpecialist:
    """Specialized bot for Whatnot live streaming and inventory management."""

    def __init__(self):
        self.connector = get_connector("whatnot")
        self.livestream_log = Path("whatnot_livestreams.json")
        self.inventory_cache = Path("whatnot_inventory_cache.json")

    def _load_livestreams(self) -> List[Dict]:
        """Load livestream history."""
        if self.livestream_log.exists():
            with open(self.livestream_log) as f:
                return json.load(f).get("livestreams", [])
        return []

    def _save_livestream(self, data: Dict):
        """Save livestream event."""
        livestreams = self._load_livestreams()
        livestreams.append({**data, "timestamp": datetime.now().isoformat()})
        with open(self.livestream_log, "w") as f:
            json.dump({"livestreams": livestreams}, f, indent=2)

    def sync_inventory(self):
        """Sync inventory with Whatnot and prepare for livestreams."""
        print("\n" + "="*70)
        print("🤖 COUNCIL BOT 16: WHATNOT SPECIALIST")
        print("="*70)
        print("\n📺 Syncing Whatnot inventory...")

        if not self.connector or not self.connector.authenticate():
            print("❌ Whatnot authentication failed")
            return

        # Get current inventory
        try:
            inventory = self.connector.get_inventory()
            print(f"✓ Loaded {len(inventory)} listings from Whatnot")

            # Save cache
            with open(self.inventory_cache, "w") as f:
                json.dump([
                    {
                        "id": item.id,
                        "title": item.title,
                        "price": item.price,
                        "url": item.url
                    }
                    for item in inventory
                ], f, indent=2)

            # Track livestream-ready items (high-value, in-stock)
            high_value = [item for item in inventory if item.price > 50]
            print(f"📊 High-value items: {len(high_value)}")

            if high_value:
                print(f"\n🎬 Recommended for next livestream:")
                for item in high_value[:5]:
                    print(f"   • {item.title} (${item.price})")

            self._save_livestream({
                "action": "inventory_sync",
                "total_items": len(inventory),
                "high_value_items": len(high_value),
                "status": "synced"
            })

        except Exception as e:
            print(f"❌ Inventory sync failed: {e}")

    def check_sales(self):
        """Monitor recent sales and update inventory."""
        print("\n" + "─"*70)
        print("💰 Checking recent sales...")

        try:
            sales = self.connector.get_sales(datetime.now())
            print(f"✓ Found {len(sales)} recent sales")

            for sale in sales[:5]:
                print(f"   ✓ Sold: {sale.product_id} for ${sale.price}")

            self._save_livestream({
                "action": "sales_check",
                "sales_count": len(sales),
                "status": "checked"
            })

        except Exception as e:
            print(f"❌ Sales check failed: {e}")

    def run(self):
        """Run full Whatnot specialist cycle."""
        self.sync_inventory()
        time.sleep(1)
        self.check_sales()

        print("\n" + "="*70)
        print("✓ Whatnot specialist sync complete")
        print("="*70 + "\n")


if __name__ == "__main__":
    specialist = WhatnotSpecialist()
    specialist.run()
