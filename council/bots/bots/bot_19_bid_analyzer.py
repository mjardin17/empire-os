#!/usr/bin/env python3
"""Bot 19: Whatnot Bid Analyzer
Real-time bid pattern detection and fraud prevention.
- Detects shill bidding (artificially inflating prices)
- Identifies whale bidders (high-value customers)
- Optimizes bid dynamics for maximum engagement
"""

import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict

WHATNOT_STATE = Path(__file__).parent.parent.parent / "whatnot_auction_state.json"

def detect_shilling(auction: dict) -> dict:
    """Detect suspicious bid patterns (shill bidding)."""
    bids = auction.get("bids", [])
    if not bids or len(bids) < 3:
        return {"suspicious": False, "reason": "Insufficient bids for analysis"}

    # Sort by timestamp
    bids_sorted = sorted(bids, key=lambda x: x.get("timestamp", ""))

    # Check for same bidder bidding multiple times in short succession
    bidder_gaps = defaultdict(list)
    for i, bid in enumerate(bids_sorted):
        bidder = bid.get("bidder_id", "unknown")
        if i > 0 and bids_sorted[i-1].get("bidder_id") == bidder:
            gap = (datetime.fromisoformat(bid.get("timestamp", "")) -
                   datetime.fromisoformat(bids_sorted[i-1].get("timestamp", ""))).total_seconds()
            if gap < 60:  # Same bidder within 60 seconds
                bidder_gaps[bidder].append(gap)

    # Red flags
    if bidder_gaps:
        return {"suspicious": True, "reason": "Same bidder rapid-fire bidding detected", "details": dict(bidder_gaps)}

    # Check if final bidder only bid once at the end (typical shill)
    final_bidder = bids_sorted[-1].get("bidder_id")
    final_bidder_count = sum(1 for b in bids_sorted if b.get("bidder_id") == final_bidder)

    if final_bidder_count == 1 and len(bids) > 3:
        return {"suspicious": True, "reason": "Winner only bid in final seconds (shill indicator)"}

    return {"suspicious": False, "total_bids": len(bids), "unique_bidders": len(set(b.get("bidder_id") for b in bids))}

def identify_whales(auction: dict, historical: list) -> dict:
    """Identify high-value bidders for future targeting."""
    bids = auction.get("bids", [])
    if not bids:
        return {"whales": []}

    bidder_stats = defaultdict(lambda: {"bid_count": 0, "total_spent": 0, "max_bid": 0})

    for bid in bids:
        bidder = bid.get("bidder_id", "unknown")
        amount = bid.get("amount", 0)
        bidder_stats[bidder]["bid_count"] += 1
        bidder_stats[bidder]["total_spent"] += amount
        bidder_stats[bidder]["max_bid"] = max(bidder_stats[bidder]["max_bid"], amount)

    # Whales: >3 bids or total spent > 50% of final price
    final_price = auction.get("final_price", 0)
    whales = [
        {"bidder_id": bidder, **stats}
        for bidder, stats in bidder_stats.items()
        if stats["bid_count"] > 3 or stats["total_spent"] > final_price * 0.5
    ]

    return {"whale_count": len(whales), "whales": whales}

def analyze_bid_momentum(auction: dict) -> dict:
    """Analyze bid pacing for engagement insights."""
    bids = auction.get("bids", [])
    if not bids or len(bids) < 2:
        return {"momentum": "insufficient_data"}

    # Parse timestamps
    try:
        timestamps = [datetime.fromisoformat(b.get("timestamp", "")) for b in bids]
    except:
        return {"momentum": "parse_error"}

    duration = (timestamps[-1] - timestamps[0]).total_seconds() / 60  # minutes
    if duration == 0:
        return {"momentum": "instant", "bids": len(bids)}

    bids_per_minute = len(bids) / duration

    if bids_per_minute > 5:
        momentum = "hot"
    elif bids_per_minute > 2:
        momentum = "strong"
    elif bids_per_minute > 0.5:
        momentum = "normal"
    else:
        momentum = "slow"

    return {
        "momentum": momentum,
        "bids_per_minute": round(bids_per_minute, 2),
        "total_duration_minutes": round(duration, 1),
        "recommendation": "high visibility items had hot bidding" if momentum == "hot" else f"Category performed {momentum}"
    }

def main():
    if not WHATNOT_STATE.exists():
        print("No Whatnot auctions to analyze")
        return

    with open(WHATNOT_STATE) as f:
        state = json.load(f)

    completed = state.get("completed_auctions", [])
    print(f"\nBot 19: Whatnot Bid Analyzer")
    print(f"Analyzing {len(completed)} completed auctions...\n")

    suspicious_count = 0
    total_whales = 0

    for auction in completed[-10:]:  # Last 10 auctions
        title = auction.get("title", "Unknown")

        # Shilling check
        shilling = detect_shilling(auction)
        if shilling.get("suspicious"):
            suspicious_count += 1
            print(f"  WARNING: {title}")
            print(f"    Suspicious pattern: {shilling.get('reason')}")

        # Whale identification
        whales = identify_whales(auction, completed)
        whale_count = whales.get("whale_count", 0)
        total_whales += whale_count
        if whale_count > 0:
            print(f"  WHALES: {title} attracted {whale_count} high-value bidders")

        # Momentum analysis
        momentum = analyze_bid_momentum(auction)
        print(f"  MOMENTUM: {title} - {momentum.get('momentum')} "
              f"({momentum.get('bids_per_minute', 0)}/min)")

    print(f"\nSummary:")
    print(f"  Suspicious auctions detected: {suspicious_count}")
    print(f"  Total whale bidders identified: {total_whales}")
    print(f"  Recommendation: {f'Investigate {suspicious_count} suspicious patterns' if suspicious_count > 0 else 'All auctions look clean'}")

if __name__ == "__main__":
    main()
