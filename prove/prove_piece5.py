import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.bosslisters import BossListersAdapter

FIXTURE_PRODUCT = {
    "sku": "FIXTURE-EMPIRE-OS-001",
    "title": "[FIXTURE] Empire OS dry-run listing",
    "description": "Test fixture. Never listed.",
    "price": "0.00",  # Joshua sets every real price
    "quantity": 1,
}


def main():
    logger.info("Starting Piece 5 Verification Run: BossListers adapter (dry-run)", factory="BOSSLISTERS")
    adapter = BossListersAdapter()

    # 1. Dry-run listing through the adapter -> BossListers HTTP API
    result = adapter.submit_job(FIXTURE_PRODUCT, joshua_approved=False)
    resp = result.get("response") or {}
    inv = (resp.get("payloads") or {}).get("inventory_item", {})
    dry_ok = (
        result["status"] == "COMPLETED"
        and result["gate_mode"] == "DRY_RUN"
        and resp.get("dry_run") is True
        and resp.get("published") is False
        and inv.get("product", {}).get("title") == FIXTURE_PRODUCT["title"]
    )

    # 2. LIVE gate decision must be refused with NO request sent
    before = len(adapter.requests_made)
    live_attempt = adapter.submit_job(FIXTURE_PRODUCT, joshua_approved=True)
    live_blocked = live_attempt["status"] == "BLOCKED" and len(adapter.requests_made) == before

    # 3. Adapter refuses any host/port other than localhost:3001
    refused_3002 = False
    try:
        BossListersAdapter("http://localhost:3002")
    except ValueError:
        refused_3002 = True

    print("\n--- PIECE 5 PROOF RESULT ---")
    print(f"Job ID: {result['job_id']}  Status: {result['status']}  Gate Mode: {result['gate_mode']}  HTTP: {result.get('http_status')}")
    print(f"Route hit: POST /api/channels/ebay/create-listing (dryRun=true)  published={resp.get('published')}  dry_run={resp.get('dry_run')}")
    print(f"ready_for_live: {result.get('ready_for_live')}  missing: {result.get('missing')}")
    for line in result.get("would_call") or []:
        print(f"  would call (NOT executed): {line}")
    print(f"LIVE gate attempt -> {live_attempt['status']}, requests sent: {len(adapter.requests_made) - before}")
    print(f"Port 3002 refused: {refused_3002}")
    print(f"Requests made overall: {adapter.requests_made}")

    if dry_ok and live_blocked and refused_3002:
        print("PIECE 5 VERIFIED: one dry-run listing through the BossListers adapter; live path blocked; localhost:3001 only.\n")
    else:
        print(f"PIECE 5 FAILED: dry_ok={dry_ok} live_blocked={live_blocked} refused_3002={refused_3002} error={result.get('error')}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
