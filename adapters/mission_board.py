import json
import os
import time
import uuid
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from shared.logger import logger
from shared.approval_gate import approval_gate

DEFAULT_PORT = 3000  # empire-command-center default
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
FORBIDDEN_PORTS = {3001, 3002}  # 3001 = BossListers dev server, 3002 = off limits
HTTP_TIMEOUT_SEC = 15
APPROVER_IDENTITY = "joshua"
ORDERS_ROUTE = "/api/mission/orders"
FACTORY = "MISSION_BOARD"


class MissionBoardAdapter:
    """
    Mission Board Adapter
    Thin HTTP client over the EXISTING empire-command-center Mission Board
    (viral-engine/MISSION_BOARD.json, /api/mission/orders routes). It does not hold
    any queue state of its own.

    Order lifecycle (enforced server-side): open -> claimed -> proof_posted -> approved.
    Approval is the only gated step: it goes through the approval gate and is only
    sent, as approved_by="joshua", when the gate returns LIVE (joshua_approved=True).
    Without that flag NO request is sent and the order stays at proof_posted.
    """

    def __init__(self, base_url: str = f"http://localhost:{DEFAULT_PORT}"):
        parsed = urlparse(base_url)
        if parsed.hostname not in ALLOWED_HOSTS or parsed.port is None or parsed.port in FORBIDDEN_PORTS:
            raise ValueError(
                f"Mission Board adapter only talks to localhost on an explicit port other than "
                f"{sorted(FORBIDDEN_PORTS)}, got {base_url}"
            )
        self.base_url = base_url.rstrip("/")
        self.requests_made: List[str] = []

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.requests_made.append(f"{method} {path}")
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            f"{self.base_url}{path}", data=data, method=method,
            headers={"Content-Type": "application/json"} if data else {},
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
                return {"http_status": resp.status, "body": json.loads(resp.read().decode("utf-8") or "{}")}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = {"raw": raw[:200]}
            return {"http_status": e.code, "body": parsed}
        except (urllib.error.URLError, TimeoutError) as e:
            return {"http_status": None, "body": {"error": f"Mission Board unreachable: {e}"}}

    def _result(self, job_id: str, action: str, res: Dict[str, Any]) -> Dict[str, Any]:
        body = res["body"]
        ok = res["http_status"] in (200, 201) and body.get("success") is True
        order = body.get("order") if ok else None
        result = {
            "job_id": job_id,
            "action": action,
            "status": "COMPLETED" if ok else "REJECTED" if res["http_status"] in (400, 403, 404, 409) else "FAILED",
            "http_status": res["http_status"],
            "code": body.get("code"),
            "error": None if ok else (body.get("error") or f"Unexpected response (HTTP {res['http_status']})"),
            "order": order,
            "order_status": order.get("status") if order else None,
        }
        level = logger.info if ok else logger.warning
        level(f"Mission Board {action} -> {result['status']}", factory=FACTORY,
              data={k: v for k, v in result.items() if k != "order"})
        return result

    @staticmethod
    def _job_id(action: str) -> str:
        return f"job_missionboard_{action}_{int(time.time())}_{uuid.uuid4().hex[:6]}"

    def health(self) -> bool:
        return self._request("GET", ORDERS_ROUTE)["http_status"] == 200

    def post_order(self, title: str, description: str = "", created_by: str = "empire-os",
                   requires_verification: bool = False) -> Dict[str, Any]:
        body: Dict[str, Any] = {"title": title, "description": description, "created_by": created_by}
        if requires_verification:
            body["requires_verification"] = True
        return self._result(self._job_id("post"), "post_order", self._request("POST", ORDERS_ROUTE, body))

    def claim(self, order_id: str, agent: str) -> Dict[str, Any]:
        return self._result(self._job_id("claim"), "claim", self._request(
            "POST", f"{ORDERS_ROUTE}/{order_id}/claim", {"agent": agent}))

    def post_proof(self, order_id: str, agent: str, proof: str, verification: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"agent": agent, "proof": proof}
        if verification is not None:
            body["verification"] = verification
        return self._result(self._job_id("proof"), "post_proof", self._request(
            "POST", f"{ORDERS_ROUTE}/{order_id}/proof", body))

    def get_order(self, order_id: str) -> Dict[str, Any]:
        return self._result(self._job_id("get"), "get_order", self._request("GET", f"{ORDERS_ROUTE}/{order_id}"))

    def approve(self, order_id: str, joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = self._job_id("approve")
        gate = approval_gate.evaluate(
            action="approve_order", factory=FACTORY,
            payload={"job_id": job_id, "order_id": order_id}, joshua_approved=joshua_approved,
        )
        if gate["mode"] != "LIVE":
            reason = "Approval requires Joshua's explicit approval; no request was sent."
            logger.warning(reason, factory=FACTORY, data={"job_id": job_id, "order_id": order_id})
            return {"job_id": job_id, "action": "approve", "status": "PENDING_APPROVAL",
                    "gate_mode": gate["mode"], "http_status": None, "code": None,
                    "error": reason, "order": None, "order_status": None}
        result = self._result(job_id, "approve", self._request(
            "POST", f"{ORDERS_ROUTE}/{order_id}/approve", {"approved_by": APPROVER_IDENTITY}))
        return {**result, "gate_mode": gate["mode"]}


def command_center_dir() -> str:
    """Location of the empire-command-center checkout (sibling of this repo unless overridden)."""
    default = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                           "empire-command-center")
    return os.environ.get("EMPIRE_COMMAND_CENTER_DIR", default)
