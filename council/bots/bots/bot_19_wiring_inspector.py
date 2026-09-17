"""
bot_19_wiring_inspector.py — Pipeline Wiring Inspector
======================================================
Priority 8 — runs before the render bots, because a wiring break upstream makes
every downstream render finding meaningless.

WHY THIS EXISTS
---------------
On 2026-08-12 an audit found that commercial rendering had NEVER worked:

  * video_pipeline_agent.py:82 builds `empire_render.py --script <path>`, but
    --channel and --episode are required=True → argparse exits 2 instantly
  * four commercial missions sat pending in MISSION_BOARD.json
  * four .temp_commercial_*.json files sat in the repo root — written one line
    BEFORE the failing command — with zero MP4s anywhere
  * lib/crosspost_bridge.py wrote crosspost_queue.json that nothing ever read

Fourteen council bots were running. None noticed, because all fourteen inspect
RENDER OUTPUT. Nothing inspected whether the pipeline was CONNECTED.

Every one of those breaks is detectable in under a second, needs no credentials,
and produces a hard yes/no. That is what this bot does.

DESIGN NOTE: auto_fix is False on purpose. A wiring break means two components
disagree about a contract; guessing which side is wrong risks "healing" the
correct one. This bot reports precisely and lets a human decide.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import BASE_DIR, BotResult, CouncilBot

PYTHON = r"C:\Users\jjard\AppData\Local\Programs\Python\Python314\python.exe"

#: A mission pending longer than this is rotting, not queued.
MISSION_ROT_HOURS = 6

#: Scripts whose CLI contract is checked against the callers that build commands
#: for them. Add any script that agents invoke by constructing a command string.
CHECKED_SCRIPTS = ["empire_render.py", "channel_uploader.py"]

#: (producer file, artifact it writes, consumer that must read it).
#: A producer with no consumer is a silent dead end — the bug class that made
#: queued commercials vanish.
QUEUE_CONTRACTS = [
    ("lib/crosspost_bridge.py", "crosspost_queue.json", "lib/crosspost_bridge.py"),
]


def _required_flags(script: Path) -> set[str] | None:
    """
    Extract required flags from a script's argparse usage line.

    argparse prints optional args in [brackets] and required ones bare, so the
    usage line is a reliable contract without importing the script (importing
    would execute module-level side effects).

    Returns None if the script cannot be introspected.
    """
    try:
        proc = subprocess.run([PYTHON, str(script), "--help"],
                              capture_output=True, text=True, timeout=60,
                              cwd=str(BASE_DIR))
    except Exception:
        return None

    text = proc.stdout or proc.stderr
    match = re.search(r"usage:.*?(?=\n\n|\npositional|\noptions|\Z)", text, re.S)
    if not match:
        return None

    usage = match.group(0)
    # Strip bracketed (optional) groups, then whatever --flags remain are required.
    return set(re.findall(r"--([a-zA-Z0-9][\w-]*)", re.sub(r"\[[^\]]*\]", "", usage)))


def _callers_of(script_name: str) -> list[tuple[Path, int, str, set[str]]]:
    """
    Find every place a command string for `script_name` is constructed.

    Returns (file, line_no, snippet, flags_passed).
    """
    #: Require one of these on the line too, so a docstring/comment merely
    #: MENTIONING a command (e.g. explaining a fix: "was `foo.py --bar {x}`")
    #: doesn't get flagged as if it were live code building that command.
    #: Found live 2026-08-12: this check initially flagged its own bugfix
    #: comment and render_commercial.py's explanatory docstring as CLI
    #: violations, because both quote the OLD broken invocation as prose.
    #: A regex-based check can't fully parse Python; this is the cheap
    #: guard that gets it right in practice without a real AST pass.
    _CODE_MARKERS = re.compile(r"\bcmd\b|\bsubprocess\b|\bPopen\b|os\.system|\.run\(")

    found: list[tuple[Path, int, str, set[str]]] = []
    for py in BASE_DIR.rglob("*.py"):
        parts = set(py.parts)
        if parts & {"node_modules", ".git", "__pycache__", "council"}:
            continue
        try:
            lines = py.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue
        for n, line in enumerate(lines, 1):
            if script_name not in line:
                continue
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            # Only command construction, not imports or prose.
            if not re.search(rf"{re.escape(script_name)}\s+-", line):
                continue
            if not _CODE_MARKERS.search(line):
                continue
            flags = set(re.findall(r"--([a-zA-Z0-9][\w-]*)", line))
            if flags:
                found.append((py, n, line.strip()[:110], flags))
    return found


class WiringInspectorBot(CouncilBot):
    name = "bot_19_wiring_inspector"
    description = "Verifies the pipeline is actually CONNECTED: CLI contracts, mission rot, orphaned artifacts, dead queues"
    priority = 8          # before the render bots — wiring is upstream of output
    auto_fix = False      # reports only; see DESIGN NOTE above

    def run(self) -> BotResult:
        r = self.result
        report: dict = {}

        self._check_cli_contracts(r, report)
        self._check_mission_rot(r, report)
        self._check_orphaned_artifacts(r, report)
        self._check_queue_contracts(r, report)

        self.save_state(report)
        if r.issues_found == 0:
            r.ok("wiring intact: CLI contracts, missions, artifacts, queues all consistent")
        return r

    # ── 1. CLI contracts ──────────────────────────────────────────────────────
    def _check_cli_contracts(self, r: BotResult, report: dict) -> None:
        """
        Does every constructed command actually satisfy its target's required args?

        This is the check that would have caught the commercial-render bug the
        moment it was written, instead of days later by hand.
        """
        broken: list[dict] = []

        for script_name in CHECKED_SCRIPTS:
            script = BASE_DIR / script_name
            if not script.exists():
                continue

            required = _required_flags(script)
            if required is None:
                r.warn(f"{script_name}: could not introspect CLI — cannot verify callers")
                continue

            for caller, line_no, snippet, passed in _callers_of(script_name):
                missing = required - passed
                if not missing:
                    continue
                rel = caller.relative_to(BASE_DIR)
                flags = ", ".join(f"--{m}" for m in sorted(missing))
                r.error(f"{rel}:{line_no} calls {script_name} without {flags} "
                        f"— argparse will exit 2 and NOTHING will render. "
                        f"| {snippet}")
                broken.append({"caller": str(rel), "line": line_no,
                               "script": script_name,
                               "missing": sorted(missing), "snippet": snippet})

        report["broken_cli_contracts"] = broken

    # ── 2. Mission rot ────────────────────────────────────────────────────────
    def _check_mission_rot(self, r: BotResult, report: dict) -> None:
        """
        MISSION_BOARD.json is an action queue, not a backlog (standing rule).
        A mission pending for hours means whatever should consume it is broken.
        """
        board_path = BASE_DIR / "MISSION_BOARD.json"
        if not board_path.exists():
            report["rotting_missions"] = []
            return

        try:
            board = json.loads(board_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            r.error(f"MISSION_BOARD.json is corrupt ({e}) — no mission can be dispatched")
            report["rotting_missions"] = []
            return

        now = time.time()
        rotting: list[dict] = []

        for mission in board.get("missions", []):
            if mission.get("status") not in (None, "pending", "queued", "in_progress"):
                continue

            created = mission.get("created_at") or mission.get("created")
            age_h = None
            if isinstance(created, (int, float)):
                age_h = (now - float(created)) / 3600
            elif isinstance(created, str):
                try:
                    from datetime import datetime
                    age_h = (now - datetime.fromisoformat(
                        created.replace("Z", "+00:00")).timestamp()) / 3600
                except Exception:
                    pass

            if age_h is not None and age_h < MISSION_ROT_HOURS:
                continue

            mid = mission.get("id", "?")
            age_txt = f"{age_h:.0f}h" if age_h is not None else "unknown age"
            r.warn(f"mission '{mid}' ({mission.get('type', '?')}) still "
                   f"{mission.get('status', 'pending')} after {age_txt} — "
                   f"its consumer is not running or is failing silently")
            rotting.append({"id": mid, "type": mission.get("type"),
                            "status": mission.get("status"), "age_hours": age_h})

        report["rotting_missions"] = rotting

    # ── 3. Orphaned artifacts ─────────────────────────────────────────────────
    def _check_orphaned_artifacts(self, r: BotResult, report: dict) -> None:
        """
        A .temp_commercial_*.json with no matching MP4 is the fingerprint of a
        render that was prepared and then died. These accumulate silently.
        """
        orphans: list[str] = []

        for temp in BASE_DIR.glob(".temp_commercial_*.json"):
            mission_id = temp.stem.replace(".temp_commercial_", "")
            candidates = [
                BASE_DIR / "output" / f"{mission_id}.mp4",
                BASE_DIR / "renders" / f"{mission_id}.mp4",
                BASE_DIR / f".temp_commercial_{mission_id}.mp4",
            ]
            if any(c.exists() for c in candidates):
                continue
            orphans.append(temp.name)

        if orphans:
            r.error(f"{len(orphans)} commercial render(s) prepared but produced NO "
                    f"MP4 — the render step is failing silently: "
                    f"{', '.join(sorted(orphans)[:4])}"
                    + (" …" if len(orphans) > 4 else ""))
        report["orphaned_commercial_scripts"] = orphans

    # ── 4. Queue producer/consumer contracts ──────────────────────────────────
    def _check_queue_contracts(self, r: BotResult, report: dict) -> None:
        """
        A queue written by nobody's reader is a silent dead end. Also surfaces
        crosspost items quarantined mid-publish, which need a human decision.
        """
        dead: list[str] = []

        for producer, artifact, consumer in QUEUE_CONTRACTS:
            consumer_path = BASE_DIR / consumer
            if not consumer_path.exists():
                r.error(f"{artifact}: consumer {consumer} does not exist — "
                        f"anything {producer} queues is silently discarded")
                dead.append(artifact)
                continue
            body = consumer_path.read_text(encoding="utf-8", errors="replace")
            if artifact not in body:
                r.error(f"{artifact}: {consumer} never references it — "
                        f"anything {producer} queues is silently discarded")
                dead.append(artifact)

        report["dead_queues"] = dead

        # Quarantined publishes: we could not observe whether these went live.
        queue_file = BASE_DIR / "crosspost_queue.json"
        quarantined: list[str] = []
        if queue_file.exists():
            try:
                queue = json.loads(queue_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                r.error("crosspost_queue.json is corrupt — cannot tell what has "
                        "already been posted; do NOT re-run the processor")
                queue = {}
            for item in queue.get("items", []):
                for platform, res in (item.get("results") or {}).items():
                    if res.get("status") == "posting":
                        quarantined.append(f"{item.get('id')}→{platform}")

        if quarantined:
            r.warn(f"{len(quarantined)} publish(es) quarantined mid-post — a run "
                   f"died and we cannot tell if these went live. Check the "
                   f"account, then edit results[platform].status: "
                   f"{', '.join(quarantined[:4])}")
        report["quarantined_publishes"] = quarantined
