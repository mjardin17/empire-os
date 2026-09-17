"""director.py — priority 1: orchestrates the full episode pipeline."""

from __future__ import annotations

import json

from .role_base import BotResult, CouncilRole


class Director(CouncilRole):
    """Routes episode work to the right council members in order."""

    name = "role_director"
    description = "Orchestrates the episode pipeline, routes to council members"
    priority = 1
    auto_fix = False

    #: canonical stage → responsible role
    PIPELINE_STAGES = [
        ("script", "role_screenwriter"),
        ("storyboard", "role_storyboard_artist"),
        ("prompts", "role_prompt_engineer"),
        ("video", "role_video_editor"),
        ("audio", "role_audio_engineer"),
        ("qa", "role_qa_engineer"),
        ("publish", "role_publisher"),
    ]

    def run(self) -> BotResult:
        scripts = self.latest_scripts()
        finals = self.latest_finals()
        if not scripts:
            self.result.warn(f"no scripts in {self.prompts_dir} — nothing to direct")
            return self.result

        # Determine pipeline position per newest episode: script exists →
        # is there a final? If not, the render stage is the bottleneck.
        plan: list[dict] = []
        final_names = {f.name.lower() for f in finals}
        for script in scripts:
            data = self.load_script_json(script)
            if data is None:
                self.result.error(f"unparseable script: {script.name}")
                continue
            ep_id = str(data.get("episode_id", script.stem))
            has_final = any(ep_id.lower() in n for n in final_names)
            stage = "publish" if has_final else "video"
            plan.append({"episode": ep_id, "script": script.name,
                         "next_stage": stage,
                         "route_to": dict(self.PIPELINE_STAGES).get(stage, "")})
        if plan:
            self.save_state({"pipeline_plan": plan})
            self.result.ok(f"directed {len(plan)} episode(s); plan → "
                           f"{json.dumps([p['episode'] + ':' + p['next_stage'] for p in plan])}")
            self.result.next_action = (f"run {plan[0]['route_to']} for "
                                       f"{plan[0]['episode']}")
        return self.result
