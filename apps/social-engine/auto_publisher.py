#!/usr/bin/env python3
"""
auto_publisher.py — Empire OS Auto-Publish Pipeline
===================================================
Triggered after a YouTube upload completes. Flow:

  1. Generate all social clips (clip_generator.generate_all)
  2. Post to ALL platforms simultaneously (ThreadPoolExecutor)
  3. Write results to MISSION_BOARD.json + social_clips/publish_log.json
  4. Self-healing: failed platforms retry 3x with a 60s delay
     (bot_12_social_publisher retries again on later council runs)

Platform credentials (add to .env — see each publisher's TODO):
  IG_ACCESS_TOKEN          Instagram Graph API
  TIKTOK_ACCESS_TOKEN      TikTok Content Posting API
  FB_ACCESS_TOKEN          Facebook Graph API (page token)
  PINTEREST_ACCESS_TOKEN   Pinterest API v5
  PINTEREST_BOARD_ID       Pinterest board to pin to

Missing token → "[auto_publisher] {platform}: skipped — add {TOKEN} to .env"
and the run continues. Never crashes.

YouTube Shorts follow the standing rule (Josh approves YouTube uploads
manually): the Short is queued as a ready-to-run .bat, never auto-posted.

Usage:
  python social_clips/auto_publisher.py --episode GG_EP002 --channel gg
  python social_clips/auto_publisher.py --episode GG_EP002 --channel gg --youtube-url https://youtu.be/XXXX
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

# ── Console safety (Windows cp1252) ───────────────────────────────────────────
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

BASE_DIR: Path = Path(__file__).resolve().parent.parent   # video-bot-pipeline/
CLIPS_DIR: Path = Path(__file__).resolve().parent          # social_clips/
sys.path.insert(0, str(BASE_DIR))

from social_clips.clip_generator import (episode_meta, find_final_mp4,  # noqa: E402
                                         gemini_text, generate_all, load_env)

TAG = "[auto_publisher]"

MISSION_BOARD = BASE_DIR / "MISSION_BOARD.json"
PUBLISH_LOG = CLIPS_DIR / "publish_log.json"
LATEST_EPISODES = BASE_DIR / "latest_episodes.json"
UPLOADED_LOG = BASE_DIR / "uploaded_videos.json"
PYTHON = r"C:\Users\jjard\AppData\Local\Programs\Python\Python314\python.exe"

MAX_RETRIES = 3
RETRY_DELAY_SEC = 60

# ── Channel handles (source of truth: CLAUDE.md) ──────────────────────────────
HANDLES: dict[str, dict[str, str]] = {
    "gg": {"youtube": "@godsandgloryai", "tiktok": "@godsgloryai",
           "instagram": "@godsandgloryai", "facebook": "@godsandgloryai",
           "tag": "godsandglory"},
    "lo": {"youtube": "@littleolympusai", "tiktok": "@little.olympusai",
           "instagram": "@littleolympusai", "facebook": "@littleolympusai",
           "tag": "littleolympus"},
    "il": {"youtube": "@ironlegendsai", "tag": "ironlegends"},
    "ed": {"tag": "empiredecoded"},
}


# ── JSON helpers ──────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"{TAG} could not parse {path.name}: {e}", file=sys.stderr)
    return default


def _save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Caption generation ────────────────────────────────────────────────────────
def build_caption(episode_id: str, channel: str, youtube_url: str) -> str:
    """
    Gemini caption: "[Hook]. [1-sentence description]. Watch the full episode:
    {url} #history #documentary #{channel_tag}". Static fallback, never raises.
    """
    title = episode_meta(episode_id)["title"]
    tag = HANDLES.get(channel, {}).get("tag", channel)
    body = gemini_text(
        f"Video title: '{title}'. Write exactly two sentences for a social media "
        "caption: first a shocking hook sentence, then a 1-sentence episode "
        "description. No hashtags, no links. Reply with only the two sentences."
    )
    if not body:
        body = f"{title}. The full story, told the way it deserves."
    body = " ".join(body.split())
    link = f" Watch the full episode: {youtube_url}" if youtube_url else ""
    return f"{body}{link} #history #documentary #{tag}"


# ── Platform publishers ───────────────────────────────────────────────────────
def _token(name: str) -> str:
    load_env()
    return os.environ.get(name, "").strip()


def _skip(platform: str, token_name: str) -> dict:
    msg = f"skipped — add {token_name} to .env"
    print(f"{TAG} {platform}: {msg}")
    return {"status": "skipped", "detail": msg}


def _bat_safe(text: str) -> str:
    """
    Strip characters unsafe to embed in a Windows .bat double-quoted
    argument. Applied to any AI-generated text (title/description/caption)
    before it's written into a staged .bat — a stray '"' would close the
    quote early and let trailing text be parsed as new shell content.
    """
    for ch in '"%^&|<>':
        text = text.replace(ch, "")
    return text


def publish_youtube_short(clip_path: Path, title: str, description: str,
                          channel: str = "gg", episode_id: str = "") -> dict:
    """
    YouTube Shorts — STANDING RULE: YouTube uploads require Josh's manual
    approval. We stage a ready-to-run .bat instead of auto-posting.

    Uses channel_uploader.py's --file mode (added 2026-08-20) so this
    uploads the actual vertical clip, not the full episode — the previous
    version called --episodes {episode_id}, which resolves through
    find_render()/EP_FILE_MAP to the full-length renders/ file, so every
    "Short" ever staged this way would have silently uploaded the entire
    episode instead. Never triggered because Josh never ran a staged .bat
    yet — caught before the first real run, not after.
    """
    if not clip_path or not Path(clip_path).exists():
        return {"status": "failed", "detail": "clip missing"}
    clip_path = Path(clip_path).resolve()
    safe_title = _bat_safe(title)[:90] + " #Shorts" if title else "#Shorts"
    safe_desc = _bat_safe(description)
    bat = BASE_DIR / f"UPLOAD_SHORT_{episode_id or clip_path.stem}.bat"
    bat.write_text(
        "@echo off\r\n"
        f"cd /d {BASE_DIR}\r\n"
        f"echo Uploading YouTube Short: {clip_path}\r\n"
        f"\"{PYTHON}\" channel_uploader.py --channel {channel} "
        f"--file \"{clip_path}\" --title \"{safe_title}\" "
        f"--description \"{safe_desc}\" --yes\r\n"
        "pause\r\n",
        encoding="utf-8",
    )
    print(f"{TAG} youtube_short: staged for Josh approval — run {bat.name}")
    return {"status": "pending_approval", "detail": f"run {bat.name} to post"}


def publish_instagram(clip_path: Path, caption: str) -> dict:
    """
    Instagram Reel — IMPLEMENTED 2026-08-12. See lib/instagram_publisher.py.

    Uses the resumable binary upload path, so the clip is sent straight from
    local disk — no public URL / ngrok / CDN needed (the old docstring's claim
    that a public URL is mandatory was wrong; Meta supports both).

    Requires IG_ACCESS_TOKEN and IG_USER_ID in .env, and the target account must
    be a Business or Creator account. Personal accounts cannot publish via API.

    ⚠ This posts publicly and immediately. Instagram has no unpublish API.
    """
    token = _token("IG_ACCESS_TOKEN")
    if not token:
        return _skip("instagram", "IG_ACCESS_TOKEN")
    if not _token("IG_USER_ID"):
        return _skip("instagram", "IG_USER_ID")
    if not clip_path or not Path(clip_path).exists():
        return {"status": "failed", "detail": "clip missing"}

    from lib.instagram_publisher import InstagramError, publish_reel

    try:
        result = publish_reel(Path(clip_path), caption,
                              log=lambda m: print(f"{TAG} {m}"))
    except InstagramError as e:
        # `permanent` suppresses the retry loop: a wrong account type or a
        # missing permission will not resolve itself 60 seconds later.
        return {"status": "failed", "detail": str(e), "permanent": e.permanent}

    print(f"{TAG} instagram: posted {result.media_id}")
    return {"status": "posted",
            "detail": f"media {result.media_id} "
                      f"(quota {result.quota_used}/{result.quota_total})",
            "media_id": result.media_id}


def publish_tiktok(clip_path: Path, caption: str) -> dict:
    """
    TikTok Direct Post — IMPLEMENTED 2026-08-20. See lib/tiktok_publisher.py.

    Requires TIKTOK_ACCESS_TOKEN (video.publish scope) in .env.

    ⚠ Defaults to SELF_ONLY (private) — an unaudited TikTok app can only post
    privately; PUBLIC_TO_EVERYONE requires TikTok App Review first, and will
    be rejected by TikTok itself otherwise. This is not a limitation of this
    code, it's TikTok's own policy for unaudited apps.
    """
    token = _token("TIKTOK_ACCESS_TOKEN")
    if not token:
        return _skip("tiktok", "TIKTOK_ACCESS_TOKEN")
    if not clip_path or not Path(clip_path).exists():
        return {"status": "failed", "detail": "clip missing"}

    from lib.tiktok_publisher import TikTokError, publish_video

    try:
        result = publish_video(Path(clip_path), caption,
                               log=lambda m: print(f"{TAG} {m}"))
    except TikTokError as e:
        return {"status": "failed", "detail": str(e), "permanent": e.permanent}

    print(f"{TAG} tiktok: accepted {result.publish_id}")
    return {"status": "posted",
            "detail": f"publish_id {result.publish_id} — TikTok processes "
                      f"asynchronously; no status-poll endpoint exists to "
                      f"confirm final live state",
            "publish_id": result.publish_id}


def publish_facebook(clip_path: Path, caption: str) -> dict:
    """
    Facebook Page video — IMPLEMENTED 2026-08-20. See lib/facebook_publisher.py.

    Requires FB_ACCESS_TOKEN (page access token), FB_PAGE_ID, and FB_APP_ID
    in .env. The token must be a PAGE token with CREATE_CONTENT permission,
    not a plain user token.

    ⚠ This posts publicly and immediately — the Graph API has no dry-run
    mode for this endpoint.
    """
    token = _token("FB_ACCESS_TOKEN")
    if not token:
        return _skip("facebook", "FB_ACCESS_TOKEN")
    if not clip_path or not Path(clip_path).exists():
        return {"status": "failed", "detail": "clip missing"}

    from lib.facebook_publisher import FacebookError, publish_page_video

    try:
        result = publish_page_video(Path(clip_path), caption, caption,
                                    log=lambda m: print(f"{TAG} {m}"))
    except FacebookError as e:
        return {"status": "failed", "detail": str(e), "permanent": e.permanent}

    print(f"{TAG} facebook: posted {result.video_id}")
    return {"status": "posted",
            "detail": f"video {result.video_id}",
            "video_id": result.video_id}


def publish_pinterest(image_path: Path, title: str, description: str,
                      board_id: str = "") -> dict:
    """
    Pinterest image pin — IMPLEMENTED 2026-08-20. See lib/pinterest_publisher.py.

    Requires PINTEREST_ACCESS_TOKEN + PINTEREST_BOARD_ID in .env. Embeds the
    thumbnail JPG as base64 in a single request — Pinterest's image pins
    don't need the separate upload/poll cycle that video pins require.

    ⚠ This posts publicly and immediately — Pinterest has no dry-run mode.
    """
    token = _token("PINTEREST_ACCESS_TOKEN")
    if not token:
        return _skip("pinterest", "PINTEREST_ACCESS_TOKEN")
    board_id = board_id or _token("PINTEREST_BOARD_ID")
    if not board_id:
        return _skip("pinterest", "PINTEREST_BOARD_ID")
    if not image_path or not Path(image_path).exists():
        return {"status": "failed", "detail": "pin image missing"}

    from lib.pinterest_publisher import PinterestError, publish_pin

    try:
        result = publish_pin(Path(image_path), title, description,
                             board_id=board_id or None,
                             log=lambda m: print(f"{TAG} {m}"))
    except PinterestError as e:
        return {"status": "failed", "detail": str(e), "permanent": e.permanent}

    print(f"{TAG} pinterest: posted {result.pin_id}")
    return {"status": "posted",
            "detail": f"pin {result.pin_id}",
            "pin_id": result.pin_id}


# ── Retry wrapper (self-healing layer 1) ──────────────────────────────────────
def _publish_with_retry(platform: str, fn, *args,
                        retries: int = MAX_RETRIES,
                        delay: int = RETRY_DELAY_SEC, **kwargs) -> dict:
    """Run a publisher; retry real failures up to `retries` times, `delay`s apart."""
    last: dict = {"status": "failed", "detail": "not attempted"}
    for attempt in range(1, retries + 1):
        try:
            last = fn(*args, **kwargs)
        except Exception as e:  # publishers must never kill the run
            last = {"status": "failed", "detail": f"crashed: {e}"}
        if last.get("status") in ("posted", "skipped", "pending_approval"):
            return last | {"attempts": attempt}
        if last.get("permanent"):
            # Wrong account type, missing permission, bad codec — retrying in
            # 60s cannot fix any of these. Fail fast and say why.
            print(f"{TAG} {platform}: permanent failure, not retrying — "
                  f"{last.get('detail', '?')}")
            return last | {"attempts": attempt}
        print(f"{TAG} {platform}: attempt {attempt}/{retries} failed — "
              f"{last.get('detail', '?')}")
        if attempt < retries:
            time.sleep(delay)
    return last | {"attempts": retries}


# ── Board / log / website writers ─────────────────────────────────────────────
def _record_mission(episode_id: str, channel: str, youtube_url: str,
                    results: dict[str, dict]) -> None:
    board = _load_json(MISSION_BOARD, {"updated_at": _now(), "missions": []})
    missions = board.setdefault("missions", [])
    mission_id = f"social_{episode_id.lower()}"
    failed = [p for p, r in results.items() if r.get("status") == "failed"]
    entry = {
        "id": mission_id,
        "type": "social_publish",
        "status": "failed" if failed else "done",
        "assigned_to": "auto_publisher",
        "channel": channel,
        "target": episode_id,
        "youtube_url": youtube_url,
        "platforms": results,
        "notes": (f"failed platforms: {', '.join(failed)}" if failed
                  else "all platforms posted/staged/skipped-no-token"),
        "updated_at": _now(),
    }
    for i, m in enumerate(missions):
        if m.get("id") == mission_id:
            missions[i] = entry
            break
    else:
        missions.append(entry)
    board["updated_at"] = _now()
    _save_json(MISSION_BOARD, board)


def _record_publish_log(episode_id: str, channel: str, youtube_url: str,
                        clips: dict, results: dict[str, dict]) -> None:
    log = _load_json(PUBLISH_LOG, {})
    prev = log.get(episode_id, {}).get("platforms", {})
    merged: dict[str, dict] = {}
    for platform, result in results.items():
        prev_attempts = prev.get(platform, {}).get("total_attempts", 0)
        merged[platform] = result | {
            "total_attempts": prev_attempts + result.get("attempts", 0)
        }
    log[episode_id] = {
        "channel": channel,
        "youtube_url": youtube_url,
        "clips": {k: str(v) for k, v in clips.items() if v},
        "platforms": merged,
        "updated_at": _now(),
    }
    _save_json(PUBLISH_LOG, log)


def update_latest_episodes(episode_id: str, channel: str, *, title: str = "",
                           youtube_url: str = "", status: str = "") -> None:
    """Update latest_episodes.json (the website feed) for one episode."""
    data = _load_json(LATEST_EPISODES, {"updated_at": _now(), "episodes": []})
    episodes = data.setdefault("episodes", [])
    for ep in episodes:
        if ep.get("episode_id") == episode_id:
            entry = ep
            break
    else:
        entry = {"episode_id": episode_id, "title": "", "channel": channel.upper(),
                 "youtube_url": "", "thumbnail_url": "", "status": "rendered",
                 "rendered_at": _now()}
        episodes.append(entry)
    if title:
        entry["title"] = title
    if youtube_url:
        entry["youtube_url"] = youtube_url
        video_id = youtube_url.rstrip("/").rsplit("/", 1)[-1]
        entry["thumbnail_url"] = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    if status:
        entry["status"] = status
    data["updated_at"] = _now()
    _save_json(LATEST_EPISODES, data)


def _lookup_youtube_url(episode_id: str) -> str:
    data = _load_json(UPLOADED_LOG, {})
    return data.get(episode_id, {}).get("url", "")


# ── Main entry point ──────────────────────────────────────────────────────────
def publish_episode(episode_id: str, channel: str, youtube_url: str = "",
                    retry_delay: int = RETRY_DELAY_SEC) -> dict[str, dict]:
    """
    Full auto-publish for one episode:
    clips → all platforms simultaneously → MISSION_BOARD + publish_log +
    latest_episodes.json. Returns per-platform result dicts. Never raises.
    """
    episode_id = episode_id.upper()
    channel = channel.lower()
    youtube_url = youtube_url or _lookup_youtube_url(episode_id)
    title = episode_meta(episode_id)["title"]

    print(f"{TAG} === Auto-publish {episode_id} ({channel}) ===")
    if youtube_url:
        print(f"{TAG} YouTube URL: {youtube_url}")
    else:
        print(f"{TAG} No YouTube URL yet — captions will omit the episode link")

    # 1. Generate clips
    mp4 = find_final_mp4(episode_id)
    if not mp4:
        print(f"{TAG} No final MP4 for {episode_id} — aborting", file=sys.stderr)
        return {}
    clips = generate_all(mp4, episode_id)
    caption = build_caption(episode_id, channel, youtube_url)
    print(f"{TAG} Caption: {caption[:120]}...")

    # 2. All platforms simultaneously
    tasks = {
        "youtube_short": (publish_youtube_short, (clips.get("youtube_short"),
                          title, caption), {"channel": channel,
                          "episode_id": episode_id}),
        "instagram": (publish_instagram, (clips.get("instagram"), caption), {}),
        "tiktok": (publish_tiktok, (clips.get("tiktok"), caption), {}),
        "facebook": (publish_facebook, (clips.get("facebook"), caption), {}),
        "pinterest": (publish_pinterest, (clips.get("pinterest"), title,
                      caption), {}),
    }
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        futures = {
            pool.submit(_publish_with_retry, platform, fn, *args,
                        delay=retry_delay, **kwargs): platform
            for platform, (fn, args, kwargs) in tasks.items()
        }
        for future in as_completed(futures):
            platform = futures[future]
            try:
                results[platform] = future.result()
            except Exception as e:  # belt and braces — never crash
                results[platform] = {"status": "failed", "detail": str(e)}
            print(f"{TAG} {platform}: {results[platform].get('status')} "
                  f"({results[platform].get('detail', '')[:80]})")

    # 3. Record everything
    _record_mission(episode_id, channel, youtube_url, results)
    _record_publish_log(episode_id, channel, youtube_url, clips, results)
    update_latest_episodes(episode_id, channel, title=title,
                           youtube_url=youtube_url,
                           status="live" if youtube_url else "rendered")

    posted = sum(1 for r in results.values()
                 if r.get("status") in ("posted", "pending_approval"))
    print(f"{TAG} === Done: {posted} posted/staged, "
          f"{sum(1 for r in results.values() if r.get('status') == 'skipped')} "
          f"skipped (no token), "
          f"{sum(1 for r in results.values() if r.get('status') == 'failed')} "
          f"failed ===")
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description="Empire OS auto social publisher")
    ap.add_argument("--episode", required=True, help="Episode ID e.g. GG_EP002")
    ap.add_argument("--channel", required=True, choices=list(HANDLES),
                    help="gg | lo | il | ed")
    ap.add_argument("--youtube-url", default="",
                    help="Episode YouTube URL (auto-read from uploaded_videos.json)")
    ap.add_argument("--retry-delay", type=int, default=RETRY_DELAY_SEC,
                    help="Seconds between platform retries")
    args = ap.parse_args()
    results = publish_episode(args.episode, args.channel, args.youtube_url,
                              retry_delay=args.retry_delay)
    sys.exit(0 if results else 1)


if __name__ == "__main__":
    main()
