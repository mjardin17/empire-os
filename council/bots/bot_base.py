"""
bot_base.py — Viral Engine Council
Base class for all council bots. Every bot inherits from CouncilBot.

To create a new bot:
  1. Create council/bots/bot_yourname.py
  2. class YourBot(CouncilBot): ...
  3. It auto-registers on next council run — no config needed.

Channel support:
  Pass channel="gg"|"il"|"lo"|"ed" to CouncilBot.__init__() (or council.py --channel flag).
  Each channel gets its own output/, renders/, prompts/, and council/state/{channel}/ dirs.
"""

from __future__ import annotations
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).parent.parent
STATE_DIR = BASE_DIR / "council" / "state"
STATE_DIR.mkdir(parents=True, exist_ok=True)

# ── Per-channel configuration ─────────────────────────────────────────────────
CHANNEL_CONFIGS: dict[str, dict] = {
    "gg": {
        "output_dir":    BASE_DIR / "output",
        "renders_dir":   BASE_DIR / "renders",
        "prompts_dir":   BASE_DIR / "prompts" / "gods_glory",
        "token_file":    BASE_DIR / "token_gg.pickle",
        "channel_name":  "Gods & Glory",
        "tts_rate":      "-35%",
        "ep_prefix":     "GG_EP",
        "min_final_sec": 2700,   # 45 min
    },
    "il": {
        "output_dir":    BASE_DIR / "output_il",
        "renders_dir":   BASE_DIR / "renders_il",
        "prompts_dir":   BASE_DIR / "prompts" / "iron_legends",
        "token_file":    BASE_DIR / "token_il.pickle",
        "channel_name":  "Iron Legends",
        "tts_rate":      "+8%",
        "ep_prefix":     "IL_EP",
        "min_final_sec": 1200,   # 20 min (shorter anime-style)
    },
    "lo": {
        "output_dir":    BASE_DIR / "output_lo",
        "renders_dir":   BASE_DIR / "renders_lo",
        "prompts_dir":   BASE_DIR / "prompts" / "little_olympus",
        "token_file":    BASE_DIR / "token_lo.pickle",
        "channel_name":  "Little Olympus",
        "tts_rate":      "-10%",
        "ep_prefix":     "LO_EP",
        "min_final_sec": 1200,   # 20 min
    },
    "ed": {
        "output_dir":    BASE_DIR / "output_ed",
        "renders_dir":   BASE_DIR / "renders_ed",
        "prompts_dir":   BASE_DIR / "prompts" / "empire_decoded",
        "token_file":    BASE_DIR / "token_ed.pickle",
        "channel_name":  "Empire Decoded",
        "tts_rate":      "+5%",
        "ep_prefix":     "ED_EP",
        "min_final_sec": 1800,   # 30 min
    },
}

ALL_CHANNELS = list(CHANNEL_CONFIGS.keys())

# Narration pace used to estimate duration for new-format scripts (words/sec).
# Kokoro narrates at roughly 150 wpm → 2.5 words per second.
NARRATION_WORDS_PER_SEC = 2.5


def estimate_scenes_duration(scenes: list[dict]) -> int:
    """Total duration (seconds) for a script's scenes.

    Legacy scripts carry an explicit per-scene ``duration_sec``. New-format
    scripts (empire_render.py, 2026-07: GG_EP002+ punchy 10-min episodes)
    omit it — duration is implied by narration length. When no explicit
    durations exist, estimate from narration word count at Kokoro pace.
    """
    explicit = sum(s.get("duration_sec", 0) for s in scenes)
    if explicit > 0:
        return explicit
    words = sum(len(str(s.get("narration", "")).split()) for s in scenes)
    return int(words / NARRATION_WORDS_PER_SEC)


@dataclass
class BotResult:
    bot_name: str
    ran_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "ok"          # ok | warning | error | fixed
    issues_found: int = 0
    issues_fixed: int = 0
    messages: list[str] = field(default_factory=list)
    next_action: Optional[str] = None   # hint for what should run next

    def ok(self, msg: str):
        self.messages.append(f"✓ {msg}")

    def warn(self, msg: str):
        self.messages.append(f"⚠ {msg}")
        self.issues_found += 1
        if self.status == "ok":
            self.status = "warning"

    def error(self, msg: str):
        self.messages.append(f"✗ {msg}")
        self.issues_found += 1
        self.status = "error"

    def fixed(self, msg: str):
        self.messages.append(f"→ {msg}")
        self.issues_fixed += 1
        self.status = "fixed"

    def to_dict(self) -> dict:
        return {
            "bot_name": self.bot_name,
            "ran_at": self.ran_at,
            "status": self.status,
            "issues_found": self.issues_found,
            "issues_fixed": self.issues_fixed,
            "messages": self.messages,
            "next_action": self.next_action,
        }


class CouncilBot(ABC):
    """Base class for all council bots.

    Channel-aware: pass channel="gg"|"il"|"lo"|"ed" to scope all paths
    to the correct directories for that channel.
    """

    # Override in subclass
    name: str = "unnamed_bot"
    description: str = ""
    priority: int = 50       # lower = runs first (0-100)
    auto_fix: bool = True    # if False, only reports — never mutates

    def __init__(self, base_dir: Path = BASE_DIR, verbose: bool = True,
                 channel: str = "gg"):
        self.base_dir = base_dir
        self.verbose = verbose
        self.channel = channel

        cfg = CHANNEL_CONFIGS.get(channel, CHANNEL_CONFIGS["gg"])
        self.output_dir:    Path = cfg["output_dir"]
        self.renders_dir:   Path = cfg["renders_dir"]
        self.prompts_dir:   Path = cfg["prompts_dir"]
        self.token_file:    Path = cfg["token_file"]
        self.channel_name:  str  = cfg["channel_name"]
        self.tts_rate:      str  = cfg["tts_rate"]
        self.ep_prefix:     str  = cfg["ep_prefix"]
        self.min_final_sec: int  = cfg["min_final_sec"]

        # Channel-scoped state dir: council/state/{channel}/
        self.state_dir: Path = STATE_DIR / channel
        self.state_dir.mkdir(parents=True, exist_ok=True)

        self.result = BotResult(bot_name=self.name)

    @abstractmethod
    def run(self) -> BotResult:
        """Execute bot logic. Must return a BotResult."""
        ...

    def save_state(self, data: dict):
        """Persist bot-specific state to council/state/{channel}/{name}.json"""
        path = self.state_dir / f"{self.name}.json"
        existing = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text())
            except Exception:
                pass
        existing.update(data)
        existing["last_updated"] = datetime.now().isoformat()
        path.write_text(json.dumps(existing, indent=2))

    def load_state(self) -> dict:
        """Load bot-specific state from council/state/{channel}/{name}.json"""
        path = self.state_dir / f"{self.name}.json"
        if path.exists():
            try:
                return json.loads(path.read_text())
            except Exception:
                pass
        return {}

    def log(self, msg: str):
        if self.verbose:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"  [{ts}] [{self.channel.upper()}] [{self.name}] {msg}")
