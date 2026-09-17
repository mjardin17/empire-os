"""
council/roles/role_base.py — shared base for the 10 specialized roles.

Extends the EXISTING council.bot_base.CouncilBot pattern (same BotResult,
same channel-scoped dirs, same save_state/load_state) and adds:
  - self.router     lazy AIRouter (for roles that generate/evaluate)
  - self.validator  lazy PipelineValidator
  - helpers to find the latest episode script / final render
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from council.bot_base import BotResult, CouncilBot  # noqa: E402,F401


class CouncilRole(CouncilBot):
    """Base for specialized roles — adds router + validator on top of CouncilBot."""

    def __init__(self, base_dir: Path = BASE_DIR, verbose: bool = True,
                 channel: str = "gg") -> None:
        super().__init__(base_dir=base_dir, verbose=verbose, channel=channel)
        self._router = None
        self._validator = None

    @property
    def router(self):
        """Lazy AIRouter — imported on first use so roles load key-free."""
        if self._router is None:
            from ai_router.router import AIRouter
            self._router = AIRouter()
        return self._router

    @property
    def validator(self):
        """Lazy PipelineValidator."""
        if self._validator is None:
            from pipeline_validator import PipelineValidator
            self._validator = PipelineValidator()
        return self._validator

    # ── shared lookups ────────────────────────────────────────────────────
    def latest_scripts(self, limit: int = 5) -> list[Path]:
        """Newest episode JSON scripts for this channel."""
        if not self.prompts_dir.exists():
            return []
        scripts = sorted(self.prompts_dir.glob("*.json"),
                         key=lambda p: p.stat().st_mtime, reverse=True)
        return scripts[:limit]

    def latest_finals(self, limit: int = 5) -> list[Path]:
        """Newest final MP4s for this channel."""
        if not self.renders_dir.exists():
            return []
        finals = sorted(self.renders_dir.rglob("*_final.mp4"),
                        key=lambda p: p.stat().st_mtime, reverse=True)
        return finals[:limit]

    def load_script_json(self, path: Path) -> dict | None:
        """Load an episode script JSON, None on failure."""
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
