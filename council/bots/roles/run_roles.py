"""
council/roles/run_roles.py — run all 10 specialized roles in priority order.

Additive companion to council/council.py (which keeps scanning council/bots/).

Usage:
    python council/roles/run_roles.py                # all roles, channel gg
    python council/roles/run_roles.py --channel lo
    python council/roles/run_roles.py --role qa      # partial name match
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

from council.bot_base import ALL_CHANNELS  # noqa: E402
from council.roles.audio_engineer import AudioEngineer  # noqa: E402
from council.roles.director import Director  # noqa: E402
from council.roles.performance_analyst import PerformanceAnalyst  # noqa: E402
from council.roles.producer import Producer  # noqa: E402
from council.roles.prompt_engineer import PromptEngineer  # noqa: E402
from council.roles.publisher import Publisher  # noqa: E402
from council.roles.qa_engineer import QAEngineer  # noqa: E402
from council.roles.screenwriter import Screenwriter  # noqa: E402
from council.roles.storyboard_artist import StoryboardArtist  # noqa: E402
from council.roles.video_editor import VideoEditor  # noqa: E402

ALL_ROLES = sorted(
    [Director, Producer, Screenwriter, StoryboardArtist, PromptEngineer,
     VideoEditor, AudioEngineer, QAEngineer, Publisher, PerformanceAnalyst],
    key=lambda c: c.priority)


def run_all(channel: str = "gg", role_filter: str | None = None) -> list:
    """Run every role for one channel; returns list of BotResult."""
    classes = ALL_ROLES
    if role_filter:
        classes = [c for c in classes if role_filter in c.name]
    results = []
    print(f"\n{'=' * 60}\n  COUNCIL ROLES — {channel.upper()} — "
          f"{len(classes)} member(s)\n{'=' * 60}\n")
    for cls in classes:
        role = cls(channel=channel)
        print(f"  ▶ [{cls.priority:2d}] {role.name} — {role.description}")
        try:
            result = role.run()
        except Exception as e:
            result = role.result
            result.error(f"role crashed: {e}")
        for msg in result.messages:
            print(f"      {msg}")
        if result.next_action:
            print(f"      ⟶ Next: {result.next_action}")
        results.append(result)
        print()
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Empire OS council roles")
    parser.add_argument("--channel", default="gg", choices=ALL_CHANNELS)
    parser.add_argument("--role", default=None, help="partial role name filter")
    args = parser.parse_args()
    results = run_all(channel=args.channel, role_filter=args.role)
    errors = sum(1 for r in results if r.status == "error")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
