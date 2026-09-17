"""
bot_13_tool_scout.py — Free Tool Scout Bot (discovery brain runner)
===================================================================
Priority 70 — runs last, after all render/QC/publish bots.

Runs free_tool_scout.py at most ONCE PER DAY (checks last_checked in
free_tools_discovered.json and skips if < 24h old) and then:

  1. Adds any "new + working" tools to MISSION_BOARD.json as a review
     mission for Josh (never wires anything in automatically).
  2. Refreshes CLAUDE.md's auto-managed "Free Tools" section (between
     FREE_TOOLS_AUTO markers) when confirmed-working tools change.

Never posts, never renders, never spends — discovery + reporting only.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

RESULTS_FILE = BASE_DIR / "free_tools_discovered.json"
MISSION_BOARD = BASE_DIR / "MISSION_BOARD.json"
CLAUDE_MD = BASE_DIR / "CLAUDE.md"
MARK_START = "<!-- FREE_TOOLS_AUTO_START -->"
MARK_END = "<!-- FREE_TOOLS_AUTO_END -->"


class ToolScoutBot(CouncilBot):
    name = "bot_tool_scout"
    description = "Daily free-tool discovery scan; queues new tools for Josh's review"
    priority = 70
    auto_fix = True

    # ── Helpers ────────────────────────────────────────────────────────────
    @staticmethod
    def _results_age_ok(results: dict) -> bool:
        """True if the last scan is under 24h old (skip re-scan)."""
        last = results.get("last_checked", "")
        if not last:
            return False
        try:
            return (date.today() - date.fromisoformat(last)).days < 1
        except ValueError:
            return False

    def _add_review_mission(self, new_tools: list[dict]) -> bool:
        """Append one review mission for Josh to MISSION_BOARD.json."""
        try:
            board = json.loads(MISSION_BOARD.read_text(encoding="utf-8")) \
                if MISSION_BOARD.exists() else {"missions": []}
        except Exception as e:
            self.result.error(f"MISSION_BOARD.json unreadable: {e}")
            return False
        missions = board.setdefault("missions", [])
        names = sorted(t["name"] for t in new_tools)
        target = ",".join(names)
        # Don't duplicate an open review mission for the same tools.
        for m in missions:
            if m.get("type") == "review_free_tools" and m.get("status") == "pending" \
                    and m.get("target") == target:
                return False
        nums = [int(str(m.get("id", "m0"))[1:]) for m in missions
                if str(m.get("id", "")).startswith("m")
                and str(m.get("id", ""))[1:].isdigit()]
        missions.append({
            "id": f"m{(max(nums) + 1) if nums else 1:03d}",
            "type": "review_free_tools",
            "status": "pending",
            "assigned_to": "josh",
            "channel": "all",
            "target": target,
            "priority": 9,
            "notes": ("free_tool_scout found new WORKING zero-signup tools: "
                      + "; ".join(f"{t['name']} ({t['type']}, {t['tested_ms']}ms, "
                                  f"{t['url']})" for t in new_tools)
                      + ". Review and approve wiring into providers/."),
            "result": "",
            "error": "",
        })
        board["updated_at"] = datetime.now().astimezone().isoformat()
        MISSION_BOARD.write_text(json.dumps(board, indent=2), encoding="utf-8")
        return True

    def _update_claude_md(self, working: list[dict], last_checked: str) -> bool:
        """Rewrite the auto-managed Free Tools section between the markers."""
        if not CLAUDE_MD.exists():
            return False
        lines = [f"| {t['name']} | {t['type']} | {t['tested_ms']}ms | {t['source']} |"
                 for t in sorted(working, key=lambda t: (t["type"], t["tested_ms"]))]
        block = "\n".join([
            MARK_START,
            "## Free Tools (auto-discovered — managed by bot_13_tool_scout)",
            f"Zero-signup tools confirmed WORKING on {last_checked} by free_tool_scout.py:",
            "",
            "| Tool | Type | Latency | Source |",
            "|------|------|---------|--------|",
            *lines,
            MARK_END,
        ])
        text = CLAUDE_MD.read_text(encoding="utf-8")
        if MARK_START in text and MARK_END in text:
            head, rest = text.split(MARK_START, 1)
            _, tail = rest.split(MARK_END, 1)
            new_text = head + block + tail
        else:
            new_text = text.rstrip() + "\n\n" + block + "\n"
        if new_text == text:
            return False
        CLAUDE_MD.write_text(new_text, encoding="utf-8")
        return True

    # ── Main ───────────────────────────────────────────────────────────────
    def run(self) -> BotResult:
        r = self.result
        try:
            import free_tool_scout
        except Exception as e:
            r.error(f"free_tool_scout import failed: {e}")
            return r

        results = free_tool_scout.load_results()
        if self._results_age_ok(results):
            r.ok(f"scan is fresh (last_checked {results['last_checked']}) — "
                 f"skipping (runs once per day)")
        else:
            self.log("running daily free-tool discovery scan...")
            try:
                results = free_tool_scout.run_scan()
                r.ok(f"scan complete: {len(results['working'])} working, "
                     f"{len(results['broken'])} broken")
            except Exception as e:
                r.error(f"discovery scan crashed: {e}")
                return r

        working = results.get("working", [])
        broken = results.get("broken", [])
        new_names = set(results.get("new_since_last_check", []))
        state = self.load_state()
        reported: set = set(state.get("reported_new_tools", []))
        unreported = [t for t in working
                      if t["name"] in new_names and t["name"] not in reported]

        for t in broken:
            if t.get("source") == "empire-known":
                r.warn(f"wired tool DOWN: {t['name']} ({t['url']})")

        if unreported and self.auto_fix:
            if self._add_review_mission(unreported):
                r.fixed(f"queued review mission for {len(unreported)} new tool(s): "
                        + ", ".join(t["name"] for t in unreported))
            reported |= {t["name"] for t in unreported}
        elif not unreported:
            r.ok("no new working tools to report")

        if working and self.auto_fix:
            try:
                if self._update_claude_md(working, results.get("last_checked", "?")):
                    r.ok("CLAUDE.md Free Tools section refreshed")
            except Exception as e:
                r.warn(f"CLAUDE.md update failed: {e}")

        self.save_state({
            "reported_new_tools": sorted(reported),
            "last_scan_seen": results.get("last_checked", ""),
            "working_count": len(working),
            "broken_count": len(broken),
        })
        return r
