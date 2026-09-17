"""
council.py — Viral Engine Master Council
Auto-discovers all bots in council/bots/, runs them in priority order,
tracks results, chains bot triggers, and logs everything.

The council GROWS over time: add any bot_XX_name.py to council/bots/ and
it auto-registers on the next run — no config changes needed.

Usage:
    py council/council.py              # run all bots once
    py council/council.py --watch 300  # run every 5 minutes indefinitely
    py council/council.py --bot bot_guardian  # run single bot
    py council/council.py --status     # show last run summary
"""

from __future__ import annotations

import argparse
import importlib.util
import inspect
import json
import sys
import time
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
BOTS_DIR = Path(__file__).parent / "bots"
STATE_DIR = Path(__file__).parent / "state"
RUNS_DIR = Path(__file__).parent / "runs"
STATE_DIR.mkdir(parents=True, exist_ok=True)
RUNS_DIR.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(BASE_DIR))
from council.bot_base import CouncilBot, BotResult, ALL_CHANNELS


# ── Bot Discovery ─────────────────────────────────────────────────────────────

def discover_bots() -> list[type[CouncilBot]]:
    """Auto-discover all CouncilBot subclasses in council/bots/."""
    found: list[type[CouncilBot]] = []

    for bot_file in sorted(BOTS_DIR.glob("bot_*.py")):
        spec = importlib.util.spec_from_file_location(bot_file.stem, bot_file)
        if spec is None or spec.loader is None:
            continue
        mod = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(mod)
        except Exception as e:
            print(f"  [WARN] Could not load {bot_file.name}: {e}")
            continue

        for _, cls in inspect.getmembers(mod, inspect.isclass):
            if (issubclass(cls, CouncilBot)
                    and cls is not CouncilBot
                    and cls.__module__ == mod.__name__):
                found.append(cls)

    # Sort by priority
    found.sort(key=lambda c: c.priority)
    return found


# ── Council Run ───────────────────────────────────────────────────────────────

def run_council(bot_filter: str | None = None, verbose: bool = True,
                channel: str = "gg") -> dict:
    """Run all (or one) bot(s) for a given channel and return summary."""
    bot_classes = discover_bots()
    if not bot_classes:
        print("  [WARN] No bots found in council/bots/")
        return {}

    if bot_filter:
        bot_classes = [c for c in bot_classes if bot_filter in c.name]
        if not bot_classes:
            print(f"  [ERROR] No bot matching '{bot_filter}'")
            return {}

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    results: list[BotResult] = []
    triggered_next: list[str] = []

    print(f"\n{'='*65}")
    print(f"  VIRAL ENGINE COUNCIL  —  {channel.upper()}  —  Run {run_id}")
    print(f"  {len(bot_classes)} bot(s) active")
    print(f"{'='*65}\n")

    for BotClass in bot_classes:
        bot = BotClass(base_dir=BASE_DIR, verbose=verbose, channel=channel)
        print(f"  ▶ {bot.name}  [{bot.description}]")

        try:
            result = bot.run()
        except Exception as e:
            result = bot.result
            result.error(f"Bot crashed: {e}")
            result.status = "error"

        results.append(result)

        # Print messages
        for msg in result.messages:
            print(f"    {msg}")

        status_icon = {"ok": "✓", "warning": "⚠", "error": "✗",
                       "fixed": "→"}.get(result.status, "?")
        print(f"    {status_icon} Status: {result.status} "
              f"({result.issues_found} found, {result.issues_fixed} fixed)")

        if result.next_action:
            print(f"    ⟶ Next: {result.next_action}")
            triggered_next.append(result.next_action)

        print()

    # ── Summary ──────────────────────────────────────────────────────────────
    total_issues = sum(r.issues_found for r in results)
    total_fixed = sum(r.issues_fixed for r in results)
    statuses = [r.status for r in results]

    overall = ("ok" if all(s == "ok" for s in statuses)
               else "fixed" if any(s == "fixed" for s in statuses)
               else "warning" if any(s == "warning" for s in statuses)
               else "error")

    print(f"{'='*65}")
    print(f"  Council Run Complete  —  {overall.upper()}")
    print(f"  Issues: {total_issues} found, {total_fixed} fixed")
    print(f"  Bots run: {len(results)}")
    print(f"{'='*65}\n")

    # ── Save run log ─────────────────────────────────────────────────────────
    run_summary = {
        "run_id": run_id,
        "channel": channel,
        "ran_at": datetime.now().isoformat(),
        "overall_status": overall,
        "total_issues_found": total_issues,
        "total_issues_fixed": total_fixed,
        "bots": [r.to_dict() for r in results],
        "next_actions": triggered_next,
    }

    # Channel-scoped run log
    channel_runs_dir = RUNS_DIR / channel
    channel_runs_dir.mkdir(parents=True, exist_ok=True)
    run_path = channel_runs_dir / f"run_{run_id}.json"
    run_path.write_text(json.dumps(run_summary, indent=2))

    # Latest run per channel — used by show_status()
    channel_state_dir = STATE_DIR / channel
    channel_state_dir.mkdir(parents=True, exist_ok=True)
    (channel_state_dir / "latest_run.json").write_text(json.dumps(run_summary, indent=2))

    return run_summary


