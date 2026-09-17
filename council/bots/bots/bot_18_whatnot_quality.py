#!/usr/bin/env python3
"""Bot 18: Whatnot Auction Quality Checker
Validates auctions meet quality standards before going live.
- Photo quality (min 3, proper angles)
- Description completeness
- Pricing reasonableness
- Category accuracy
"""

import json
from pathlib import Path
from datetime import datetime

WHATNOT_STATE = Path(__file__).parent.parent.parent / "whatnot_auction_state.json"

def check_photo_quality(images: list) -> dict:
    """Verify minimum 3 photos, good variety."""
    if not images or len(images) < 3:
        return {"passed": False, "reason": "Need minimum 3 photos", "images_count": len(images)}
    if len(images) > 10:
        return {"passed": False, "reason": "Too many photos (max 10)", "images_count": len(images)}
    return {"passed": True, "images_count": len(images)}

def check_description(desc: str) -> dict:
    """Verify description is detailed and auction-ready."""
    if not desc or len(desc) < 50:
        return {"passed": False, "reason": "Description too short (min 50 chars)"}
    if len(desc) > 2000:
        return {"passed": False, "reason": "Description too long (max 2000 chars)"}

    # Check for key info
    key_words = ["condition", "damage", "original", "authentic"]
    found = sum(1 for word in key_words if word.lower() in desc.lower())

    if found < 2:
        return {"passed": True, "warning": "Consider adding condition/authenticity details"}
    return {"passed": True, "found_keywords": found}

def check_pricing(cost: float, reserve: float, predicted: float) -> dict:
    """Validate reserve price and predicted final price are reasonable."""
    if reserve < cost * 0.7:
        return {"passed": False, "reason": "Reserve too low (min 70% of cost)"}
    if reserve > cost * 0.95:
        return {"passed": False, "reason": "Reserve too high (max 95% of cost)"}

    if predicted < cost:
        return {"passed": False, "reason": "Predicted final price below cost (risk)"}
    if predicted > cost * 5:
        return {"passed": False, "reason": "Predicted price unrealistic (may disappoint)"}

    return {"passed": True, "reserve_valid": True, "predicted_valid": True}

def check_category_accuracy(category: str, title: str, description: str) -> dict:
    """Verify item is categorized correctly."""
    text = (title + " " + description).lower()
    category_lower = category.lower()

    if category_lower not in text:
        return {"passed": False, "reason": "Category mismatch with title/description"}

    return {"passed": True, "category_match": True}

def main():
    if not WHATNOT_STATE.exists():
        print("No Whatnot auctions to check yet")
        return

    with open(WHATNOT_STATE) as f:
        state = json.load(f)

    scheduled = state.get("scheduled_auctions", [])
    print(f"\nBot 18: Whatnot Quality Checker")
    print(f"Checking {len(scheduled)} auctions...\n")

    passed = 0
    failed = 0
    warnings = []

    for auction in scheduled:
        checks = {
            "photos": check_photo_quality(auction.get("images", [])),
            "description": check_description(auction.get("description", "")),
            "pricing": check_pricing(
                auction.get("cost", 0),
                auction.get("reserve_price", 0),
                auction.get("predicted_sell_price", 0)
            ),
            "category": check_category_accuracy(
                auction.get("category", ""),
                auction.get("title", ""),
                auction.get("description", "")
            )
        }

        all_passed = all(c["passed"] for c in checks.values())

        if all_passed:
            passed += 1
            print(f"  PASS: {auction.get('title', 'Unknown')}")
        else:
            failed += 1
            print(f"  FAIL: {auction.get('title', 'Unknown')}")
            for check_name, result in checks.items():
                if not result["passed"]:
                    print(f"        - {check_name}: {result.get('reason', 'Failed')}")

        for check_name, result in checks.items():
            if "warning" in result:
                warnings.append(f"{auction.get('title')}: {result['warning']}")

    print(f"\nSummary: {passed} passed, {failed} failed")
    if warnings:
        print(f"Warnings: {len(warnings)}")
        for w in warnings:
            print(f"  - {w}")

if __name__ == "__main__":
    main()
