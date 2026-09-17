"""publisher.py — priority 9: upload readiness, metadata, thumbnails."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole


class Publisher(CouncilRole):
    """Validates upload readiness — never uploads (Josh approves manually)."""

    name = "role_publisher"
    description = "Validates upload readiness, metadata, thumbnails"
    priority = 9
    auto_fix = False

    def run(self) -> BotResult:
        finals = self.latest_finals(limit=3)
        if not finals:
            self.result.warn("no finals ready for publishing checks")
            return self.result
        for final in finals:
            issues: list[str] = []
            ep_id = final.stem.replace("_final", "")
            # token: right channel token must exist (NEVER token.pickle)
            if not self.token_file.exists():
                issues.append(f"missing {self.token_file.name} — "
                              f"NEVER fall back to token.pickle (wrong account)")
            # metadata: title/description sidecar or script title
            meta = final.with_suffix(".json")
            script = None
            for s in self.latest_scripts(limit=10):
                if ep_id.lower() in s.name.lower():
                    script = s
                    break
            if not meta.exists() and script is None:
                issues.append("no metadata sidecar and no matching script for title")
            # thumbnail
            thumbs = [final.with_suffix(ext) for ext in (".jpg", ".png")]
            thumb_dir = self.base_dir / "thumbnails"
            has_thumb = any(t.exists() for t in thumbs) or (
                thumb_dir.exists() and any(thumb_dir.glob(f"*{ep_id}*")))
            if not has_thumb:
                issues.append("no thumbnail found (YouTube auto-frame will be used)")
            # size gate
            size_mb = final.stat().st_size / 1024 / 1024
            if size_mb < 10:
                issues.append(f"only {size_mb:.1f}MB — not a real episode")
            if issues:
                for issue in issues:
                    self.result.warn(f"{ep_id}: {issue}")
            else:
                self.result.ok(f"{ep_id}: upload-ready ({size_mb:.0f}MB) — "
                               f"awaiting Josh's manual approval ✔")
        return self.result
