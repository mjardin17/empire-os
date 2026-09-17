"""
storyforge2/video/commercial.py — book commercial mission generator.

Reuses lib/commercial_generator.py's create_commercial_mission() and
add_to_mission_board() UNCHANGED (not forked) — that schema (product_name,
product_description, price, image_urls) already fits a book perfectly:
cover images in place of product photos, back-cover blurb in place of
product description, list price in place of item price. Queuing a book
mission through the exact same "product" schema means the ALREADY-WIRED
pipeline (agents/video_pipeline_agent.py polls MISSION_BOARD.json ->
render_commercial.py -> lib/crosspost_bridge.py's queue_commercial_for_posting())
picks up book commercials with zero additional changes — no new dispatcher,
no new posting code, no new render entrypoint.

Verified end-to-end 2026-09-04: render_commercial.py + video_effects.py
actually produce a real, valid MP4 (h264/aac, correct duration and
resolution) from a book-shaped mission. Also found and fixed a real bug in
video_effects.py's drawtext escaping that broke on any title containing an
apostrophe ("Founder's", "Don't ...") — see video_effects.py's _esc()
docstring for the fix. Book titles/blurbs contain apostrophes constantly,
so this was a real production blocker, not a hypothetical edge case.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

__all__ = ["queue_book_commercial"]


def _repo_root() -> Path:
    """lib/commercial_generator.py lives at the repo root, not inside
    storyforge2/ — resolve and add it to sys.path lazily so importing this
    module doesn't require the caller to already have the repo root on
    PYTHONPATH."""
    # storyforge2/video/commercial.py -> storyforge2/video -> storyforge2 -> repo root
    return Path(__file__).resolve().parents[2]


def _pick_cover_images(cover_dir: Path, max_images: int = 3) -> list[str]:
    """Picks real, existing cover files in priority order (front/wrap first
    since those are the most commercial-looking; social variants as
    fallback) rather than guessing a single filename. Never invents a path
    that doesn't exist — a missing file is silently skipped, matching this
    repo's "best-effort" cover-package philosophy (see cover/render.py)."""
    priority = [
        "cover_front.png", "cover_full_wrap.png", "cover_ebook.png",
        "cover_social_instagram.png", "cover_social_pinterest.png",
        "cover_thumbnail.png",
    ]
    found: list[str] = []
    for name in priority:
        candidate = cover_dir / name
        if candidate.exists():
            found.append(str(candidate))
        if len(found) >= max_images:
            break
    return found


def queue_book_commercial(
    title: str,
    premise: str,
    author: str,
    price: float,
    cover_dir: Path | str,
    mission_id: str,
    mission_board_path: Path | str = "MISSION_BOARD.json",
    platforms: Optional[list[str]] = None,
) -> Optional[dict]:
    """Builds a book commercial mission (via the unmodified Boss Listers
    generator) and queues it to MISSION_BOARD.json for the existing
    video_pipeline_agent.py to render + auto-post.

    Returns the mission dict if queued, None if no usable cover images were
    found (never queues a mission that render_commercial.py would just fail
    on — that's a wasted render cycle and a silent-looking "success" that
    isn't one).
    """
    repo_root = _repo_root()
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    from lib.commercial_generator import create_commercial_mission, add_to_mission_board

    cover_dir = Path(cover_dir)
    image_paths = _pick_cover_images(cover_dir)
    if not image_paths:
        print(f"[book_commercial] no usable cover images in {cover_dir} — skipping commercial")
        return None

    mission = create_commercial_mission(
        product_name=title,
        product_description=premise,
        price=price,
        image_urls=image_paths,
        mission_id=mission_id,
    )

    # Book-specific overrides: the base generator's channel/publish_to are
    # reasonable defaults, but a book's "buy" surfaces differ from a resale
    # listing's (no single storefront link) — kept as-is for now since
    # instagram/tiktok/youtube_shorts/facebook are still the right posting
    # targets; revisit if book-specific CTAs (Amazon link, author site) are
    # needed later.
    mission["title"] = f"Book Commercial: {title}"

    added = add_to_mission_board(mission, mission_board_path=str(mission_board_path))
    if added:
        print(f"[book_commercial] queued mission {mission_id} ({title}) with {len(image_paths)} cover image(s)")
    else:
        print(f"[book_commercial] mission {mission_id} already existed on the board — not re-queued")
    return mission
