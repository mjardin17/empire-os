class SelfHealingSystem:
    def __init__(self):
        self.error_log = []
        self.rate_limiter = 0

    def report_error(self, error, context):
        self.error_log.append({"error": str(error), "context": context})
        print(f"🛠️ Healing: {error}")
        self.rate_limiter += 1
        if self.rate_limiter > 5:
            return "pause_and_alert_user"
        return "retry"
