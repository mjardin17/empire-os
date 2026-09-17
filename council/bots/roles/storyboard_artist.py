"""storyboard_artist.py — priority 4: image prompts must match narration."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole

STOPWORDS = frozenset(
    "the a an of in on at to for and or but with by from as is are was were "
    "it its this that these those his her their our".split())


def _keywords(text: str) -> set[str]:
    return {w.strip(".,;:!?'\"").lower() for w in text.split()
            if len(w) > 3 and w.lower() not in STOPWORDS}


class StoryboardArtist(CouncilRole):
    """Checks each scene's image prompts overlap with its narration (4/scene rule)."""

    name = "role_storyboard_artist"
    description = "Validates image prompts match narration (4 per scene)"
    priority = 4
    auto_fix = False

    def run(self) -> BotResult:
        scripts = self.latest_scripts(limit=3)
        if not scripts:
            self.result.warn(f"no scripts in {self.prompts_dir}")
            return self.result
        for script in scripts:
            data = self.load_script_json(script)
            if data is None:
                continue
            mismatched: list[int] = []
            short: list[int] = []
            for s in data.get("scenes", []):
                n = int(s.get("scene_number", 0))
                prompts = [p for p in (s.get("image_prompts") or [])
                           if isinstance(p, str) and p.strip()]
                if len(prompts) < 4:
                    short.append(n)  # standing rule: 4 photos per scene
                narr_kw = _keywords(str(s.get("narration", "")))
                if narr_kw and prompts:
                    overlap = max(
                        (len(_keywords(p) & narr_kw) for p in prompts), default=0)
                    if overlap == 0:
                        mismatched.append(n)
            if short:
                self.result.warn(f"{script.name}: scenes {short} have <4 image "
                                 f"prompts (4-per-scene rule)")
            if mismatched:
                self.result.warn(f"{script.name}: scenes {mismatched} prompts share "
                                 f"NO keywords with narration — visuals may drift")
            if not short and not mismatched:
                self.result.ok(f"{script.name}: storyboard prompts aligned ✔")
        return self.result
