#!/usr/bin/env python3
"""
Scanner Uploader Agent: Monitors Epson scanner folder → Auto-uploads to Boss Listers
Turns physical product scans into instant digital listings across all platforms.
"""

import os
import json
import time
import hashlib
import subprocess
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.epson_scanner_driver import EpsonScannerDriver
from lib.supabase_inventory import UpsertManualListing

BUZZ_RELAY_URL = os.getenv("BUZZ_RELAY_URL", "ws://localhost:3000")
BUZZ_PRIVATE_KEY = os.getenv("BUZZ_PRIVATE_KEY")
SCANS_DIR = Path.home() / "Scans" / "BossListers"
SCAN_CACHE_FILE = Path(__file__).parent.parent / "scan_upload_cache.json"
BOSS_LISTERS_DB = Path(__file__).parent.parent / "boss-listers-ai" / "data.json"

def post_to_buzz(message, channel="scanner-uploader"):
    """Post status to Buzz."""
    print(f"[{datetime.now().isoformat()}] #{channel}: {message}")
    if not BUZZ_PRIVATE_KEY:
        return
    cmd = f"""BUZZ_PRIVATE_KEY={BUZZ_PRIVATE_KEY} BUZZ_RELAY_URL={BUZZ_RELAY_URL} buzz-cli message --channel {channel} '{message}'"""
    try:
        subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
    except:
        pass

def get_file_hash(file_path: Path) -> str:
    """Get MD5 hash of file to detect duplicates."""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def load_scan_cache() -> Dict:
    """Load previously processed scans to avoid duplicates."""
    if SCAN_CACHE_FILE.exists():
        try:
            with open(SCAN_CACHE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {"processed": {}, "last_check": None}

def save_scan_cache(cache: Dict):
    """Save processed scan records."""
    cache["last_check"] = datetime.now().isoformat()
    with open(SCAN_CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

def extract_product_info_from_scan(scan_dir: Path) -> Dict:
    """
    Extract product information from scan directory name and contents.
    Example: "Vintage_Watch_20240810_120530" → extracts product name
    """
    dir_name = scan_dir.name
    parts = dir_name.rsplit("_", 2)  # Split off timestamp

    if len(parts) >= 1:
        product_name = parts[0].replace("_", " ")
    else:
        product_name = "Scanned Item"

    return {
        "name": product_name,
        "source": "Epson Scanner",
        "category": "general",
        "condition": "unknown",  # Could be extracted from OCR
        "description": f"Scanned product photos. {len(list(scan_dir.glob('*')))} pages/photos.",
        "images": list(scan_dir.glob("*.jpg")) + list(scan_dir.glob("*.pdf"))
    }

def upload_scan_to_boss_listers(product_info: Dict, scan_dir: Path) -> Dict:
    """Upload scan images to Boss Listers inventory."""
    try:
        # Load Boss Listers inventory
        if BOSS_LISTERS_DB.exists():
            with open(BOSS_LISTERS_DB) as f:
                data = json.load(f)
        else:
            data = {"products": []}

        # Create new listing from scan
        listing = {
            "id": f"scan_{hashlib.md5(scan_dir.name.encode()).hexdigest()[:8]}",
            "name": product_info.get("name", "Scanned Item"),
            "source": "scanner",
            "category": product_info.get("category", "general"),
            "condition": product_info.get("condition", "unknown"),
            "description": product_info.get("description", ""),
            "images": [str(img) for img in product_info.get("images", [])],
            "price": 0,  # Josh sets price manually
            "status": "pending_pricing",  # Needs price + details
            "created_at": datetime.now().isoformat(),
            "auction_ready": False,
            "sync_to_platforms": True,
            "create_commercial": True
        }

        # Add to inventory
        data["products"].append(listing)

        # Save updated inventory
        with open(BOSS_LISTERS_DB, 'w') as f:
            json.dump(data, f, indent=2)

        post_to_buzz(
            f"📸 SCANNED: {product_info.get('name')}\n"
            f"Images: {len(product_info.get('images', []))}\n"
            f"Status: Pending price + details\n"
            f"Will sync to all platforms once ready"
        )

        return {
            "status": "uploaded",
            "listing_id": listing["id"],
            "product_name": listing["name"],
            "images_uploaded": len(listing["images"])
        }

    except Exception as e:
        print(f"❌ Upload error: {e}")
        post_to_buzz(f"❌ Upload failed: {str(e)[:100]}")
        return {"status": "error", "reason": str(e)}

def process_new_scans(scanner: EpsonScannerDriver) -> int:
    """Monitor scan directory for new scans and upload to Boss Listers."""
    cache = load_scan_cache()
    processed_count = 0

    if not SCANS_DIR.exists():
        return 0

    # Find all scan directories
    scan_dirs = [d for d in SCANS_DIR.iterdir() if d.is_dir()]

    for scan_dir in scan_dirs:
        dir_hash = get_file_hash(scan_dir)

        # Skip if already processed
        if dir_hash in cache.get("processed", {}):
            continue

        print(f"\n📂 Processing scan: {scan_dir.name}")

        # Extract product info from scan
        product_info = extract_product_info_from_scan(scan_dir)
        print(f"  Product: {product_info.get('name')}")
        print(f"  Images: {len(product_info.get('images', []))}")

        # Upload to Boss Listers
        result = upload_scan_to_boss_listers(product_info, scan_dir)

        if result.get("status") == "uploaded":
            # Mark as processed
            cache["processed"][dir_hash] = {
                "product_name": product_info.get("name"),
                "processed_at": datetime.now().isoformat(),
                "scan_dir": str(scan_dir),
                "images_count": len(product_info.get("images", []))
            }
            processed_count += 1

    # Save cache
    if processed_count > 0:
        save_scan_cache(cache)

    return processed_count

def main():
    """Main agent loop."""
    print("Scanner Uploader Agent starting")
    print(f"Monitoring: {SCANS_DIR}")

    scanner = EpsonScannerDriver()
    status = scanner.get_scanner_status()

    print(f"Scanner: {status.get('scanner')}")
    print(f"Connected: {status.get('connected')}")

    post_to_buzz("🖥️ Scanner Uploader Agent online - monitoring for new scans")

    while True:
        try:
            # Check for new scans
            processed = process_new_scans(scanner)

            if processed > 0:
                print(f"\n✅ Processed {processed} new scan batch(es)")
                post_to_buzz(f"✅ UPLOADED: {processed} scan batch(es) to Boss Listers inventory")

            # Poll interval
            time.sleep(30)  # Check every 30 seconds

        except KeyboardInterrupt:
            post_to_buzz("🛑 Scanner Uploader Agent stopping")
            break
        except Exception as e:
            print(f"Agent error: {e}")
            post_to_buzz(f"⚠️ Error: {str(e)[:100]}")
            time.sleep(60)

if __name__ == "__main__":
    main()
