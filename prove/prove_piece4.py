import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.merch_factory import MerchFactoryAdapter


def main():
    logger.info("Starting Piece 4 Verification Run: Merch Factory (scanner -> Printful dry-run)", factory="MERCH_FACTORY")
    adapter = MerchFactoryAdapter()

    rescan = "--rescan" in sys.argv
    scan = adapter.run_scanner() if rescan else adapter.load_latest_scan()
    source = "LIVE RESCAN (this run)" if rescan else "latest scanner output on disk"

    result = adapter.submit_job(scan, top_n=3, joshua_approved=False)

    all_dry = all(r["dry_run"] for r in result["results"])
    payloads_ok = all(r["payload"] and r["payload"].get("sync_variants") for r in result["results"])
    report = Path(result["report_path"])

    print("\n--- PIECE 4 PROOF RESULT ---")
    print(f"Scan source: {source} (scan_date {result['scan_date']})")
    print(f"Job ID: {result['job_id']}  Status: {result['status']}  Gate Mode: {result['gate_mode']}")
    for r in result["results"]:
        print(f"  #{r['rank']} score={r['score']} {r['niche']}")
        print(f"      success={r['success']} dry_run={r['dry_run']} error_code={r['error_code']}")
        print(f"      {r['message']}")
    print(f"Report: {report} (Exists: {report.exists()})")

    if result["status"] == "COMPLETED" and result["gate_mode"] == "DRY_RUN" and all_dry and payloads_ok and report.exists():
        print("PIECE 4 VERIFIED: scanner output -> Printful connector dry-run path working end-to-end (no network call to Printful, nothing listed).\n")
    else:
        print("PIECE 4 FAILED: see results above.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
