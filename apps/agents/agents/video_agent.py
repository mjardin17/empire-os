"""
orchestrator/agents/video_agent.py — Real-video agent for action scenes.

Detects action scenes (battle/charge/fire/explosion/... keywords in the
narration) and tries the FREE tier of providers/waterfall.py to generate a
short real-motion clip. Falls back to None so the caller uses Ken Burns
stills instead.

CREDIT SAFETY: this agent NEVER calls paid Higgsfield — it only walks the
free/cheap video chain (Luma, FAL, HF, Pika, Minimax, Replicate,
image_to_video). Paid providers stay a deliberate human decision.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Optional

BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

TAG = "[video_agent]"

ACTION_KEYWORDS: tuple[str, ...] = (
    "battle", "charge", "fire", "explosion", "cavalry", "attack", "siege", "march",
)

MIN_CLIP_SEC = 3
MAX_CLIP_SEC = 10


def _log(msg: str) -> None:
    """Tagged stdout log line."""
    print(f"{TAG} {msg}", flush=True)


def is_action_scene(narration: str) -> bool:
    """True if the narration contains any action keyword (case-insensitive)."""
    text = (narration or "").lower()
    return any(kw in text for kw in ACTION_KEYWORDS)


def generate_action_clip(scene: dict, work_dir: Path, tag: str,
                         narration_duration: float) -> Optional[Path]:
    """
    Try to generate a real video clip for an action scene via the FREE
    provider waterfall chain.

    Args:
        scene:              Scene dict (visual_prompt / title / narration used as prompt).
        work_dir:           Directory for the downloaded clip.
        tag:                Filename stem, e.g. "scene_03".
        narration_duration: Narration length in seconds (clip target is clamped 3–10s).

    Returns:
        Path to a valid clip (>10KB) or None — caller falls back to images.
        Never raises.
    """
    narration = str(scene.get("narration", ""))
    if not is_action_scene(narration):
        return None

    prompt = (scene.get("visual_prompt") or scene.get("higgsfield_prompt")
              or scene.get("title") or narration).strip()
    if not prompt:
        return None

    duration = max(MIN_CLIP_SEC, min(MAX_CLIP_SEC, math.ceil(narration_duration)))
    work_dir.mkdir(parents=True, exist_ok=True)
    _log(f"{tag}: action scene detected — trying free video providers ({duration}s)")

    try:
        # Free chain only — deliberately NOT generate_scene_asset (it ends in
        # paid Higgsfield). Credits are real money.
        from providers.waterfall import _run_video_provider, _video_chain
        for name, factory in _video_chain():
            try:
                provider = factory()
                if not provider.is_connected():
                    continue
            except Exception as e:
                _log(f"{name}: init failed — {e}")
                continue
            dest = work_dir / f"{tag}_{name}.mp4"
            clip = _run_video_provider(provider, name, prompt, duration, "16:9", dest)
            if clip is not None and clip.exists() and clip.stat().st_size > 10_000:
                _log(f"{tag}: {name} ✅ real video clip ({clip.stat().st_size // 1024}KB)")
                return clip
    except Exception as e:
        _log(f"{tag}: waterfall unavailable — {e}")

    _log(f"{tag}: no free video provider succeeded — falling back to images")
    return None
