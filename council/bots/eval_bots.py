"""
eval_bots.py — Council Bot Dry-Run Eval Harness

Imports every bot in council/bots/, instantiates it, and calls run() in a
sandboxed dry-run mode:
  - output_dir / renders_dir / state_dir redirected to an empty temp sandbox
  - module-level BASE_DIR / STATE_DIR patched to the sandbox (so registry,
    queue, and backlog writes never touch production files)
  - prompts_dir left pointing at the REAL prompts dir (read-only usage)
  - subprocess.run stubbed to a no-op success (no ffmpeg/ffprobe spawns)
  - urllib.request.urlopen stubbed to raise (no network fetches)

A bot PASSES if run() returns a BotResult without raising.
Exit code 0 = all pass, 1 = at least one failure.

Usage:
    python council/eval_bots.py
"""

from __future__ import annotations

import importlib
import subprocess
import sys
import tempfile
import traceback
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from council.bot_base import BotResult, CouncilBot  # noqa: E402

BOTS_DIR = REPO_ROOT / "council" / "bots"


def _stub_subprocess_run(*args, **kwargs):
    """No-op replacement for subprocess.run — pretends success, empty output."""
    text = kwargs.get("text") or kwargs.get("universal_newlines")
    empty = "" if text else b""
    cmd = args[0] if args else kwargs.get("args", [])
    return subprocess.CompletedProcess(cmd, 0, stdout=empty, stderr=empty)


def _stub_urlopen(*args, **kwargs):
    raise OSError("network disabled during eval dry-run")


def eval_bot(module_name: str, sandbox: Path) -> tuple[str, str, str]:
    """Returns (bot_module, PASS|FAIL, detail)."""
    real_run = subprocess.run
    real_urlopen = urllib.request.urlopen
    try:
        mod = importlib.import_module(f"council.bots.{module_name}")

        # Patch module-level path constants so any direct writes hit the sandbox.
        for attr in ("BASE_DIR", "STATE_DIR"):
            if hasattr(mod, attr):
                setattr(mod, attr, sandbox)

        bot_cls = next(
            obj for obj in vars(mod).values()
            if isinstance(obj, type) and issubclass(obj, CouncilBot)
            and obj is not CouncilBot
        )

        subprocess.run = _stub_subprocess_run
        urllib.request.urlopen = _stub_urlopen

        bot = bot_cls(verbose=False, channel="gg")
        bot.output_dir = sandbox / "output"
        bot.renders_dir = sandbox / "renders"
        bot.state_dir = sandbox / "state"
        for d in (bot.output_dir, bot.renders_dir, bot.state_dir):
            d.mkdir(parents=True, exist_ok=True)

        result = bot.run()
        if not isinstance(result, BotResult):
            return module_name, "FAIL", f"run() returned {type(result).__name__}, not BotResult"
        return module_name, "PASS", f"status={result.status} msgs={len(result.messages)}"
    except Exception as e:
        return module_name, "FAIL", f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    finally:
        subprocess.run = real_run
        urllib.request.urlopen = real_urlopen


def main() -> int:
    modules = sorted(p.stem for p in BOTS_DIR.glob("bot_*.py"))
    failures = 0
    with tempfile.TemporaryDirectory(prefix="council_eval_") as tmp:
        sandbox = Path(tmp)
        for name in modules:
            mod_name, verdict, detail = eval_bot(name, sandbox)
            print(f"{verdict:4} {mod_name}: {detail.splitlines()[0]}")
            if verdict == "FAIL":
                failures += 1
                for line in detail.splitlines()[1:]:
                    print(f"     {line}")
    print(f"\n{len(modules) - failures}/{len(modules)} bots passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
