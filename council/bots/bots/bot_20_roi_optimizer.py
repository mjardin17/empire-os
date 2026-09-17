#!/usr/bin/env python3
"""Bot 20: Whatnot ROI Optimizer
Calculates optimal auction strategy and pricing.
- Recommends reserve prices for max ROI
- Identifies best times to stream
- Optimizes batch composition
- Predicts profit per auction
"""

import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

WHATNOT_STATE = Path(__file__).parent.parent.parent / "whatnot_auction_state.json"

def calculate_category_performance(completed_auctions: list) -> dict:
    """Analyze which categories have highest ROI."""
    category_stats = defaultdict(lambda: {"count": 0, "total_profit": 0, "total_roi": 0})

    for auction in completed_auctions:
        category = auction.get("category", "uncategorized")
        profit = auction.get("profit", 0)
        roi = auction.get("roi", 0)

        category_stats[category]["count"] += 1
        category_stats[category]["total_profit"] += profit
        category_stats[category]["total_roi"] += roi

    # Calculate averages
    for cat in category_stats:
        n = category_stats[cat]["count"]
        category_stats[cat]["avg_profit"] = category_stats[cat]["total_profit"] / n
        category_stats[cat]["avg_roi"] = category_stats[cat]["total_roi"] / n

    # Sort by avg ROI
    ranked = sorted(
        category_stats.items(),
        key=lambda x: x[1]["avg_roi"],
        reverse=True
    )

    return dict(ranked)

def recommend_reserve_pricing(product_cost: float, category: str, completed: list) -> dict:
    """Recommend optimal reserve price based on category performance."""
    # Get category average ROI
    cat_performance = calculate_category_performance(completed)
    category_lower = category.lower()

    base_roi = 1.0
    for cat, stats in cat_performance.items():
        if cat.lower() == category_lower:
            base_roi = stats.get("avg_roi", 1.0) / 100  # Convert percent to multiplier
            break

    # Calculate optimal reserve
    # Lower reserve = more bids = social proof = higher final price
    # Higher reserve = protection for seller

    if base_roi > 2.0:  # High ROI category
        reserve = product_cost * 0.75  # Lower reserve to attract bidders
        strategy = "aggressive"
    elif base_roi > 1.5:  # Good ROI
        reserve = product_cost * 0.80
        strategy = "balanced"
    else:  # Struggling category
        reserve = product_cost * 0.85  # Higher reserve to protect
        strategy = "conservative"

    return {
        "recommended_reserve": round(reserve, 2),
        "reserve_percent_of_cost": round((reserve / product_cost) * 100, 1),
        "strategy": strategy,
        "historical_avg_roi": base_roi,
        "rationale": f"Category {category} has {base_roi:.1%} avg ROI - using {strategy} reserve strategy"
    }

def find_optimal_stream_hours(completed_auctions: list) -> dict:
    """Identify best times to stream for maximum engagement."""
    hour_stats = defaultdict(lambda: {"count": 0, "total_bids": 0, "total_profit": 0})

    for auction in completed_auctions:
        try:
            stream_time = datetime.fromisoformat(auction.get("stream_time", datetime.now().isoformat()))
            hour = stream_time.hour

            hour_stats[hour]["count"] += 1
            hour_stats[hour]["total_bids"] += auction.get("final_bid_count", 0)
            hour_stats[hour]["total_profit"] += auction.get("profit", 0)
        except:
            continue

    # Calculate averages and rank
    hour_performance = {}
    for hour, stats in hour_stats.items():
        if stats["count"] > 0:
            hour_performance[hour] = {
                "avg_bids": stats["total_bids"] / stats["count"],
                "avg_profit": stats["total_profit"] / stats["count"],
                "auctions_count": stats["count"]
            }

    # Top 3 hours
    top_hours = sorted(
        hour_performance.items(),
        key=lambda x: x[1]["avg_bids"],
        reverse=True
    )[:3]

    recommendations = [
        f"{hour}:00 - {stats['avg_bids']:.1f} avg bids, ${stats['avg_profit']:.2f} avg profit"
        for hour, stats in top_hours
    ]

    return {
        "top_hours": [h for h, _ in top_hours],
        "performance": dict(top_hours),
        "recommendations": recommendations
    }

def optimize_batch_composition(scheduled_auctions: list, completed: list) -> dict:
    """Recommend optimal batch composition for next livestream."""
    # Analyze what combination works best
    category_perf = calculate_category_performance(completed)

    # Score each scheduled item
    scored = []
    for item in scheduled_auctions:
        category = item.get("category", "").lower()
        cost = item.get("cost", 0)

        # Find category ROI
        roi = 1.0
        for cat, stats in category_perf.items():
            if cat.lower() == category:
                roi = stats.get("avg_roi", 100) / 100
                break

        predicted_profit = cost * roi - cost
        score = predicted_profit * item.get("confidence_score", 0.5)

        scored.append({
            "product_id": item.get("product_id"),
            "title": item.get("title"),
            "predicted_profit": predicted_profit,
            "confidence": item.get("confidence_score"),
            "score": score
        })

    # Sort by score and select top items
    scored.sort(key=lambda x: x["score"], reverse=True)
    optimal_batch = scored[:15]  # 15 items per batch is optimal for Whatnot

    total_predicted_profit = sum(item["predicted_profit"] for item in optimal_batch)
    avg_confidence = sum(item["confidence"] for item in optimal_batch) / len(optimal_batch)

    return {
        "batch_size": len(optimal_batch),
        "total_predicted_profit": round(total_predicted_profit, 2),
        "average_confidence": round(avg_confidence, 2),
        "items": optimal_batch,
        "recommendation": f"Run auction with these {len(optimal_batch)} items for predicted ${total_predicted_profit:.2f} profit"
    }

def main():
    if not WHATNOT_STATE.exists():
        print("No Whatnot auction data yet")
        return

    with open(WHATNOT_STATE) as f:
        state = json.load(f)

    completed = state.get("completed_auctions", [])
    scheduled = state.get("scheduled_auctions", [])

    print(f"\nBot 20: Whatnot ROI Optimizer")
    print(f"Analyzing {len(completed)} completed auctions...\n")

    if completed:
        # Category performance
        print("TOP PERFORMING CATEGORIES:")
        cat_perf = calculate_category_performance(completed)
        for i, (cat, stats) in enumerate(list(cat_perf.items())[:5], 1):
            print(f"  {i}. {cat}: {stats.get('avg_roi', 0):.1f}% ROI "
                  f"(${stats.get('avg_profit', 0):.2f} avg profit)")

        # Optimal stream hours
        print("\nOPTIMAL STREAM HOURS:")
        stream_opt = find_optimal_stream_hours(completed)
        for rec in stream_opt.get("recommendations", []):
            print(f"  {rec}")

    if scheduled:
        print("\nBATCH OPTIMIZATION:")
        batch_opt = optimize_batch_composition(scheduled, completed)
        print(f"  Recommended batch size: {batch_opt['batch_size']} items")
        print(f"  Predicted profit: ${batch_opt['total_predicted_profit']:.2f}")
        print(f"  Confidence score: {batch_opt['average_confidence']:.1%}")

        if batch_opt["items"]:
            print("\n  Top 5 items for next auction:")
            for i, item in enumerate(batch_opt["items"][:5], 1):
                print(f"    {i}. {item['title']} - ${item['predicted_profit']:.2f} profit")

if __name__ == "__main__":
    main()