# ── Watch Mode ────────────────────────────────────────────────────────────────

def watch_mode(interval_sec: int, bot_filter: str | None = None,
               channel: str = "gg"):
    """Run council repeatedly on a timer."""
    print(f"\n  Council watch mode [{channel.upper()}] — interval: {interval_sec}s  (Ctrl+C to stop)\n")
    run_count = 0
    while True:
        run_count += 1
        print(f"\n  ═══ Watch run #{run_count} [{channel.upper()}] ═══")
        result = run_council(bot_filter=bot_filter, verbose=True, channel=channel)
        overall = result.get("overall_status", "?")
        next_run = datetime.now().strftime("%H:%M:%S")
        print(f"  Sleeping {interval_sec}s… (next run ~{next_run})")
        try:
            time.sleep(interval_sec)
        except KeyboardInterrupt:
            print("\n  Council watch stopped.")
            break


# ── Status ───────────────────────────────────────────────────────────────────

def show_status(channel: str = "gg"):
    """Show last run summary for a given channel (or all channels)."""
    channels = ALL_CHANNELS if channel == "all" else [channel]
    for ch in channels:
        latest = STATE_DIR / ch / "latest_run.json"
        if not latest.exists():
            print(f"  [{ch.upper()}] No council runs yet.")
            continue
        data = json.loads(latest.read_text())
        print(f"\n  [{ch.upper()}] Last run: {data['ran_at'][:19]}  —  {data['overall_status'].upper()}")
        print(f"  Issues: {data['total_issues_found']} found, {data['total_issues_fixed']} fixed\n")
        for bot in data.get("bots", []):
            icon = {"ok": "✓", "warning": "⚠", "error": "✗", "fixed": "→"}.get(bot["status"], "?")
            print(f"  {icon} {bot['bot_name']:30s}  {bot['status']:8s}  "
                  f"+{bot['issues_found']}/-{bot['issues_fixed']}")
        if data.get("next_actions"):
            print(f"\n  Pending actions:")
            for a in data["next_actions"]:
                print(f"    → {a}")
        print()

    # Show bot count
    bots = list(BOTS_DIR.glob("bot_*.py"))
    print(f"  Registered bots: {len(bots)}")
    for b in sorted(bots):
        print(f"    • {b.stem}")
    print()


# ── Bot Factory hint ─────────────────────────────────────────────────────────

def list_bots():
    bot_classes = discover_bots()
    print(f"\n  {'='*50}")
    print(f"  COUNCIL BOTS  ({len(bot_classes)} active)")
    print(f"  {'='*50}")
    for cls in bot_classes:
        icon = "🔧" if cls.auto_fix else "👁"
        print(f"  {icon} [{cls.priority:3d}] {cls.name:30s} — {cls.description}")
    print()
    print("  To add a new bot: copy any bot file in council/bots/,")
    print("  change the class name, name, and run() method.")
    print("  It auto-registers on next council run.\n")


# ── Entry Point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Viral Engine Council Coordinator")
    parser.add_argument("--watch", type=int, metavar="SECONDS",
                        help="Run continuously every N seconds")
    parser.add_argument("--bot", metavar="BOT_NAME",
                        help="Run only a specific bot (partial name match)")
    parser.add_argument("--status", action="store_true",
                        help="Show last run summary")
    parser.add_argument("--list", action="store_true",
                        help="List all registered bots")
    parser.add_argument("--quiet", action="store_true",
                        help="Minimal output")
    parser.add_argument(
        "--channel",
        default="gg",
        choices=ALL_CHANNELS + ["all"],
        help=f"Channel to run council for (default: gg). Use 'all' for all channels.",
    )
    args = parser.parse_args()

    if args.status:
        show_status(channel=args.channel)
    elif args.list:
        list_bots()
    elif args.channel == "all" and not args.watch:
        # Run every channel sequentially
        for ch in ALL_CHANNELS:
            print(f"\n{'#'*65}")
            print(f"  EMPIRE OS — Running council for: {ch.upper()}")
            print(f"{'#'*65}")
            run_council(bot_filter=args.bot, verbose=not args.quiet, channel=ch)
    elif args.watch:
        watch_mode(args.watch, bot_filter=args.bot, channel=args.channel)
    else:
        run_council(bot_filter=args.bot, verbose=not args.quiet, channel=args.channel)


if __name__ == "__main__":
    main()
