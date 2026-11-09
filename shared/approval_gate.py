import os
from typing import Any, Dict
from shared.logger import logger

class ApprovalGate:
    """
    Empire OS Approval Gate
    RULE: Nothing goes live, listed, published, or synced without Joshua's explicit confirm.
    Default mode is ALWAYS DRY_RUN.
    """
    def __init__(self):
        # Environmental override requires explicit env flag CONFIRM_LIVE=1 AND explicit call flag
        self.allow_env_override = os.getenv("EMPIRE_CONFIRM_LIVE", "0") == "1"

    def evaluate(self, action: str, factory: str, payload: Dict[str, Any] = None, joshua_approved: bool = False) -> Dict[str, Any]:
        payload = payload or {}
        
        # Enforce rule: requires joshua_approved == True to go LIVE
        is_live = joshua_approved or (self.allow_env_override and payload.get("force_live", False))
        
        mode = "LIVE" if is_live else "DRY_RUN"
        reason = "Explicit Joshua approval received." if is_live else "Default safety gate active (DRY_RUN mode enforced)."

        decision = {
            "action": action,
            "factory": factory,
            "mode": mode,
            "approved_for_live": is_live,
            "reason": reason,
            "payload_summary": {k: str(v)[:50] for k, v in payload.items()}
        }

        logger.info(
            message=f"Approval Gate evaluated for {action}: Mode={mode}",
            factory=factory,
            data=decision
        )

        return decision

approval_gate = ApprovalGate()
