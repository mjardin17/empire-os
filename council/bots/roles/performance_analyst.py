"""performance_analyst.py — priority 10: optimization recs from run data."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole


class PerformanceAnalyst(CouncilRole):
    """Reads model_health.json + council runs and recommends optimizations."""

    name = "role_performance_analyst"
    description = "Generates optimization recommendations from run data"
    priority = 10
    auto_fix = False

    def run(self) -> BotResult:
        report = self.router.health.get_report()
        if not report:
            self.result.ok("no routed calls recorded yet — nothing to analyze")
            return self.result

        recs: list[str] = []
        for model, info in sorted(report.items()):
            for task, stats in info.get("tasks", {}).items():
                if stats["calls"] < 3:
                    continue  # not enough signal
                if stats["success_rate"] < 0.5:
                    recs.append(f"{model}/{task}: success rate "
                                f"{stats['success_rate']:.0%} over "
                                f"{stats['calls']} calls — demote in routing")
                if stats["avg_latency_ms"] > 120_000:
                    recs.append(f"{model}/{task}: avg latency "
                                f"{stats['avg_latency_ms'] / 1000:.0f}s — "
                                f"consider a faster fallback first")
                if stats["avg_cost_usd"] > 0.25:
                    recs.append(f"{model}/{task}: ${stats['avg_cost_usd']:.2f}/call "
                                f"— verify a free provider can't cover this")
        if recs:
            for rec in recs[:10]:
                self.result.warn(rec)
            self.result.next_action = "review routing table against these recs"
        else:
            self.result.ok(f"{len(report)} model(s) tracked — "
                           f"no optimization flags ✔")
        self.save_state({"recommendations": recs})
        return self.result
