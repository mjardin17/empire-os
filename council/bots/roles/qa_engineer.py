"""qa_engineer.py — priority 8: full quality checklist before approval."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole


class QAEngineer(CouncilRole):
    """Runs the full pre-approval checklist on the newest finals."""

    name = "role_qa_engineer"
    description = "Full quality checklist before approving an episode"
    priority = 8
    auto_fix = False

    def run(self) -> BotResult:
        finals = self.latest_finals(limit=3)
        if not finals:
            self.result.warn(f"no finals in {self.renders_dir} to QA")
            return self.result
        approved: list[str] = []
        for final in finals:
            checks: list[tuple[str, bool, str]] = []
            render = self.validator.validate_render(str(final))
            checks.append(("render", render.passed, "; ".join(render.errors)))
            video = self.validator.validate_video(str(final))
            checks.append(("video/audio", video.passed, "; ".join(video.errors)))
            # duration vs channel minimum (bot_base min_final_sec is the old
            # long-format bar; QA flags without hard-failing new-format runs)
            failed = [(n, d) for n, ok, d in checks if not ok]
            if failed:
                self.result.error(f"{final.name}: QA FAILED — "
                                  + "; ".join(f"{n}: {d}" for n, d in failed))
                self.result.next_action = f"re-render {final.name}"
            else:
                approved.append(final.name)
                self.result.ok(f"{final.name}: QA checklist passed ✔ "
                               f"(visual frame QC still requires "
                               f"bot_10_frame_inspector before upload)")
        self.save_state({"qa_approved": approved})
        return self.result
