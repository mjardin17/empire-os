#!/usr/bin/env python3
"""
Whatnot Specialist Agent: Sophisticated livestream auction automation.
Orchestrates auction scheduling, bid monitoring, pricing optimization, and profitability tracking.
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime, timedelta
import subprocess
import sys
from typing import List, Dict, Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.whatnot_orchestrator import WhatnotAuctionManager, AuctionStrategy
from lib.platform_connectors import get_connector

BUZZ_RELAY_URL = os.getenv("BUZZ_RELAY_URL", "ws://localhost:3000")
BUZZ_PRIVATE_KEY = os.getenv("BUZZ_PRIVATE_KEY")
BOSS_LISTERS_DB = Path(__file__).parent.parent / "boss-listers-ai" / "data.json"
MISSION_BOARD_PATH = Path(__file__).parent.parent / "MISSION_BOARD.json"
WHATNOT_STATE_FILE = Path(__file__).parent.parent / "whatnot_auction_state.json"

def post_to_buzz(message, channel="whatnot-auctions"):
    """Post status to Buzz channel."""
    print(f"[{datetime.now().isoformat()}] #{channel}: {message}")
    if not BUZZ_PRIVATE_KEY:
        return
    cmd = f"""BUZZ_PRIVATE_KEY={BUZZ_PRIVATE_KEY} BUZZ_RELAY_URL={BUZZ_RELAY_URL} buzz-cli message --channel {channel} '{message}'"""
    try:
        subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    except:
        pass

def load_boss_listers_inventory() -> List[Dict]:
    """Load inventory eligible for Whatnot auctions."""
    if not BOSS_LISTERS_DB.exists():
        return []
    try:
        with open(BOSS_LISTERS_DB) as f:
            data = json.load(f)
            return data.get("products", [])
    except Exception as e:
        print(f"Error loading inventory: {e}")
        return []

def load_whatnot_state() -> Dict:
    """Load Whatnot auction state (bid history, scheduled auctions, etc)."""
    if WHATNOT_STATE_FILE.exists():
        try:
            with open(WHATNOT_STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {
        "scheduled_auctions": [],
        "active_auctions": [],
        "completed_auctions": [],
        "bid_history": {},
        "pricing_model": {},
        "last_livestream": None
    }

def save_whatnot_state(state: Dict):
    """Save Whatnot state."""
    state["last_updated"] = datetime.now().isoformat()
    with open(WHATNOT_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def analyze_auction_potential(product: Dict) -> Dict:
    """ML-style scoring for auction success prediction."""
    price = product.get("price", 0)
    category = product.get("category", "").lower()
    condition = product.get("condition", "unknown").lower()
    brand = product.get("brand", "").lower()

    # Base score
    score = 50.0

    # Category premium (collectibles, hobbies score higher)
    category_premiums = {
        "collectibles": 20, "toys": 15, "sports": 15, "comics": 18,
        "vintage": 15, "hobby": 12, "trading cards": 20, "games": 10
    }
    for cat, premium in category_premiums.items():
        if cat in category:
            score += premium
            break

    # Condition bonus
    condition_bonuses = {"mint": 20, "new": 15, "excellent": 10, "good": 5}
    for cond, bonus in condition_bonuses.items():
        if cond in condition:
            score += bonus
            break

    # Price sweet spot ($20-200 auctions do best on Whatnot)
    if 20 <= price <= 200:
        score += 15
    elif price > 200:
        score += 10  # High-value items attract fewer casual bidders

    # Bid multiplier prediction (conservative estimate)
    base_multiplier = 1.0
    if score > 85:
        base_multiplier = 2.8
    elif score > 75:
        base_multiplier = 2.3
    elif score > 65:
        base_multiplier = 1.8
    elif score > 55:
        base_multiplier = 1.4
    else:
        base_multiplier = 1.1

    predicted_sell_price = price * base_multiplier

    return {
        "product_id": product.get("id"),
        "auction_score": min(100, score),
        "bid_multiplier": base_multiplier,
        "predicted_sell_price": predicted_sell_price,
        "profit_delta": predicted_sell_price - price
    }

def schedule_auction_batch(products: List[Dict], state: Dict) -> List[Dict]:
    """
    Schedule products for next livestream in optimal order.
    High-potential items first (drive viewers), mix in mid-tier for volume.
    """
    if not products:
        return []

    # Score each product
    scored = [analyze_auction_potential(p) for p in products]
    scored.sort(key=lambda x: x["auction_score"], reverse=True)

    # Take top 10-20 for next batch
    batch = scored[:min(20, len(scored))]

    # Calculate expected revenue
    total_cost = sum(p.get("price", 0) for p in products if p.get("id") in [b["product_id"] for b in batch])
    total_predicted = sum(b["predicted_sell_price"] for b in batch)
    total_profit = total_predicted - total_cost

    for item in batch:
        item["scheduled_for"] = "next_livestream"
        item["scheduled_at"] = datetime.now().isoformat()

    return batch, total_profit

def monitor_active_auctions(connector) -> Dict:
    """Poll Whatnot for active auctions and current bids."""
    try:
        if not connector.authenticate():
            print("⚠️ Whatnot auth failed")
            return {}

        active = connector.get_inventory()  # Returns current listings

        result = {
            "total_active": len(active),
            "total_value": sum(a.price for a in active) if active else 0,
            "listings": []
        }

        for listing in active:
            result["listings"].append({
                "id": listing.id,
                "title": listing.title,
                "current_bid": listing.price,
                "bid_count": getattr(listing, "bid_count", 0),
                "time_remaining": getattr(listing, "time_remaining", "unknown")
            })

        return result
    except Exception as e:
        print(f"❌ Error monitoring auctions: {e}")
        return {}

def detect_bid_patterns(state: Dict) -> Dict:
    """Analyze historical bid data for optimization."""
    completed = state.get("completed_auctions", [])

    if not completed:
        return {"analysis": "no history yet"}

    # Category performance
    category_stats = {}
    for auction in completed:
        cat = auction.get("category", "unknown")
        if cat not in category_stats:
            category_stats[cat] = {"count": 0, "total_bids": 0, "avg_multiplier": 0}
        category_stats[cat]["count"] += 1
        category_stats[cat]["total_bids"] += auction.get("final_bid_count", 0)
        category_stats[cat]["avg_multiplier"] += auction.get("bid_multiplier", 1.0)

    for cat in category_stats:
        n = category_stats[cat]["count"]
        category_stats[cat]["avg_multiplier"] /= n

    # Best times to stream
    time_stats = {}
    for auction in completed:
        hour = datetime.fromisoformat(auction.get("stream_time", datetime.now().isoformat())).hour
        if hour not in time_stats:
            time_stats[hour] = {"count": 0, "avg_bids": 0}
        time_stats[hour]["count"] += 1
        time_stats[hour]["avg_bids"] += auction.get("final_bid_count", 0)

    for hour in time_stats:
        time_stats[hour]["avg_bids"] /= time_stats[hour]["count"]

    best_hour = max(time_stats.items(), key=lambda x: x[1]["avg_bids"])[0] if time_stats else 20

    return {
        "category_performance": category_stats,
        "optimal_stream_hour": best_hour,
        "total_auctions_analyzed": len(completed),
        "avg_bid_multiplier": sum(a.get("bid_multiplier", 1.0) for a in completed) / len(completed) if completed else 1.0
    }

def main():
    """Main agent loop."""
    print("Whatnot Specialist Agent starting")
    print(f"Relay: {BUZZ_RELAY_URL}")
    print(f"Boss Listers DB: {BOSS_LISTERS_DB}")

    post_to_buzz("🎯 Whatnot Specialist Agent online - orchestrating auctions")

    whatnot = get_connector("whatnot_web")
    if not whatnot:
        print("❌ Whatnot connector failed to initialize")
        return

    state = load_whatnot_state()

    while True:
        try:
            # 1. Monitor active auctions
            active = monitor_active_auctions(whatnot)
            if active.get("total_active", 0) > 0:
                post_to_buzz(
                    f"🎯 LIVE AUCTIONS: {active['total_active']} items\n"
                    f"Total value: ${active.get('total_value', 0):.2f}"
                )

            # 2. Check for new inventory ready for auction
            inventory = load_boss_listers_inventory()
            auction_candidates = [
                p for p in inventory
                if p.get("status") == "for_sale" and p.get("auction_ready") is not False
            ]

            if auction_candidates and len(state.get("scheduled_auctions", [])) < 20:
                print(f"\n📦 Analyzing {len(auction_candidates)} items for auction scheduling...")
                batch, total_profit = schedule_auction_batch(auction_candidates, state)

                if batch:
                    post_to_buzz(
                        f"📋 BATCH SCHEDULED: {len(batch)} items ready\n"
                        f"Predicted profit: ${total_profit:.2f}\n"
                        f"Avg multiplier: {sum(b['bid_multiplier'] for b in batch) / len(batch):.2f}x"
                    )

                    # Add to scheduled
                    state["scheduled_auctions"].extend(batch)

            # 3. Analyze bid patterns from completed auctions
            patterns = detect_bid_patterns(state)
            if patterns.get("total_auctions_analyzed", 0) > 5:
                post_to_buzz(
                    f"📊 AUCTION INTELLIGENCE:\n"
                    f"Best stream time: {patterns.get('optimal_stream_hour')}:00\n"
                    f"Avg bid multiplier: {patterns.get('avg_bid_multiplier', 1.0):.2f}x\n"
                    f"Total analyzed: {patterns.get('total_auctions_analyzed')} auctions"
                )

            # 4. Save state
            save_whatnot_state(state)

            # Poll interval
            time.sleep(300)  # Check every 5 minutes

        except KeyboardInterrupt:
            post_to_buzz("🛑 Whatnot Specialist Agent stopping")
            break
        except Exception as e:
            print(f"Agent error: {e}")
            post_to_buzz(f"⚠️ Error: {str(e)[:100]}")
            time.sleep(60)

if __name__ == "__main__":
    main()
