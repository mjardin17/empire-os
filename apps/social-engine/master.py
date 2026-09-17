#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║          SOCIAL MACHINE — MASTER ORCHESTRATOR               ║
║          "The Emperor commands all councils."               ║
╚══════════════════════════════════════════════════════════════╝

Five councils, three channels, one machine.

Usage:
  python master.py                    # Run all platforms, all channels
  python master.py --platform youtube # YouTube only
  python master.py --channel gods_and_glory  # One channel, all platforms
  python master.py --dry-run          # Plan jobs but don't post
  python master.py --status           # Print current queue/log status
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
QUEUE_DIR = ROOT / "queue"
LOGS_DIR = ROOT / "logs"
QUEUE_FILE = QUEUE_DIR / "queue.json"
LOG_FILE = LOGS_DIR / "posted_log.json"
QUEUE_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# ── config ───────────────────────────────────────────────────────────────────
sys.path.insert(0, str(ROOT))
from config import CHANNELS, is_configured

# ── councils ─────────────────────────────────────────────────────────────────
from councils.youtube.council   import YouTubeCouncil
from councils.instagram.council import InstagramCouncil
from councils.tiktok.council    import TikTokCouncil
from councils.twitter.council   import TwitterCouncil
from councils.facebook.council  import FacebookCouncil

ALL_PLATFORMS = {
    "youtube":   YouTubeCouncil,
    "instagram": InstagramCouncil,
    "tiktok":    TikTokCouncil,
    "twitter":   TwitterCouncil,
    "facebook":  FacebookCouncil,
}

ALL_CHANNELS = list(CHANNELS.keys())


# ─────────────────────────────────────────────────────────────────────────────
# Queue helpers
# ─────────────────────────────────────────────────────────────────────────────
def load_queue() -> list:
    if QUEUE_FILE.exists():
        with open(QUEUE_FILE) as f:
            return json.load(f)
    return []

def save_queue(queue: list):
    with open(QUEUE_FILE, "w") as f:
        json.dump(queue, f, indent=2)

def load_log() -> list:
    if LOG_FILE.exists():
        with open(LOG_FILE) as f:
            return json.load(f)
    return []

def append_log(job: dict):
    log = load_log()
    log.append(job)
    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)

def log_run_summary(summary: dict):
    summary_file = LOGS_DIR / f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[Master] Run log saved: {summary_file.name}")


# ─────────────────────────────────────────────────────────────────────────────
# Status printer
# ─────────────────────────────────────────────────────────────────────────────
def print_status():
    print("\n╔══════════════════════════════════════════════╗")
    print("║          SOCIAL MACHINE STATUS               ║")
    print("╚══════════════════════════════════════════════╝")

    print("\n── Platform credentials ─────────────────────")
    for p in ALL_PLATFORMS:
        status = "✅ configured" if is_configured(p) else "⚠️  not set"
        print(f"  {p.upper():12} {status}")

    queue = load_queue()
    log = load_log()
    print(f"\n── Queue: {len(queue)} pending jobs")
    print(f"── Log:   {len(log)} completed posts")

    if queue:
        print("\n── Pending jobs:")
        for job in queue[:10]:
            print(f"  [{job['platform'].upper():10}] {job['channel']:20} EP{job['episode_number']:03d} {job['type']}")
        if len(queue) > 10:
            print(f"  ... and {len(queue)-10} more")

    if log:
        print(f"\n── Last 5 posts:")
        for job in log[-5:]:
            ts = job.get("posted_at", "?")[:16]
            print(f"  [{job['platform'].upper():10}] {job['channel']:20} EP{job['episode_number']:03d} — {ts} — {job.get('poster_status','?')}")

    print()


