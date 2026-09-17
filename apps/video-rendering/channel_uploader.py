"""
channel_uploader.py — Empire OS Multi-Channel YouTube Uploader
==============================================================
Each channel uses its own token file so uploads NEVER go to the wrong account.

CHANNELS:
  gg  → godsandgloryai@gmail.com   → token_gg.pickle
  il  → @IronLegendsai account     → token_il.pickle
  lo  → Little Olympus account     → token_lo.pickle
  ed  → Empire Decoded account     → token_ed.pickle

USAGE:
  # Upload GG EP006-011 to Gods & Glory
  python channel_uploader.py --channel gg --episodes GG_EP006,GG_EP007

  # Non-interactive batch upload (no confirmation prompt)
  python channel_uploader.py --channel gg --episodes GG_EP006,GG_EP007 --yes

  # Upload IL EP001 to Iron Legends
  python channel_uploader.py --channel il --episodes IL_EP001

  # Verify which account is active for a channel
  python channel_uploader.py --channel gg --verify

  # Re-auth a channel (deletes old token, forces login)
  python channel_uploader.py --channel gg --reauth
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE_DIR     = Path(__file__).resolve().parent
RENDERS_DIR  = BASE_DIR / "renders"
PROMPTS_DIR  = BASE_DIR / "prompts"
CREDS_PATH   = BASE_DIR / "credentials.json"
UPLOADED_LOG = BASE_DIR / "uploaded_videos.json"
SCOPES       = ["https://www.googleapis.com/auth/youtube"]

# ── Channel Definitions ───────────────────────────────────────────────────────

CHANNELS: dict[str, dict] = {
    "gg": {
        "name":         "Gods and glory ai",
        "token":        BASE_DIR / "token_gg.pickle",
        "sign_in_as":   "godsandgloryai@gmail.com",
        "renders_subdir": None,          # root renders/
        "category_id":  "27",            # Education
        "default_tags": ["history", "documentary", "battle", "Gods and Glory"],
        "default_desc": (
            "Full historical documentary from the Gods & Glory series.\n\n"
            "#GodsAndGlory #History #Documentary #Battle #AncientHistory"
        ),
    },
    "il": {
        "name":         "Iron Legends",
        "token":        BASE_DIR / "token_il.pickle",
        "sign_in_as":   "@IronLegendsai — use your Iron Legends Google account",
        "renders_subdir": "iron_legends",
        "category_id":  "1",             # Film & Animation
        "default_tags": ["anime", "mech", "iron legends", "80s anime", "robots"],
        "default_desc": (
            "A new episode from Iron Legends — the 80s mech anime series.\n\n"
            "#IronLegends #Anime #Mecha #80sAnime"
        ),
    },
    "lo": {
        "name":         "Little Olympus",
        "token":        BASE_DIR / "token_lo.pickle",
        "sign_in_as":   "Little Olympus Google account",
        "renders_subdir": "little_olympus",
        "category_id":  "1",             # Film & Animation
        "default_tags": ["little olympus", "kids animation", "greek gods", "cartoon"],
        "default_desc": (
            "A new episode from Little Olympus — adventures with Little Zeus.\n\n"
            "#LittleOlympus #Animation #Kids"
        ),
    },
    "ed": {
        "name":         "Empire Decoded",
        "token":        BASE_DIR / "token_ed.pickle",
        "sign_in_as":   "Empire Decoded Google account",
        "renders_subdir": "empire_decoded",
        "category_id":  "28",            # Science & Technology
        "default_tags": ["AI", "tech", "empire decoded", "artificial intelligence"],
        "default_desc": (
            "Decoding AI and technology from Empire Decoded.\n\n"
            "#EmpireDecoded #AI #Tech #ArtificialIntelligence"
        ),
    },
}

# Episode ID → render filename mapping
EP_FILE_MAP: dict[str, str] = {
    # GG
    **{f"GG_EP{str(i).zfill(3)}": f"GG_EP{str(i).zfill(3)}_final.mp4" for i in range(1, 30)},
    # IL
    **{f"IL_EP{str(i).zfill(3)}": f"IL_EP{str(i).zfill(3)}_final.mp4" for i in range(1, 20)},
    # LO
    **{f"LO_EP{str(i).zfill(3)}": f"LO_EP{str(i).zfill(3)}_final.mp4" for i in range(1, 20)},
    # ED
    **{f"ED_EP{str(i).zfill(3)}": f"ED_EP{str(i).zfill(3)}_final.mp4" for i in range(1, 20)},
}

# ── Auth ──────────────────────────────────────────────────────────────────────

def _open_chrome(url: str, incognito: bool = False) -> None:
    print("\n" + "="*60)
    print("  COPY THIS URL — open it in Edge (NOT Chrome)")
    print("  Sign in as: godsandgloryai@gmail.com")
    print("="*60)
    print(f"\n  {url}\n")
    print("="*60)
    print("  After signing in, come back here and wait for 'Token saved'")
    print("="*60 + "\n")


def get_service(channel_key: str, force_reauth: bool = False):
    """Return an authenticated YouTube service for the given channel."""
    ch = CHANNELS[channel_key]
    token_path: Path = ch["token"]
    creds = None

    if not force_reauth and token_path.exists():
        print(f"Loading saved token: {token_path.name}")
        with open(token_path, "rb") as f:
            creds = pickle.load(f)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing token...")
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                raise FileNotFoundError(
                    f"Missing credentials.json at {CREDS_PATH}\n"
                    "Download from Google Cloud Console → APIs & Services → Credentials"
                )
            print(f"\n{'='*60}")
            print(f"  SIGN IN AS: {ch['sign_in_as']}")
            print(f"  Channel:    {ch['name']}")
            print(f"{'='*60}\n")

            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            _orig = webbrowser.open
            webbrowser.open = lambda url, **_: _open_chrome(url, incognito=True) or True  # type: ignore[assignment]
            login_email = ch.get("sign_in_as", "")
            creds = flow.run_local_server(
                port=8080,
                open_browser=True,
                prompt="select_account",
                login_hint=login_email if "@gmail.com" in login_email else "",
            )
            webbrowser.open = _orig

        with open(token_path, "wb") as f:
            pickle.dump(creds, f)
        print(f"Token saved -> {token_path.name}\n")

    return build("youtube", "v3", credentials=creds)


def verify_channel(channel_key: str) -> None:
    """Print which YouTube account the token is authenticated to."""
    youtube = get_service(channel_key)
    resp = youtube.channels().list(part="snippet", mine=True).execute()
    items = resp.get("items", [])
    if items:
        ch_name = items[0]["snippet"]["title"]
        ch_id   = items[0]["id"]
        print(f"\n[OK] VERIFIED: token_{channel_key}.pickle -> '{ch_name}' (ID: {ch_id})")
        print(f"   Expected: {CHANNELS[channel_key]['name']}")
        if CHANNELS[channel_key]["name"].lower().replace(" ", "") not in ch_name.lower().replace(" ", ""):
            print(f"\n[WARN] Name mismatch! Run --reauth to fix.")
    else:
        print(f"[WARN] Could not verify -- no channels returned for token_{channel_key}.pickle")


# ── Upload ────────────────────────────────────────────────────────────────────

def find_render(ep_id: str, channel_key: str) -> Path:
    """Locate the render file for an episode."""
    ch = CHANNELS[channel_key]
    subdir = ch.get("renders_subdir")
    filename = EP_FILE_MAP.get(ep_id.upper(), f"{ep_id.lower()}_final.mp4")

    candidates = []
    if subdir:
        candidates.append(RENDERS_DIR / subdir / filename)
    candidates.append(RENDERS_DIR / filename)

    for path in candidates:
        if path.exists():
            return path

    raise FileNotFoundError(
        f"Cannot find render for {ep_id}.\nChecked:\n"
        + "\n".join(f"  {p}" for p in candidates)
    )


def load_script_meta(ep_id: str) -> dict:
    """Load title/description from the episode JSON script if available."""
    for p in PROMPTS_DIR.rglob(f"*{ep_id.lower()}*.json"):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            return {
                "title":       data.get("youtube_title") or data.get("title", ""),
                "description": data.get("description", ""),
                "tags":        data.get("tags", []),
            }
        except Exception:
            pass
    return {}


def upload_file(
    youtube,
    channel_key: str,
    path: Path,
    title: str,
    description: str = "",
    tags: list[str] | None = None,
    privacy: str = "public",
    log_key: str | None = None,
) -> str:
    """
    Upload an arbitrary local video file (not looked up by episode ID).
    Used for YouTube Shorts clips, which live in social_clips/ output, not
    renders/ — upload_episode()'s find_render() has no way to reach those.
    Returns the YouTube video ID.
    """
    ch = CHANNELS[channel_key]
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb < 0.05:
        raise ValueError(f"{path.name}: {size_mb:.2f}MB — too small, likely broken")

    title = title or f"{ch['name']} Short"
    desc = description or ch["default_desc"]
    all_tags = list(set((tags or []) + ch["default_tags"]))

    print(f"\n[{path.stem}] {title}")
    print(f"  File:    {path.name} ({size_mb:.1f}MB)")
    print(f"  Channel: {ch['name']}")
    print(f"  Privacy: {privacy}")

    body = {
        "snippet": {
            "title": title[:100],
            "description": desc,
            "tags": all_tags[:30],
            "categoryId": ch["category_id"],
        },
        "status": {
            "privacyStatus": privacy,
            "madeForKids": False,
        },
    }
    media = MediaFileUpload(str(path), resumable=True, chunksize=5 * 1024 * 1024)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Progress: {int(status.progress() * 100)}%", end="\r")

    video_id = response["id"]
    print(f"\n  [OK] https://youtu.be/{video_id}")
    _log_upload(log_key or path.stem, video_id, ch["name"])
    return video_id


def upload_episode(
    youtube,
    channel_key: str,
    ep_id: str,
    privacy: str = "public",
) -> str:
    """Upload a single episode. Returns the YouTube video ID."""
    ch      = CHANNELS[channel_key]
    ep_id   = ep_id.upper()
    path    = find_render(ep_id, channel_key)
    size_mb = path.stat().st_size / (1024 * 1024)

    if size_mb < 1:
        raise ValueError(f"{ep_id}: render is {size_mb:.1f}MB — too small, likely broken")

    meta = load_script_meta(ep_id)
    title = meta.get("title") or f"{ep_id} | {ch['name']}"
    desc  = meta.get("description") or ch["default_desc"]
    tags  = list(set(meta.get("tags", []) + ch["default_tags"]))

    # ── Enforce episode number prefix ─────────────────────────────────────────
    # Extract number from ep_id e.g. GG_EP006 → 6 → "EP006"
    import re as _re
    ep_match = _re.search(r"EP(\d+)", ep_id, _re.IGNORECASE)
    if ep_match:
        ep_num = f"EP{int(ep_match.group(1)):03d}"   # EP006, EP012, EP025 etc.
        # Strip any existing malformed ep prefix (EP1, EP2, EP12, etc.) from title
        title = _re.sub(r"\|\s*Gods\s*&\s*Glory\s*EP\d+\s*$", "", title, flags=_re.IGNORECASE).strip()
        title = _re.sub(r"\bEP\d+\b\s*\|?\s*", "", title, flags=_re.IGNORECASE).strip()
        # Prepend clean numbered prefix
        title = f"{ep_num} | {title}"

    print(f"\n[{ep_id}] {title}")
    print(f"  File:    {path.name} ({size_mb:.0f}MB)")
    print(f"  Channel: {ch['name']}")
    print(f"  Privacy: {privacy}")

    body = {
        "snippet": {
            "title":       title[:100],
            "description": desc,
            "tags":        tags[:30],
            "categoryId":  ch["category_id"],
        },
        "status": {
            "privacyStatus": privacy,
            "madeForKids":   False,
        },
    }
    media = MediaFileUpload(str(path), resumable=True, chunksize=5 * 1024 * 1024)
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Progress: {int(status.progress() * 100)}%", end="\r")

    video_id = response["id"]
    print(f"\n  [OK] https://youtu.be/{video_id}")
    _log_upload(ep_id, video_id, ch["name"])
    return video_id


def _log_upload(key: str, video_id: str, channel_name: str) -> None:
    """Append/update one entry in uploaded_videos.json."""
    data: dict = {}
    if UPLOADED_LOG.exists():
        try:
            data = json.loads(UPLOADED_LOG.read_text(encoding="utf-8"))
        except Exception:
            pass
    data[key] = {"video_id": video_id, "channel": channel_name, "url": f"https://youtu.be/{video_id}"}
    UPLOADED_LOG.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Empire OS Multi-Channel YouTube Uploader")
    ap.add_argument("--channel",  required=True, choices=list(CHANNELS), help="gg | il | lo | ed")
    ap.add_argument("--episodes", default="", help="Comma-separated episode IDs e.g. GG_EP006,GG_EP007")
    ap.add_argument("--file", default="", help="Upload this exact video file instead of an episode by ID (e.g. a Shorts clip)")
    ap.add_argument("--title", default="", help="Title for --file uploads (ignored for --episodes, which reads the script)")
    ap.add_argument("--description", default="", help="Description for --file uploads")
    ap.add_argument("--tags", default="", help="Comma-separated tags for --file uploads")
    ap.add_argument("--privacy",  default="public", choices=["public", "unlisted", "private"])
    ap.add_argument("--verify",   action="store_true", help="Verify which account this token belongs to")
    ap.add_argument("--reauth",   action="store_true", help="Delete token and re-authenticate")
    ap.add_argument("--yes", "-y", action="store_true", help="Skip the interactive confirmation prompt")
    args = ap.parse_args()

    ch = CHANNELS[args.channel]

    if args.reauth:
        token_path: Path = ch["token"]
        if token_path.exists():
            token_path.unlink()
            print(f"Deleted {token_path.name}")
        print(f"Re-authenticating {ch['name']}...")
        get_service(args.channel, force_reauth=True)
        verify_channel(args.channel)
        return

    if args.verify:
        verify_channel(args.channel)
        return

    if not args.episodes and not args.file:
        ap.error("--episodes or --file required (or use --verify / --reauth)")

    youtube = get_service(args.channel)

    # Always verify before uploading
    print("Verifying channel identity before upload...")
    verify_channel(args.channel)
    if args.yes:
        print("\n--yes supplied: skipping confirmation.")
    else:
        print("\nProceed with upload? Press Enter to continue or Ctrl+C to abort.")
        input()

    if args.file:
        tags = [t.strip() for t in args.tags.split(",") if t.strip()]
        try:
            upload_file(youtube, args.channel, Path(args.file), args.title,
                       args.description, tags, args.privacy)
        except (FileNotFoundError, ValueError) as e:
            print(f"  [FAILED] {args.file}: {e}")
            sys.exit(1)
        return

    episodes = [e.strip().upper() for e in args.episodes.split(",") if e.strip()]
    print(f"\nEmpire OS Uploader - {ch['name']}")
    print(f"Episodes: {', '.join(episodes)}\n")

    succeeded: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for i, ep_id in enumerate(episodes):
        try:
            upload_episode(youtube, args.channel, ep_id, args.privacy)
            succeeded.append(ep_id)
            if i < len(episodes) - 1:
                time.sleep(5)
        except (FileNotFoundError, ValueError) as e:
            print(f"  [SKIP] {ep_id}: {e}")
            skipped.append(ep_id)
        except Exception as e:
            print(f"  [FAIL] {ep_id}: {e}")
            failed.append(ep_id)
            # YouTube daily upload cap: every remaining episode will hit the
            # same wall, so stop early instead of spamming identical failures.
            if "uploadLimitExceeded" in str(e):
                remaining = episodes[i + 1:]
                if remaining:
                    print(f"  [ABORT] Upload limit reached — not attempting: {', '.join(remaining)}")
                    skipped.extend(remaining)
                break

    print("\n[SUMMARY]")
    print(f"  Uploaded: {', '.join(succeeded) or '(none)'}")
    print(f"  Skipped:  {', '.join(skipped) or '(none)'}")
    print(f"  Failed:   {', '.join(failed) or '(none)'}")
    print("  Check uploaded_videos.json for IDs.")

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
