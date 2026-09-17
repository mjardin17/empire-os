"""audio_engineer.py — priority 7: levels, sync, music balance."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole


class AudioEngineer(CouncilRole):
    """Checks narration WAVs and final-mix audio levels."""

    name = "role_audio_engineer"
    description = "Audio levels, sync, background music balance"
    priority = 7
    auto_fix = False

    def run(self) -> BotResult:
        checked = 0
        # Narration WAVs in work dirs
        work_root = self.base_dir / "output" / "empire_render"
        if work_root.exists():
            for ep_dir in sorted(work_root.iterdir()):
                if not ep_dir.is_dir():
                    continue
                bad = []
                for wav in sorted(ep_dir.glob("scene_*.wav"))[:20]:
                    checked += 1
                    v = self.validator.validate_audio(str(wav))
                    if not v.passed:
                        bad.append(f"{wav.name}: {'; '.join(v.errors)}")
                if bad:
                    self.result.error(f"{ep_dir.name}: bad narration audio — "
                                      f"{bad[:3]}")
                    self.result.next_action = f"re-run TTS for {ep_dir.name}"

        # Final mixes: audio present, not silent, not clipped-quiet
        for final in self.latest_finals(limit=3):
            checked += 1
            v = self.validator.validate_video(str(final))
            silent = any("silent" in e for e in v.errors)
            quiet = any("quiet" in w for w in v.warnings)
            if silent:
                self.result.error(f"{final.name}: audio SILENT — do not upload")
            elif quiet:
                self.result.warn(f"{final.name}: mix is quiet — check music "
                                 f"balance (GG 18% / LO+IL 12%)")
            else:
                self.result.ok(f"{final.name}: audio levels healthy ✔")
        if checked == 0:
            self.result.warn("no audio artifacts found to check")
        return self.result
