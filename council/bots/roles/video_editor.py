"""video_editor.py — priority 6: clip assembly, transitions, timing."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole


class VideoEditor(CouncilRole):
    """Validates scene clips + assembled finals (timing, decodability)."""

    name = "role_video_editor"
    description = "Validates clip assembly, transitions, timing"
    priority = 6
    auto_fix = False

    def run(self) -> BotResult:
        # In-progress scene clips
        work_root = self.base_dir / "output" / "empire_render"
        checked = 0
        if work_root.exists():
            for ep_dir in sorted(work_root.iterdir()):
                if not ep_dir.is_dir():
                    continue
                clips = sorted(ep_dir.glob("scene_*_final.mp4"))
                broken = []
                for clip in clips:
                    checked += 1
                    v = self.validator.validate_video(str(clip))
                    if not v.passed:
                        broken.append(f"{clip.name}: {'; '.join(v.errors)}")
                if broken:
                    self.result.error(f"{ep_dir.name}: {len(broken)} broken scene "
                                      f"clip(s) — {broken[:3]}")
                    self.result.next_action = f"re-render broken scenes in {ep_dir.name}"

        # Finished episodes
        for final in self.latest_finals(limit=3):
            checked += 1
            v = self.validator.validate_render(str(final))
            if v.passed:
                self.result.ok(f"{final.name}: render valid "
                               f"(score {v.score:.2f}) ✔")
            else:
                self.result.error(f"{final.name}: {'; '.join(v.errors)}")
            for w in v.warnings[:3]:
                self.result.warn(f"{final.name}: {w}")
        if checked == 0:
            self.result.warn("no clips or finals found to validate")
        return self.result
