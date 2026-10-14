import json
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from shared.logger import logger
from shared.approval_gate import approval_gate

from adapters.mission_board import MissionBoardAdapter
from adapters.learn_loop import LearnLoopAdapter

FACTORY = "ORCHESTRA_DISPATCH"
AGENT = "orchestra-agent"
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
FORBIDDEN_PORTS = {3001, 3002}
PERMISSIONS = ("read_only", "write")
PROOF_LIMIT = 900
HTTP_SLACK_SEC = 60  # on top of the task's own timeout


class OrchestraDispatchAdapter:
    """
    Control-plane side of the Super Facility task loop (Milestone 1).

    dispatch(task): policy check -> record the task as a mission-board order -> claim -> hand it to
    AI Orchestra (POST /api/tasks/run) -> post the evidence receipt summary as proof -> record the
    outcome in the learn loop -> request approval (sent only when joshua_approved=True).

    Policy: `write` tasks are refused unless allow_write=True is passed explicitly; refusal happens
    BEFORE anything is posted. Verification is Orchestra's acceptance command, never the model's claim.
    """

    def __init__(self, board: MissionBoardAdapter, learn: LearnLoopAdapter, orchestra_url: str = "http://localhost:8000"):
        parsed = urlparse(orchestra_url)
        if parsed.hostname not in ALLOWED_HOSTS or parsed.port is None or parsed.port in FORBIDDEN_PORTS:
            raise ValueError(f"Orchestra dispatch only talks to localhost on an explicit port other than "
                             f"{sorted(FORBIDDEN_PORTS)}, got {orchestra_url}")
        self.board, self.learn = board, learn
        self.url = orchestra_url.rstrip("/")

    def _call_orchestra(self, task: Dict[str, Any]) -> Dict[str, Any]:
        timeout = float(task.get("timeout_s", 300)) + HTTP_SLACK_SEC
        req = urllib.request.Request(f"{self.url}/api/tasks/run", data=json.dumps(task).encode("utf-8"),
                                     method="POST", headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {"ok": True, "receipt": json.loads(resp.read().decode("utf-8"))}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"Orchestra rejected task (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:200]}"}
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            return {"ok": False, "error": f"Orchestra unreachable or bad reply: {e}"}

    @staticmethod
    def _proof(receipt: Dict[str, Any]) -> str:
        v = receipt.get("verify") or {}
        parts = [f"status={receipt.get('status')}", f"model={receipt.get('model')}",
                 f"perm={receipt.get('permissions')}", f"verify_exit={v.get('exit_code')}",
                 f"changed={','.join((receipt.get('diff') or {}).get('changed', [])) or '-'}",
                 f"lessons_injected={len(receipt.get('lessons_injected', []))}",
                 f"candidate_lessons={','.join(c['id'] for c in receipt.get('candidate_lessons', [])) or '-'}",
                 f"receipt={receipt.get('receipt_path')}"]
        return " | ".join(parts)[:PROOF_LIMIT]

    def dispatch(self, task: Dict[str, Any], allow_write: bool = False, joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = f"job_orchestra_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        perm = task.get("permissions")
        if perm not in PERMISSIONS:
            return self._refuse(job_id, f"permissions must be one of {PERMISSIONS}")
        if perm == "write" and not allow_write:
            return self._refuse(job_id, "write task refused: allow_write was not granted")
        gate = approval_gate.evaluate(action="dispatch_task", factory=FACTORY,
                                      payload={"job_id": job_id, "task_id": task.get("id")}, joshua_approved=joshua_approved)

        order = self.board.post_order(f"[{task.get('id')}] {task.get('title')}",
                                      description=f"permissions={perm} fixture={task.get('fixture')}")
        order_id = (order.get("order") or {}).get("order_id")
        if not order_id:
            return self._finish(job_id, "FAILED", f"could not post order: {order.get('error')}", None, gate, None, None, task)
        claim = self.board.claim(order_id, AGENT)
        if claim["status"] != "COMPLETED":
            return self._finish(job_id, "FAILED", f"claim failed: {claim.get('error')}", order_id, gate, None, None, task)

        res = self._call_orchestra(task)
        receipt: Optional[Dict[str, Any]] = res.get("receipt")
        proof_text = self._proof(receipt) if receipt else f"FAILED: {res.get('error')}"
        proof = self.board.post_proof(order_id, AGENT, proof_text)
        approval = self.board.approve(order_id, joshua_approved=joshua_approved) if proof["status"] == "COMPLETED" else None
        ok = bool(receipt) and receipt.get("status") == "verified"
        return self._finish(job_id, "COMPLETED" if ok else "FAILED", None if ok else (res.get("error") or receipt.get("error")),
                            order_id, gate, receipt, (proof, approval), task)

    def _refuse(self, job_id: str, reason: str) -> Dict[str, Any]:
        logger.warning(f"Dispatch refused: {reason}", factory=FACTORY, data={"job_id": job_id})
        return {"job_id": job_id, "status": "REJECTED", "error": reason, "order_id": None, "order_status": None,
                "receipt": None, "gate_mode": None}

    def _finish(self, job_id, status, error, order_id, gate, receipt, board_results, task) -> Dict[str, Any]:
        verified = status == "COMPLETED"
        self.learn.submit_event({
            "factory": FACTORY, "action": "dispatch_task", "outcome": "success" if verified else "failure",
            "score": 1.0 if verified else 0.0,
            "metadata": {"job_id": job_id, "task_id": str(task.get("id"))[:64],
                         "status": str((receipt or {}).get("status")), "model": str((receipt or {}).get("model"))}})
        proof, approval = board_results or (None, None)
        out = {"job_id": job_id, "status": status, "error": error, "order_id": order_id, "gate_mode": gate["mode"],
               "receipt": receipt, "approval": (approval or {}).get("status"),
               "order_status": ((approval or {}).get("order_status") or (proof or {}).get("order_status"))}
        logger.info(f"Orchestra dispatch {status}", factory=FACTORY,
                    data={k: v for k, v in out.items() if k != "receipt"})
        return out
