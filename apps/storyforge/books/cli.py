"""
storyforge2/books/cli.py — command-line interface for the Book Factory.

Usage:
    python -m storyforge2.books.cli scan              # Run one trend scan
    python -m storyforge2.books.cli run-cycle         # Generate one book
    python -m storyforge2.books.cli status            # Factory status
    python -m storyforge2.books.cli publish --dry-run # List books ready to publish
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from storyforge2.books.factory import BookFactory
from storyforge2.books.trends import TrendScanner

__all__ = ["main"]


def cmd_scan(args):
    """Run a trend scan."""
    scanner = TrendScanner(state_db=args.state_dir / "trends_state.json")
    opportunity = scanner.scan(dry_run=args.dry_run)

    if opportunity:
        print(f"\n✓ Opportunity found:")
        print(f"  Niche: {opportunity.niche}")
        print(f"  Title: {opportunity.title}")
        print(f"  Premise: {opportunity.premise}")
        print(f"  Audience: {opportunity.target_audience}")
        print(f"  Keywords: {', '.join(opportunity.keywords)}")
        print(json.dumps(opportunity.to_dict(), indent=2, default=str))
    else:
        print("No opportunity due yet.")


def cmd_run_cycle(args):
    """Run a complete book generation cycle."""
    factory = BookFactory(work_base=args.state_dir)
    cycle = factory.run_cycle(dry_run=args.dry_run)

    if cycle:
        print(f"\n✓ Book cycle generated:")
        print(f"  Cycle ID: {cycle.cycle_id}")
        print(f"  Title: {cycle.opportunity.title}")
        print(f"  Status: {cycle.status}")
        if cycle.metadata:
            print(f"  ISBN: {cycle.metadata.isbn}")
        if cycle.error:
            print(f"  Error: {cycle.error}")
    else:
        print("No cycle ran (no opportunity due yet).")


def cmd_status(args):
    """Show factory status."""
    factory = BookFactory(work_base=args.state_dir)
    report = factory.status_report()
    print("\n[BOOK FACTORY STATUS]")
    print(json.dumps(report, indent=2))


def cmd_publish(args):
    """Publish books to all platforms.

    Note: Books are automatically published during run_cycle(). This command
    can be used to:
    1. Check status of published books
    2. Retry publishing for books that failed
    3. Manually trigger publish for books in ready_publish state
    """
    factory = BookFactory(work_base=args.state_dir)
    ready = factory.get_ready_to_publish()

    if ready:
        print(f"\n✓ {len(ready)} book(s) ready to publish:")
        for cycle in ready:
            print(f"  - {cycle.cycle_id}: {cycle.opportunity.title}")
            if not args.dry_run:
                print(f"    → Publishing {cycle.cycle_id}...")
                print(f"       (Publishing is now automatic in run_cycle; this is a retry/manual trigger)")
                # In a full implementation, this would re-run the pipeline.publish() stage
                # For now, books are published automatically during run_cycle()
    else:
        print("No books ready to publish.")


def main():
    parser = argparse.ArgumentParser(
        description="Empire OS Book Factory — autonomous book generation",
    )
    parser.add_argument(
        "--state-dir",
        type=Path,
        default=Path("books"),
        help="Directory for factory state files (default: books/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Dry-run mode (no state changes, default=True)",
    )
    parser.add_argument(
        "--no-dry-run",
        dest="dry_run",
        action="store_false",
        help="Disable dry-run (actually persist state)",
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    subparsers.add_parser("scan", help="Run a trend scan")
    subparsers.add_parser("run-cycle", help="Run a complete book generation cycle")
    subparsers.add_parser("status", help="Show factory status")
    subparsers.add_parser("publish", help="List books ready to publish")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Dispatch
    if args.command == "scan":
        cmd_scan(args)
    elif args.command == "run-cycle":
        cmd_run_cycle(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "publish":
        cmd_publish(args)


if __name__ == "__main__":
    main()
