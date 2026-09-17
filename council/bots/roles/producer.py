"""producer.py — priority 2: budget/resource tracking + cost threshold warnings."""

from __future__ import annotations

from .role_base import BotResult, CouncilRole

DEFAULT_COST_THRESHOLD_USD = 5.0  # warn if a task-type's recorded spend exceeds this


class Producer(CouncilRole):
    """Watches model_health.json spend and disk resources."""

    name = "role_producer"
    description = "Budget and resource tracking, cost threshold warnings"
    priority = 2
    auto_fix = False

    def run(self) -> BotResult:
        # ── spend from model health ──────────────────────────────────────
        report = self.router.health.get_report()
        total_spend = 0.0
        for model, info in report.items():
            for task, stats in info.get("tasks", {}).items():
                spend = stats["avg_cost_usd"] * stats["calls"]
                total_spend += spend
                if spend > DEFAULT_COST_THRESHOLD_USD:
                    self.result.warn(
                        f"{model}/{task} has spent ${spend:.2f} "
                        f"(threshold ${DEFAULT_COST_THRESHOLD_USD:.2f})")
        self.result.ok(f"total tracked model spend: ${total_spend:.2f}")

        # ── disk space (renders eat GBs fast) ────────────────────────────
        try:
            import shutil as _sh
            free_gb = _sh.disk_usage(str(self.base_dir)).free / 1024**3
            if free_gb < 5:
                self.result.error(f"only {free_gb:.1f}GB free — renders will fail")
                self.result.next_action = "run CLEAN_DISK.bat"
            elif free_gb < 20:
                self.result.warn(f"{free_gb:.1f}GB free — plan a cleanup soon")
            else:
                self.result.ok(f"disk: {free_gb:.0f}GB free")
        except Exception as e:
            self.result.warn(f"disk check failed: {e}")

        self.save_state({"total_spend_usd": round(total_spend, 2)})
        return self.result
