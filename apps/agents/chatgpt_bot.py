#!/usr/bin/env python3
"""
chatgpt_bot.py

QA pass over the draft scene/shot list produced by gemini_bot.py.

Contract:
  stdin  -> JSON: the gemini_bot.py output (series_name, episode_number, topic,
            title, scenes, source)
  stdout -> JSON: same shape, plus:
      "qa_notes": [str, ...]
      "rendered": false
      "generation": {"gemini_source": str, "chatgpt_source": str}

If OPENAI_API_KEY is set, attempts a real QA pass via the OpenAI API
(checks pacing, duplicate beats, prompt clarity, and lightly polishes
descriptions/prompts). On any failure, passes the draft through unchanged
and notes that QA was skipped.
"""

import json
import os
import sys


def load_env_file():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def basic_qa_notes(draft):
    """Static checks that don't require any API call."""
    notes = []
    scenes = draft.get("scenes", [])

    if not scenes:
        notes.append("WARNING: no scenes were generated.")
        return notes

    total_duration = sum(s.get("duration_sec", 0) for s in scenes)
    notes.append(f"Scene count: {len(scenes)}; total runtime ~{total_duration}s.")

    titles = [s.get("title", "") for s in scenes]
    if len(titles) != len(set(titles)):
        notes.append("WARNING: duplicate scene titles detected.")

    for s in scenes:
        if not s.get("video_prompt"):
            notes.append(f"WARNING: scene {s.get('scene_number')} missing video_prompt.")
        if s.get("duration_sec", 0) <= 0:
            notes.append(f"WARNING: scene {s.get('scene_number')} has non-positive duration.")

    return notes


def call_openai_qa(draft):
    """Attempt a real OpenAI QA pass. Returns (scenes, notes) or raises on failure."""
    import urllib.request

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    prompt = (
        "You are a QA editor for a video pre-production pipeline. Review this draft "
        "scene list (JSON below) for pacing issues, duplicate beats, and unclear video "
        "prompts. Return ONLY a JSON object with two keys: "
        '"scenes" (the possibly lightly-edited scene list, same schema as input) and '
        '"qa_notes" (a list of short strings describing what you checked or changed).\n\n'
        f"{json.dumps(draft.get('scenes', []))}"
    )

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return parsed["scenes"], parsed["qa_notes"]


def main():
    load_env_file()
    raw = sys.stdin.read()
    draft = json.loads(raw) if raw.strip() else {}

    notes = basic_qa_notes(draft)
    scenes = draft.get("scenes", [])

    try:
        scenes, ai_notes = call_openai_qa(draft)
        notes = ai_notes + notes
        chatgpt_source = "openai-api"
    except Exception as exc:  # noqa: BLE001 - any failure -> pass-through
        notes.append(f"QA pass-through (no AI edits): {exc.__class__.__name__}: {exc}")
        chatgpt_source = f"pass-through ({exc.__class__.__name__}: {exc})"

    result = dict(draft)
    result["scenes"] = scenes
    result["qa_notes"] = notes
    result["rendered"] = False
    result["generation"] = {
        "gemini_source": draft.get("source", "unknown"),
        "chatgpt_source": chatgpt_source,
    }
    result.pop("source", None)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
