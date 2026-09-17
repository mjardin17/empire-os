"""
social_setup/wizard.py — Empire OS Social Media Setup Wizard
Walks through creating every channel on every platform.
Generates the content, opens the signup page, saves the credentials.

Usage:
    python social_setup/wizard.py                   # full setup walkthrough
    python social_setup/wizard.py --status          # show what's done vs missing
    python social_setup/wizard.py --channel gg      # just Gods & Glory
    python social_setup/wizard.py --platform instagram  # just Instagram, all channels
    python social_setup/wizard.py --generate        # print all profile content to copy
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import subprocess
import sys
from pathlib import Path

# Load profile data
sys.path.insert(0, str(Path(__file__).parent.parent))
from social_setup.profiles import CHANNELS, PLATFORMS

SOCIAL_DIR   = Path(__file__).parent
ENV_FILE     = SOCIAL_DIR.parent / ".env"
STATUS_FILE  = SOCIAL_DIR / "SOCIAL_STATUS.json"


# ── Env / status helpers ──────────────────────────────────────────────────────

def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def save_env_key(key: str, value: str) -> None:
    env = load_env()
    env[key] = value
    lines = ["# Empire OS credentials", ""]
    for k, v in env.items():
        lines.append(f"{k}={v}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_status() -> dict:
    if STATUS_FILE.exists():
        return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    return {}


def save_status(status: dict) -> None:
    STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")


def mark_done(channel: str, platform: str, handle: str = "") -> None:
    status = load_status()
    if channel not in status:
        status[channel] = {}
    status[channel][platform] = {"done": True, "handle": handle}
    save_status(status)


def is_done(channel: str, platform: str) -> bool:
    status = load_status()
    return status.get(channel, {}).get(platform, {}).get("done", False)


def open_url(url: str) -> None:
    """Open URL in default browser."""
    try:
        subprocess.Popen(["cmd", "/c", "start", url], shell=False)
    except Exception:
        print(f"    Open manually: {url}")


# ── Display helpers ───────────────────────────────────────────────────────────

def divider(char: str = "─", width: int = 60) -> str:
    return char * width


def print_profile_card(ch_key: str, pl_key: str) -> None:
    """Print the ready-to-use profile content for one channel × platform."""
    ch = CHANNELS[ch_key]
    pl = PLATFORMS[pl_key]
    username = ch["username"]
    bio      = ch["bio"][pl["bio_key"]]

    # Trim bio to platform limit
    limit = pl["bio_length"]
    if len(bio) > limit:
        bio = bio[:limit-3] + "..."

    print(f"\n  {'='*56}")
    print(f"  {ch['name']} × {pl['name']}")
    print(f"  {'='*56}")
    print(f"  Handle  :  {pl['handle_fmt'].format(username=username)}")
    print(f"  Name    :  {ch['name']}")
    print(f"  Bio     :  {bio}")
    print(f"  Tags    :  {ch['hashtags'][:80]}...")
    print(f"  Emoji   :  {ch['emoji']}")
    print(f"  Note    :  {pl['notes']}")
    print(f"  {'='*56}")


# ── Status display ────────────────────────────────────────────────────────────

def print_status() -> None:
    status = load_status()
    print(f"\n{divider('=')}")
    print("  EMPIRE OS — Social Media Setup Status")
    print(divider('='))

    total = done = 0
    for ch_key, ch in CHANNELS.items():
        print(f"\n  {ch['emoji']}  {ch['name']} (@{ch['username']})")
        for pl_key, pl in PLATFORMS.items():
            total += 1
            completed = status.get(ch_key, {}).get(pl_key, {}).get("done", False)
            handle    = status.get(ch_key, {}).get(pl_key, {}).get("handle", "")
            if completed:
                done += 1
                tag = handle or "done"
                print(f"    [✓] {pl['name']:15s}  {tag}")
            else:
                print(f"    [ ] {pl['name']:15s}  — not set up")

    print(f"\n{divider()}")
    print(f"  Progress: {done}/{total} accounts set up")
    pct = int(done / total * 100) if total else 0
    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
    print(f"  [{bar}] {pct}%")
    print(divider() + "\n")


# ── Profile generator (print all content) ────────────────────────────────────

def print_all_profiles(channel_filter: str = "", platform_filter: str = "") -> None:
    print(f"\n{divider('=')}")
    print("  EMPIRE OS — All Channel Profiles (copy-paste ready)")
    print(divider('='))

    channels  = {k: v for k, v in CHANNELS.items()  if not channel_filter  or k == channel_filter}
    platforms = {k: v for k, v in PLATFORMS.items() if not platform_filter or k == platform_filter}

    for ch_key, ch in channels.items():
        print(f"\n\n{'▓'*60}")
        print(f"  {ch['emoji']}  {ch['name'].upper()}  ({ch['niche']})")
        print(f"{'▓'*60}")
        for pl_key in platforms:
            print_profile_card(ch_key, pl_key)


# ── Main wizard ───────────────────────────────────────────────────────────────

def run_wizard(channel_filter: str = "", platform_filter: str = "") -> None:
    channels  = {k: v for k, v in CHANNELS.items()  if not channel_filter  or k == channel_filter}
    platforms = {k: v for k, v in PLATFORMS.items() if not platform_filter or k == platform_filter}

    pending = [
        (ch_key, pl_key)
        for ch_key in channels
        for pl_key in platforms
        if not is_done(ch_key, pl_key)
    ]

    if not pending:
        print("\n  All selected accounts already done!")
        print_status()
        return

    print(f"\n{divider('=')}")
    print(f"  EMPIRE OS — SOCIAL MEDIA SETUP WIZARD")
    print(f"  {len(pending)} accounts to set up")
    print(f"  For each: I show you the content, open the page, you create it.")
    print(divider('='))
    print("\n  Press Enter to continue each step. Ctrl+C to pause anytime.\n")

    try:
        input("  Ready? Press Enter to start...")
    except KeyboardInterrupt:
        return

    for i, (ch_key, pl_key) in enumerate(pending, 1):
        ch = CHANNELS[ch_key]
        pl = PLATFORMS[pl_key]

        print(f"\n\n{'='*60}")
        print(f"  STEP {i}/{len(pending)}")
        print(f"  {ch['emoji']}  {ch['name']} on {pl['name']}")
        print(f"{'='*60}")

        # Show the profile content
        print_profile_card(ch_key, pl_key)

        print(f"\n  OPENING signup page in your browser...")
        open_url(pl["signup_url"])

        print(f"\n  USE THESE DETAILS:")
        print(f"    Username : {ch['username']}")
        print(f"    Name     : {ch['name']}")
        print(f"    Bio      : {ch['bio'][pl['bio_key']][:120]}...")
        print(f"    Hashtags : {ch['hashtags'][:80]}")
        print()

        try:
            input("  [Press Enter when account is created, or S to skip] > ")
        except KeyboardInterrupt:
            print("\n\n  Paused. Run again to continue where you left off.")
            return

        # Ask for the handle/username they created
        try:
            handle = input(f"  What handle/username did you use? (Enter to use @{ch['username']}) > ").strip()
        except KeyboardInterrupt:
            handle = ""

        if not handle:
            handle = f"@{ch['username']}"

        # Save credentials for this platform
        env_prefix = f"{ch_key.upper()}_{pl_key.upper()}"
        try:
            email = input(f"  Email used to sign up (Enter to skip): ").strip()
            if email:
                save_env_key(f"{env_prefix}_EMAIL", email)

            pw = getpass.getpass(f"  Password (hidden, Enter to skip): ").strip()
            if pw:
                save_env_key(f"{env_prefix}_PASSWORD", pw)
        except (KeyboardInterrupt, EOFError):
            pass

        mark_done(ch_key, pl_key, handle)
        print(f"\n  ✓ {ch['name']} on {pl['name']} — saved as {handle}")

    print(f"\n\n{'='*60}")
    print(f"  All done for this session!")
    print_status()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Empire OS Social Media Setup Wizard")
    p.add_argument("--status",   action="store_true", help="Show setup status")
    p.add_argument("--generate", action="store_true", help="Print all profile content")
    p.add_argument("--channel",  default="",          help="gg | il | lo | ed")
    p.add_argument("--platform", default="",          help="youtube | instagram | tiktok | facebook | x | pinterest | threads")
    args = p.parse_args()

    if args.status:
        print_status()
    elif args.generate:
        print_all_profiles(args.channel, args.platform)
    else:
        run_wizard(args.channel, args.platform)
