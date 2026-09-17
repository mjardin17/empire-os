"""screenwriter.py — priority 3: script quality (scene count, words, arc)."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole

MIN_WORDS_PER_SCENE = 25
ARC_OPENERS = ("hook", "intro", "opening")
ARC_CLOSERS = ("legacy", "aftermath", "conclusion", "outro", "end")


class Screenwriter(CouncilRole):
    """Validates episode scripts: scene count, word count, narrative arc."""

    name = "role_screenwriter"
    description = "Script quality: scene count, word count, narrative arc"
    priority = 3
    auto_fix = False

    def run(self) -> BotResult:
        scripts = self.latest_scripts()
        if not scripts:
            self.result.warn(f"no scripts in {self.prompts_dir}")
            return self.result

        min_scenes = {"gg": 12, "lo": 24, "il": 10, "ed": 10}.get(self.channel, 10)
        for script in scripts:
            data = self.load_script_json(script)
            if data is None:
                self.result.error(f"{script.name}: invalid JSON")
                continue
            scenes = data.get("scenes", [])
            if len(scenes) < min_scenes:
                self.result.warn(f"{script.name}: only {len(scenes)} scenes "
                                 f"(min {min_scenes}) — stub?")
                continue
            words = [len(str(s.get("narration", "")).split()) for s in scenes]
            thin = [i + 1 for i, w in enumerate(words) if w < MIN_WORDS_PER_SCENE]
            if thin:
                self.result.warn(f"{script.name}: thin narration in scenes {thin} "
                                 f"(<{MIN_WORDS_PER_SCENE} words)")
            # narrative arc: named opener/closer or at least intro-heavy scene 1
            titles = [str(s.get("title", "")).lower() for s in scenes]
            has_open = any(any(o in t for o in ARC_OPENERS) for t in titles[:2])
            has_close = any(any(c in t for c in ARC_CLOSERS) for t in titles[-2:])
            if not (has_open or has_close):
                self.result.warn(f"{script.name}: no clear hook/legacy arc markers")
            if not thin and len(scenes) >= min_scenes:
                self.result.ok(f"{script.name}: {len(scenes)} scenes, "
                               f"{sum(words)} words ✔")
        return self.result
