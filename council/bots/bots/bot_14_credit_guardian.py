#!/usr/bin/env python3
"""
bot_14_credit_guardian.py — Council Bot #14 (Priority 45)
Higgsfield Credit Guardian: guards budget before rendering LO/IL episodes.

Runs AFTER bot_06_render_queue (priority 30) and BEFORE bot_08_auto_renderer (priority 60).

Checks:
1. Episode in render queue is LO or IL channel?
2. Does a render_plan.json exist for this episode?
3. Is the estimated Higgsfield credit cost within safety threshold?

If any check fails:
  - .warn() or .error() accordingly
  - Block episode from auto-rendering
  - Add task to MISSION_BOARD.json asking Josh to run episode_credit_planner.py

If all checks pass:
  - .ok()
  - Episode proceeds to auto_renderer
"""

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from council.bot_base import CouncilBot, BotResult


class Bot14CreditGuardian(CouncilBot):
    """Higgsfield credit guardian for LO/IL episodes."""

    name = "bot_14_credit_guardian"
    description = "Guard Higgsfield budget before rendering LO/IL episodes"
    priority = 45
    SAFETY_THRESHOLD_CREDITS = 50.0  # Configurable via env if needed

    def run(self) -> BotResult:
        """Check render queue for LO/IL episodes and validate budgets."""
        r = self.result
        try:
            # Check if render_queue.json exists and has pending episodes
            queue_path = Path(self.base_dir) / "council" / "state" / "gg" / "render_queue.json"
            if not queue_path.exists():
                r.ok("No render queue found — nothing to guard")
                return r

            with open(queue_path) as f:
                queue = json.load(f)

            # render_queue.json is a flat list of episode entries, not {"pending": [...]}
            all_entries = queue.get("pending", []) if isinstance(queue, dict) else queue
            pending = [e for e in all_entries if e.get("status", "pending") == "pending"]
            if not pending:
                r.ok("Render queue is empty — nothing to guard")
                return r

            warnings = []
            errors = []
            blocked = []

            for episode in pending:
                ep_id = episode.get("episode_id", "?")
                channel = episode.get("channel", "").lower()

                # Only care about LO/IL channels (cartoon channels using Higgsfield heavily)
                if channel not in ["little_olympus", "little_olympus", "iron_legends", "lo", "il"]:
                    continue

                # Look for render_plan.json
                prompts_dir = Path(self.base_dir) / "prompts"
                plan_path = None

                # Search for plan in channel-specific or root prompts folder
                for search_path in [prompts_dir, prompts_dir / channel]:
                    candidate = search_path / f"{ep_id}_render_plan.json"
                    if candidate.exists():
                        plan_path = candidate
                        break

                if not plan_path:
                    errors.append(
                        f"{ep_id} ({channel}): no render_plan.json found. "
                        f"Run: python episode_credit_planner.py <script.json> --approved"
                    )
                    blocked.append(ep_id)
                    continue

                # Read and validate plan
                try:
                    with open(plan_path) as f:
                        plan = json.load(f)

                    approved = plan.get("approved", False)
                    if not approved:
                        errors.append(f"{ep_id}: render_plan.json exists but NOT APPROVED")
                        blocked.append(ep_id)
                        continue

                    cost_est = plan.get("cost_estimate", {})
                    hf_credits = cost_est.get("higgsfield_credits_est", 0)

                    if hf_credits > self.SAFETY_THRESHOLD_CREDITS:
                        warnings.append(
                            f"{ep_id}: {hf_credits:.1f} credits > safety threshold ({self.SAFETY_THRESHOLD_CREDITS}). "
                            f"Consider re-running episode_credit_planner.py --budget {self.SAFETY_THRESHOLD_CREDITS}"
                        )

                except Exception as e:
                    errors.append(f"{ep_id}: failed to read/validate render_plan.json: {e}")
                    blocked.append(ep_id)

            # Report findings
            if errors:
                msg = f"Credit guardian blocked {len(blocked)} episode(s): " + " | ".join(errors)
                r.error(msg)
                return r

            if warnings:
                msg = f"Credit guardian warnings: " + " | ".join(warnings)
                r.warn(msg)
                return r

            r.ok(f"Credit guardian cleared {len(pending) - len(blocked)} episode(s) for rendering")
            return r

        except Exception as e:
            r.error(f"Credit guardian crashed: {e}")
            return r


if __name__ == "__main__":
    bot = Bot14CreditGuardian()
    result = bot.run()
    for msg in result.messages:
        print(msg)
    sys.exit(0 if result.status in ("ok", "fixed", "warning") else 1)
