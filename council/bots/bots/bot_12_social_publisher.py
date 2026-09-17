"""
bot_12_social_publisher.py — Social Publisher Bot (self-healing layer 2)
========================================================================
Priority 65 — runs after quality checks and the frame inspector.

Watches the auto-publish system (social_clips/) and heals it:
  1. Finds finished clip sets in social_clips/{EP_ID}/ with NO publish record
     → queues/attempts a publish for them
  2. Reads social_clips/publish_log.json + MISSION_BOARD.json for FAILED
     platform posts → retries automatically (max 3 lifetime attempts per
     platform per episode, on top of auto_publisher's own in-run retries)
  3. Reports: "platform X failed Y times, last error: Z"

Never posts to YouTube itself (standing rule: Josh approves YouTube uploads).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

CLIPS_ROOT = BASE_DIR / "social_clips"
PUBLISH_LOG = CLIPS_ROOT / "publish_log.json"

MAX_HEAL_ATTEMPTS = 3          # lifetime auto-heal retries per platform/episode
RETRYABLE_STATUS = "failed"    # skipped (no token) and pending_approval are NOT retried

EXPECTED_CLIPS = ("_short.mp4", "_reel.mp4", "_tiktok.mp4",
                  "_facebook.mp4", "_pinterest.jpg")


def _load_publish_log() -> dict:
    if PUBLISH_LOG.exists():
        try:
            return json.loads(PUBLISH_LOG.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


class SocialPublisherBot(CouncilBot):
    name = "bot_social_publisher"
    description = "Monitors social_clips/, retries failed social posts, reports errors"
    priority = 65
    auto_fix = True

    def _episode_channel(self, ep_id: str) -> str:
        """Derive channel key from episode id prefix (GG_EP001 → gg)."""
        return ep_id.split("_", 1)[0].lower()

    def run(self) -> BotResult:
        r = self.result
        log = _load_publish_log()
        state = self.load_state()
        heal_counts: dict = state.get("heal_counts", {})

        if not CLIPS_ROOT.exists():
            r.ok("social_clips/ does not exist yet — nothing to monitor")
            return r

        # Lazy import so a broken publisher module can't kill the council run
        try:
            from social_clips.auto_publisher import publish_episode
        except Exception as e:
            r.error(f"auto_publisher import failed: {e}")
            return r

        # ── 1. Clip sets with no publish record ──────────────────────────────
        unpublished: list[str] = []
        for ep_dir in sorted(p for p in CLIPS_ROOT.iterdir() if p.is_dir()):
            ep_id = ep_dir.name.upper()
            if not ep_id.startswith(self.ep_prefix):
                continue  # other channel's episodes — their council run handles them
            clips = [ep_dir / f"{ep_id}{suffix}" for suffix in EXPECTED_CLIPS]
            have = [c for c in clips if c.exists() and c.stat().st_size > 10_000]
            if not have:
                continue
            if ep_id not in log:
                unpublished.append(ep_id)
                r.warn(f"{ep_id}: {len(have)} clip(s) exist but NO publish record")

        # ── 2. Failed platform posts → retry (bounded) ───────────────────────
        to_heal: list[str] = []
        for ep_id, record in sorted(log.items()):
            if not ep_id.startswith(self.ep_prefix):
                continue
            platforms = record.get("platforms", {})
            failed = {p: res for p, res in platforms.items()
                      if res.get("status") == RETRYABLE_STATUS}
            if not failed:
                continue
            for platform, res in failed.items():
                attempts = res.get("total_attempts", res.get("attempts", 0))
                r.warn(f"{ep_id}: platform {platform} failed "
                       f"{attempts} time(s), last error: "
                       f"{res.get('detail', 'unknown')[:100]}")
            key = ep_id
            healed = heal_counts.get(key, 0)
            if healed >= MAX_HEAL_ATTEMPTS:
                r.error(f"{ep_id}: gave up after {healed} council heal attempts "
                        f"— needs Josh (check tokens in .env)")
                continue
            to_heal.append(ep_id)

        # ── 3. Heal: re-run publish for unpublished + failed episodes ────────
        if self.auto_fix:
            for ep_id in unpublished + to_heal:
                channel = self._episode_channel(ep_id)
                self.log(f"re-publishing {ep_id} ({channel})...")
                try:
                    # Short retry delay — the council loop itself is the
                    # long-interval retry mechanism.
                    results = publish_episode(ep_id, channel, retry_delay=5)
                except Exception as e:
                    r.error(f"{ep_id}: publish_episode crashed: {e}")
                    continue
                if ep_id in to_heal:
                    heal_counts[ep_id] = heal_counts.get(ep_id, 0) + 1
                still_failed = [p for p, res in results.items()
                                if res.get("status") == "failed"]
                if still_failed:
                    r.warn(f"{ep_id}: still failing after heal: "
                           f"{', '.join(still_failed)}")
                else:
                    r.fixed(f"{ep_id}: publish healed — no failed platforms remain")

        if not unpublished and not to_heal:
            r.ok("All social clip sets have publish records; no failed posts")

        self.save_state({
            "heal_counts": heal_counts,
            "unpublished_found": unpublished,
            "healed_this_run": to_heal,
        })
        return r
