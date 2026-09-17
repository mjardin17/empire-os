#!/usr/bin/env python3
"""
gemini_bot.py

Generates a draft scene/shot list for the next LEGEND EMPIRE episode.

Contract:
  stdin  -> JSON: {"series_name": str, "episode_number": int, "topic": str}
  stdout -> JSON: {
      "series_name": str,
      "episode_number": int,
      "topic": str,
      "title": str,
      "scenes": [
          {
              "scene_number": int,
              "title": str,
              "description": str,
              "narration": str,
              "video_prompt": str,
              "duration_sec": int
          },
          ...
      ],
      "source": "gemini-api" | "template-fallback"
  }

If GEMINI_API_KEY is set in the environment (or .env), attempts a real call
to the Gemini API to draft the scene list. On any failure (missing key,
network error, bad response), falls back to a deterministic template so the
pipeline always produces usable output.
"""

import json
import os
import sys


def load_env_file():
    """Lightweight .env loader (no external deps)."""
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


def template_scenes(topic, series_name):
    """Deterministic placeholder scene list, used when no API key is available."""
    beats = [
        ("Cold Open", "A hook narration line poses the central question of '{topic}', "
                       "over a sweeping cinematic aerial of the historical setting at dawn."),
        ("Setting the Stage", "Establish the empires, leaders, and forces involved in "
                               "'{topic}' — emphasize the antagonist force as overwhelming: "
                               "vast numbers, elite reputation, top-tier equipment and "
                               "leadership, an undefeated record. Context the audience "
                               "needs before the story begins."),
        ("Rising Tension", "The lead-up to the central conflict: decisions, marches, "
                            "or maneuvers that bring both sides to the brink, underscoring "
                            "how impossible the odds appear."),
        ("The Clash", "The centerpiece battle or confrontation of '{topic}' — the "
                       "episode's main action sequence, against-impossible-odds framing."),
        ("Turning Point", "The decisive moment or twist that determines the outcome."),
        ("Legacy", "Aftermath and historical legacy — how '{topic}' changed what came "
                    "next, with a hook into the next episode of Empire Decoded."),
    ]
    scenes = []
    for i, (title, desc_template) in enumerate(beats, start=1):
        description = desc_template.format(topic=topic)
        scenes.append({
            "scene_number": i,
            "title": title,
            "description": description,
            "narration": f"(Narration placeholder for '{title}' in the story of {topic}.)",
            "video_prompt": (
                f"Cinematic historical documentary style, {series_name}. "
                f"{description} Photoreal detail, dramatic lighting, accurate period "
                f"costumes and architecture, film-grade composition, 16:9."
            ),
            "duration_sec": 8,
        })
    return scenes


def call_gemini(series_name, episode_number, topic):
    """Attempt a real Gemini API call. Returns scenes list or raises on failure."""
    import urllib.request

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-1.5-flash:generateContent?key={api_key}"
    )

    prompt = (
        f"You are a creative producer for the history documentary YouTube series "
        f"'{series_name}'. Write a 6-scene shot list for episode {episode_number}, "
        f"covering the topic '{topic}'. Match the tone of prior episodes: serious, "
        f"cinematic narration (e.g. the Thermopylae episode used a 'Hades' voice with "
        f"lines like 'Three hundred men. One narrow pass...'). "
        f"CREATIVE BRIEF — VILLAIN STRENGTH: always portray the opposing empire/antagonist "
        f"force as EXTREMELY STRONG — overwhelming numbers, elite reputation, top-tier "
        f"equipment and leadership, undefeated reputation. The protagonists' achievement "
        f"must feel against-impossible-odds, never easy (Thermopylae framed Persia as 'an "
        f"empire of a million men' with the undefeated 'Immortals' — match that scale of "
        f"threat for this episode's antagonist faction). "
        f"For each scene return JSON with: scene_number, title, description (1-2 sentences), "
        f"narration (1-2 sentences of voiceover script), video_prompt (a detailed AI video "
        f"generation prompt, photoreal historical documentary style), and duration_sec "
        f"(an integer, 6-10). "
        f"Return ONLY a JSON object: "
        f'{{"title": "<episode title>", "scenes": [ ... ]}}'
    )

    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}]
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    parsed = json.loads(text)
    return parsed["title"], parsed["scenes"]


def main():
    load_env_file()
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}

    series_name = payload.get("series_name", "LEGEND EMPIRE")
    episode_number = payload.get("episode_number", 1)
    topic = payload.get("topic", "Untitled Episode")

    try:
        title, scenes = call_gemini(series_name, episode_number, topic)
        source = "gemini-api"
    except Exception as exc:  # noqa: BLE001 - any failure -> fallback
        title = topic
        scenes = template_scenes(topic, series_name)
        source = f"template-fallback ({exc.__class__.__name__}: {exc})"

    result = {
        "series_name": series_name,
        "episode_number": episode_number,
        "topic": topic,
        "title": title,
        "scenes": scenes,
        "source": source,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
