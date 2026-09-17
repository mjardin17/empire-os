"""
storyforge2/cli.py — command-line interface for the Story Forge 2 pipeline.

Usage:
    python -m storyforge2.cli new --title "Book Title" --author "Author Name"
    python -m storyforge2.cli generate [--provider mock|waterfall] [--dry-run|--real]
    python -m storyforge2.cli publish --platforms kdp,d2d,payhip [--dry-run|--real]
    python -m storyforge2.cli status
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from storyforge2.brief import ProjectBrief
from storyforge2.pipeline import BookPipeline


def cmd_new(args):
    """Create a new project brief."""
    brief = ProjectBrief(
        title=args.title,
        premise=args.premise or args.title,
        author_name=args.author,
        reading_level=args.level.upper(),
        genre=args.genre,
        length_chapters=args.chapters,
        trim_size=args.trim,
    )

    problems = brief.validate()
    if problems:
        print(f"[ERROR] Brief validation failed:")
        for p in problems:
            print(f"  - {p}")
        return False

    brief_file = Path("brief.json")
    brief_file.write_text(json.dumps(brief.to_dict(), indent=2))
    print(f"[OK] Brief created: {brief_file}")
    return True


def cmd_generate(args):
    """Run the full pipeline: manuscript → layout → cover → export."""
    brief_file = Path("brief.json")
    if not brief_file.exists():
        print(f"[ERROR] brief.json not found. Run 'cli new' first.")
        return False

    brief_data = json.loads(brief_file.read_text())
    brief = ProjectBrief.from_dict(brief_data)

    pipeline = BookPipeline(brief, work_dir=".")
    success = pipeline.run(provider_name=args.provider, dry_run=args.dry_run)
    return success


def cmd_publish(args):
    """Publish to specified platforms."""
    brief_file = Path("brief.json")
    if not brief_file.exists():
        print(f"[ERROR] brief.json not found. Run 'cli new' first.")
        return False

    brief_data = json.loads(brief_file.read_text())
    brief = ProjectBrief.from_dict(brief_data)

    platforms = args.platforms.split(",") if args.platforms else ["d2d"]
    pipeline = BookPipeline(brief, work_dir=".")

    results = pipeline.publish(platforms=platforms, dry_run=args.dry_run)
    print(f"\n[PUBLISH RESULTS]")
    for platform_id, result in results.items():
        print(f"  {platform_id}: {result.get('message', result)}")
    return True


def cmd_status(args):
    """Show pipeline status."""
    brief_file = Path("brief.json")
    if not brief_file.exists():
        print(f"[STATUS] No project — run 'cli new' to start")
        return True

    brief_data = json.loads(brief_file.read_text())
    brief = ProjectBrief.from_dict(brief_data)

    pipeline = BookPipeline(brief, work_dir=".")
    print(f"\n[STATUS] Project: {brief.title}")
    print(f"[STATUS] Work dir: {pipeline.work_dir}")

    # List output files
    output_files = list(pipeline.work_dir.glob("**/*.*"))
    if output_files:
        print(f"\n[OUTPUT FILES] ({len(output_files)} total)")
        for f in sorted(output_files)[:20]:
            print(f"  - {f.relative_to(pipeline.work_dir)}")
        if len(output_files) > 20:
            print(f"  ... and {len(output_files) - 20} more")
    else:
        print(f"\n[OUTPUT FILES] None yet — run 'cli generate' to build")

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Story Forge 2 — Book generation and publishing pipeline",
    )
    subparsers = parser.add_subparsers(dest="cmd", help="Command to run")

    # new
    new_parser = subparsers.add_parser("new", help="Create a new project")
    new_parser.add_argument("--title", required=True, help="Book title")
    new_parser.add_argument("--author", required=True, help="Author name")
    new_parser.add_argument("--premise", help="Book premise/description")
    new_parser.add_argument("--genre", default="Fiction", help="Genre")
    new_parser.add_argument("--level", default="YA", choices=["MG", "YA", "ADULT"], help="Reading level")
    new_parser.add_argument("--chapters", type=int, default=12, help="Number of chapters")
    new_parser.add_argument("--trim", default="6x9", help="Trim size (6x9, 5x8, etc.)")

    # generate
    gen_parser = subparsers.add_parser("generate", help="Generate manuscript, cover, export")
    gen_parser.add_argument("--provider", default="mock", choices=["mock", "waterfall"], help="Image provider")
    gen_parser.add_argument("--dry-run", action="store_true", default=True, help="Dry run (default)")
    gen_parser.add_argument("--real", action="store_false", dest="dry_run", help="Real (publish for real)")

    # publish
    pub_parser = subparsers.add_parser("publish", help="Publish to platforms")
    pub_parser.add_argument("--platforms", default="d2d", help="Comma-separated platform IDs (kdp, d2d, payhip, etc.)")
    pub_parser.add_argument("--dry-run", action="store_true", default=True, help="Dry run (default)")
    pub_parser.add_argument("--real", action="store_false", dest="dry_run", help="Real (publish for real)")

    # status
    status_parser = subparsers.add_parser("status", help="Show project status")

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        return 1

    handlers = {
        "new": cmd_new,
        "generate": cmd_generate,
        "publish": cmd_publish,
        "status": cmd_status,
    }

    handler = handlers.get(args.cmd)
    if not handler:
        print(f"[ERROR] Unknown command: {args.cmd}")
        return 1

    try:
        success = handler(args)
        return 0 if success else 1
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