# ─────────────────────────────────────────────────────────────────────────────
# Main orchestrator
# ─────────────────────────────────────────────────────────────────────────────
def run(platforms: list, channels: list, dry_run: bool = False):
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║   SOCIAL MACHINE — MASTER ORCHESTRATOR STARTING         ║")
    print(f"║   Platforms: {', '.join(platforms):<44}║")
    print(f"║   Channels:  {', '.join(channels):<44}║")
    print(f"║   Mode:      {'DRY RUN — no posts will be made' if dry_run else 'LIVE — posts will go out':<44}║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    posted_log = load_log()
    queue = load_queue()

    summary = {
        "run_at": datetime.now().isoformat(),
        "platforms": platforms,
        "channels": channels,
        "dry_run": dry_run,
        "jobs_discovered": 0,
        "jobs_executed": 0,
        "jobs_posted": 0,
        "errors": [],
    }

    # ── Phase 1: Discovery — each platform's Strategist finds new jobs
    print("── Phase 1: Discovery ───────────────────────────────────────")
    for platform_name in platforms:
        if not is_configured(platform_name) and not dry_run:
            print(f"  [{platform_name.upper()}] ⚠️  Not configured — skipping (add keys to .env)")
            continue

        CouncilClass = ALL_PLATFORMS[platform_name]
        council = CouncilClass()

        for channel_key in channels:
            new_jobs = council.get_jobs(channel_key, posted_log)
            for job in new_jobs:
                # Avoid queueing duplicates
                is_dup = any(
                    q.get("platform") == job["platform"] and
                    q.get("channel") == job["channel"] and
                    q.get("episode_number") == job["episode_number"] and
                    q.get("type") == job["type"]
                    for q in queue
                )
                if not is_dup:
                    queue.append(job)
                    summary["jobs_discovered"] += 1
                    print(f"  [{platform_name.upper():10}] Queued: {channel_key} EP{job['episode_number']:03d} [{job['type']}]")

    save_queue(queue)
    print(f"\n  Total jobs in queue: {len(queue)}")

    if dry_run:
        print("\n[Master] DRY RUN — stopping here. No posts made.")
        log_run_summary(summary)
        return

    # ── Phase 2: Execution — each council works through its pending jobs
    print("\n── Phase 2: Execution ───────────────────────────────────────")
    remaining_queue = []

    for job in queue:
        if job["platform"] not in platforms or job["channel"] not in channels:
            remaining_queue.append(job)
            continue

        if job.get("status") == "done":
            continue

        platform_name = job["platform"]
        CouncilClass = ALL_PLATFORMS.get(platform_name)
        if not CouncilClass:
            remaining_queue.append(job)
            continue

        council = CouncilClass()
        summary["jobs_executed"] += 1

        try:
            result = council.execute_job(job)
            result["status"] = "done"

            if result.get("poster_status") == "posted":
                summary["jobs_posted"] += 1
                append_log(result)
                print(f"  ✅ [{platform_name.upper():10}] {job['channel']} EP{job['episode_number']:03d} [{job['type']}] POSTED")
            else:
                status = result.get("poster_status", "unknown")
                print(f"  ⚠️  [{platform_name.upper():10}] {job['channel']} EP{job['episode_number']:03d} [{job['type']}] → {status}")
                remaining_queue.append(result)   # re-queue if not posted

        except Exception as e:
            err_msg = f"[{platform_name}/{job['channel']}/EP{job['episode_number']}]: {e}"
            print(f"  ❌ Error: {err_msg}")
            summary["errors"].append(err_msg)
            remaining_queue.append(job)

    save_queue(remaining_queue)

    # ── Summary
    print("\n╔══════════════════════════════════════════════╗")
    print("║              RUN COMPLETE                    ║")
    print(f"║  Jobs discovered:  {summary['jobs_discovered']:<26}║")
    print(f"║  Jobs executed:    {summary['jobs_executed']:<26}║")
    print(f"║  Posts published:  {summary['jobs_posted']:<26}║")
    print(f"║  Errors:           {len(summary['errors']):<26}║")
    print("╚══════════════════════════════════════════════╝")

    log_run_summary(summary)


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Social Machine — Master Orchestrator")
    parser.add_argument("--platform", choices=list(ALL_PLATFORMS.keys()) + ["all"], default="all",
                        help="Which platform council to run")
    parser.add_argument("--channel", choices=ALL_CHANNELS + ["all"], default="all",
                        help="Which channel to process")
    parser.add_argument("--dry-run", action="store_true",
                        help="Discover and queue jobs but don't post")
    parser.add_argument("--status", action="store_true",
                        help="Print machine status and exit")
    args = parser.parse_args()

    if args.status:
        print_status()
        sys.exit(0)

    platforms = list(ALL_PLATFORMS.keys()) if args.platform == "all" else [args.platform]
    channels  = ALL_CHANNELS if args.channel == "all" else [args.channel]

    run(platforms=platforms, channels=channels, dry_run=args.dry_run)
