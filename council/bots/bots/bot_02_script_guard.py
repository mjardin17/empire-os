"""
bot_02_script_guard.py — Script Guard Bot
Detects when episode JSON scripts have been downgraded to stubs.
Triggers before any render to prevent wasted compute.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from council.bot_base import CouncilBot, BotResult, BASE_DIR

MIN_FULL_DURATION = 600


class ScriptGuardBot(CouncilBot):
    name = "bot_script_guard"
    description = "Monitors prompt JSONs for stub downgrades; maintains script registry"
    priority = 15
    auto_fix = False

    def _scan(self) -> list[dict]:
        results = []
        if not self.prompts_dir.exists():
            return results
        for p in sorted(self.prompts_dir.rglob("*.json")):
            if any(part.startswith("_") for part in p.relative_to(self.prompts_dir).parts[:-1]):
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            scenes = data.get("scenes", [])
            if not scenes:
                continue
            ep_id = data.get("episode_id") or ""
            if not ep_id:
                stem = p.stem.lower()
                for prefix in ["gg_ep", "ml_ep", "lo_ep"]:
                    idx = stem.find(prefix)
                    if idx != -1:
                        ep_id = stem[idx:].split(".")[0].upper()
                        break
            total_dur = sum(s.get("duration_sec", 0) for s in scenes)
            results.append({
                "episode_id": ep_id or p.stem,
                "filepath": str(p),
                "scene_count": len(scenes),
                "total_duration_sec": total_dur,
                "title": data.get("title", "?"),
                "is_full": total_dur >= MIN_FULL_DURATION,
            })
        return results

    def run(self) -> BotResult:
        r = self.result
        registry_path = BASE_DIR / f"script_registry_{self.channel}.json"
        reg = {}
        if registry_path.exists():
            try:
                reg = json.loads(registry_path.read_text())
            except Exception:
                pass

        eps_by_id: dict[str, list] = {}
        for e in self._scan():
            eps_by_id.setdefault(e["episode_id"], []).append(e)

        # Check each registered episode
        downgrades = []
        for ep_id, approved in reg.items():
            candidates = eps_by_id.get(ep_id, [])
            if not candidates:
                r.warn(f"{ep_id}: registered but MISSING from prompts/")
                downgrades.append(ep_id)
                continue
            best = max(candidates, key=lambda x: x["total_duration_sec"])
            if best["scene_count"] < approved["scene_count"]:
                r.warn(
                    f"{ep_id}: DOWNGRADED — was {approved['scene_count']} scenes "
                    f"({approved['total_duration_sec']}s), now best is "
                    f"{best['scene_count']} scenes ({best['total_duration_sec']}s)"
                )
                downgrades.append(ep_id)
            else:
                r.ok(f"{ep_id}: {best['scene_count']} scenes OK")

        # Count stubs not registered
        total_full = sum(1 for eps in eps_by_id.values()
                        for e in eps if e["is_full"])
        total_stubs = sum(1 for eps in eps_by_id.values()
                         for e in eps if not e["is_full"])
        r.ok(f"Scan complete: {total_full} full scripts, {total_stubs} stubs found")

        self.save_state({
            "downgrades": downgrades,
            "total_full": total_full,
            "total_stubs": total_stubs,
        })

        if downgrades:
            r.next_action = f"MANUAL: restore full scripts from {self.prompts_dir} or backups"

        return r
