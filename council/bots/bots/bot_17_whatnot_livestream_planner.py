#!/usr/bin/env python3
"""Council Bot 17: Whatnot Livestream Planner - prepares inventory for shows."""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from lib.platform_connectors import get_connector


class LivestreamPlanner:
    """Plans Whatnot livestreams based on inventory."""

    def __init__(self):
        self.connector = get_connector("whatnot")
        self.livestream_plan = Path("whatnot_livestream_plan.json")
        self.inventory_cache = Path("whatnot_inventory_cache.json")

    def _load_inventory(self) -> List[Dict]:
        """Load cached inventory."""
        if self.inventory_cache.exists():
            with open(self.inventory_cache) as f:
                return json.load(f)
        return []

    def plan_livestream(self):
        """Generate livestream plan based on current inventory."""
        print("\n" + "="*70)
        print("📺 COUNCIL BOT 17: WHATNOT LIVESTREAM PLANNER")
        print("="*70)

        inventory = self._load_inventory()
        if not inventory:
            print("❌ No inventory cached. Run bot_16 first.")
            return

        print(f"\n📊 Planning livestream with {len(inventory)} items...")

        # Categorize inventory
        price_ranges = {
            "hot_deals": [item for item in inventory if 10 < item.get("price", 0) < 50],
            "premium": [item for item in inventory if item.get("price", 0) >= 50],
            "bargains": [item for item in inventory if item.get("price", 0) <= 10],
        }

        plan = {
            "generated_at": datetime.now().isoformat(),
            "total_items": len(inventory),
            "livestream_segments": [
                {
                    "segment": 1,
                    "name": "Opening Deal",
                    "items": price_ranges["hot_deals"][:3],
                    "duration_minutes": 15
                },
                {
                    "segment": 2,
                    "name": "Premium Items",
                    "items": price_ranges["premium"][:5],
                    "duration_minutes": 20
                },
                {
                    "segment": 3,
                    "name": "Bulk Bargains",
                    "items": price_ranges["bargains"][:10],
                    "duration_minutes": 15
                },
                {
                    "segment": 4,
                    "name": "Lightning Deals",
                    "items": inventory[15:20] if len(inventory) > 15 else inventory,
                    "duration_minutes": 10
                },
            ],
            "total_livestream_time": 60
        }

        # Save plan
        with open(self.livestream_plan, "w") as f:
            json.dump(plan, f, indent=2)

        print(f"\n✓ Livestream plan created (60 minutes)")
        print(f"\n📋 Segments:")
        for segment in plan["livestream_segments"]:
            print(f"   • {segment['name']}: {len(segment['items'])} items ({segment['duration_minutes']}min)")

        print(f"\n💡 Recommendations:")
        if price_ranges["hot_deals"]:
            print(f"   ✓ Start with hot deals to build momentum")
        if price_ranges["premium"]:
            print(f"   ✓ Feature premium items mid-stream for higher value")
        if price_ranges["bargains"]:
            print(f"   ✓ End with bulk bargains to clear inventory")

        print(f"\n✓ Plan saved to {self.livestream_plan}")
        print("="*70 + "\n")


if __name__ == "__main__":
    planner = LivestreamPlanner()
    planner.plan_livestream()
