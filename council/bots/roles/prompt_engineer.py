"""prompt_engineer.py — priority 5: score/improve prompts before generation."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole

MIN_PROMPT_SCORE = 0.4


class PromptEngineer(CouncilRole):
    """Scores every image/video prompt; flags weak + copyright-risky ones."""

    name = "role_prompt_engineer"
    description = "Scores and improves image/video prompts before generation"
    priority = 5
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
            weak: list[str] = []
            risky: list[str] = []
            total = 0
            for s in data.get("scenes", []):
                n = int(s.get("scene_number", 0))
                prompts = [p for p in (s.get("image_prompts") or [])
                           if isinstance(p, str) and p.strip()]
                extra = s.get("visual_prompt") or s.get("higgsfield_prompt")
                if isinstance(extra, str) and extra.strip():
                    prompts.append(extra)
                for p in prompts:
                    total += 1
                    v = self.validator.validate_prompt(p)
                    if v.score < MIN_PROMPT_SCORE:
                        weak.append(f"scene {n}: {p[:60]!r} (score {v.score})")
                    risk = self.validator.check_copyright_risk(p)
                    if risk >= 0.6:
                        risky.append(f"scene {n}: risk {risk:.1f}: {p[:60]!r}")
            for w in weak[:5]:
                self.result.warn(f"{script.name}: weak prompt — {w}")
            for r in risky[:5]:
                self.result.warn(f"{script.name}: COPYRIGHT — {r}")
            if not weak and not risky:
                self.result.ok(f"{script.name}: {total} prompts scored, all pass ✔")
        return self.result
