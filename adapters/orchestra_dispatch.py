import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from shared.logger import logger

from adapters.mission_board import MissionBoardAdapter
from adapters.learn_loop import LearnLoopAdapter

FACTORY = "ORCHESTRA_DISPATCH"
AGENT = "orchestra-agent"
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
FORBIDDEN_PORTS = {3001, 3002}
PERMISSIONS = ("read_only", "write")
PROOF_LIMIT = 900
HTTP_SLACK_SEC = 60  # on top of the task's own timeout
MIN_SECRET_LEN = 16
GRANT_TTL_SEC = 600
# Must stay identical to ai-orchestra backend/app/facility_auth.py task_digest().
DIGEST_KEYS = ("id", "title", "fixture", "permissions", "allowed_paths", "prompt", "verify", "timeout_s", "verify_timeout_s", "model")


def _secret(name: str) -> Optional[str]:
    value = os.environ.get(name, "")
    return value if len(value) >= MIN_SECRET_LEN else None


def task_digest(task: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps({k: task.get(k) for k in DIGEST_KEYS}, sort_keys=True).encode()).hexdigest()


def mint_write_grant(task: Dict[str, Any], secret: str, now: Optional[float] = None) -> str:
    exp = int((now if now is not None else time.time()) + GRANT_TTL_SEC)
    nonce = secrets.token_hex(8)  # fresh per grant: grants are single use, never reuse one across retries
    mac = hmac.new(secret.encode(), f"{exp}|{nonce}|{task_digest(task)}".encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{nonce}.{mac}"


def validate_task(task: Any) -> Optional[str]:
    """Return a reason string if the task is malformed, else None. Runs before anything is posted anywhere."""
    if not isinstance(task, dict):
        return "task must be an object"
    if not isinstance(task.get("id"), str) or not task["id"].strip():
        return "task id must be a non-empty string"
    unknown = sorted(str(k) for k in task if k not in DIGEST_KEYS)
    if unknown:
        return f"unknown task fields (Orchestra rejects them): {unknown}"
    perm = task.get("permissions")
    if perm not in PERMISSIONS:
        return f"permissions must be one of {PERMISSIONS}"
    if perm == "write":
        paths = task.get("allowed_paths")
        if not isinstance(paths, list) or not paths or not all(isinstance(p, str) and p.strip() for p in paths):
            return "write task requires a non-empty allowed_paths list"
    return None


def verified_receipt(receipt: Any) -> bool:
    """Verification = Orchestra's own acceptance run passed: status 'verified' AND verify.report_ok is true."""
    if not isinstance(receipt, dict) or receipt.get("status") != "verified":
        return False
    verify = receipt.get("verify")
    return isinstance(verify, dict) and verify.get("report_ok") is True


class OrchestraDispatchAdapter:
    """
    Control-plane side of the Super Facility task loop (Milestone 1).

    Three separate things, never conflated:
      1. PERMISSION to execute: a bearer token for the endpoint plus, for write tasks only, a signed write grant
         bound to this exact task. Obtained only when the caller passes allow_write=True.
      2. VERIFICATION: Orchestra's receipt says status 'verified' AND verify.report_ok is true.
      3. HUMAN ACCEPTANCE: joshua_approved=True.
    approve() is requested only when (2) and (3) both hold. Anything else leaves the order at proof_posted.
    The order is created with requires_verification=True so the mission board server also refuses approval of
    an order whose proof did not report verification 'verified' (fail closed, independent of this adapter).
    """

    def __init__(self, board: MissionBoardAdapter, learn: LearnLoopAdapter, orchestra_url: str = "http://localhost:8000"):
        parsed = urlparse(orchestra_url)
        if parsed.hostname not in ALLOWED_HOSTS or parsed.port is None or parsed.port in FORBIDDEN_PORTS:
            raise ValueError(f"Orchestra dispatch only talks to localhost on an explicit port other than "
                             f"{sorted(FORBIDDEN_PORTS)}, got {orchestra_url}")
        self.board, self.learn = board, learn
        self.url = orchestra_url.rstrip("/")

    def _call_orchestra(self, task: Dict[str, Any], headers: Dict[str, str]) -> Dict[str, Any]:
        timeout = float(task.get("timeout_s", 300)) + HTTP_SLACK_SEC
        req = urllib.request.Request(f"{self.url}/api/tasks/run", data=json.dumps(task).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {"ok": True, "receipt": json.loads(resp.read().decode("utf-8"))}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"Orchestra rejected task (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:200]}"}
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            return {"ok": False, "error": f"Orchestra unreachable or bad reply: {e}"}

    @staticmethod
    def _proof(receipt: Any, verified: bool, error: Optional[str]) -> str:
        prefix = "VERIFIED" if verified else "NOT VERIFIED"
        if not isinstance(receipt, dict):
            return f"{prefix}: {error or 'no receipt'}"[:PROOF_LIMIT]
        v = receipt.get("verify") if isinstance(receipt.get("verify"), dict) else {}
        diff = receipt.get("diff") if isinstance(receipt.get("diff"), dict) else {}
        lessons = receipt.get("candidate_lessons") if isinstance(receipt.get("candidate_lessons"), list) else []
        parts = [f"status={receipt.get('status')}", f"model={receipt.get('model')}", f"perm={receipt.get('permissions')}",
                 f"verify_exit={v.get('exit_code')}", f"report_ok={v.get('report_ok')}",
                 f"changed={','.join(str(c) for c in diff.get('changed', []) or []) or '-'}",
                 f"candidate_lessons={','.join(str(c.get('id')) for c in lessons if isinstance(c, dict)) or '-'}",
                 f"run_id={receipt.get('run_id')}"]
        return f"{prefix}: " + " | ".join(parts)[:PROOF_LIMIT - len(prefix) - 2]

    def _auth_headers(self, task: Dict[str, Any], allow_write: bool) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
        token = _secret("FACILITY_API_TOKEN")
        if not token:
            return None, f"FACILITY_API_TOKEN is not set (at least {MIN_SECRET_LEN} characters); refusing to dispatch"
        headers = {"Authorization": f"Bearer {token}"}
        if task["permissions"] == "write":
            if not allow_write:
                return None, "write task refused: allow_write was not granted"
            secret = _secret("FACILITY_GRANT_SECRET")
            if not secret:
                return None, f"write task refused: FACILITY_GRANT_SECRET is not set (at least {MIN_SECRET_LEN} characters)"
            headers["X-Facility-Write-Grant"] = mint_write_grant(task, secret)
        return headers, None

    def dispatch(self, task: Dict[str, Any], allow_write: bool = False, joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = f"job_orchestra_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        problem = validate_task(task)
        if problem:
            return self._refuse(job_id, problem)
        headers, problem = self._auth_headers(task, allow_write)
        if problem:
            return self._refuse(job_id, problem)

        order = self.board.post_order(f"[{task['id']}] {task.get('title')}",
                                      description=f"permissions={task['permissions']} fixture={task.get('fixture')}",
                                      requires_verification=True)
        order_id = (order.get("order") or {}).get("order_id")
        if not order_id:
            return self._finish(job_id, "FAILED", f"could not post order: {order.get('error')}", None, None, None, task)
        claim = self.board.claim(order_id, AGENT)
        if claim["status"] != "COMPLETED":
            return self._finish(job_id, "FAILED", f"claim failed: {claim.get('error')}", order_id, None, None, task)

        res = self._call_orchestra(task, headers)
        receipt = res.get("receipt")
        verified = res.get("ok") is True and verified_receipt(receipt)
        error = None if verified else (res.get("error") or
                                       (f"receipt status={receipt.get('status')}" if isinstance(receipt, dict) else "malformed or missing receipt"))
        proof = self.board.post_proof(order_id, AGENT, self._proof(receipt, verified, error),
                                      verification="verified" if verified else "failed")
        approval = None
        if proof["status"] != "COMPLETED":
            verified, error = False, error or f"proof post failed: {proof.get('error')}"
        elif verified:
            # approve() sends nothing unless joshua_approved=True; otherwise it answers PENDING_APPROVAL.
            approval = self.board.approve(order_id, joshua_approved=joshua_approved)
        return self._finish(job_id, "COMPLETED" if verified else "FAILED", error, order_id,
                            receipt if isinstance(receipt, dict) else None, (proof, approval), task)

    def _refuse(self, job_id: str, reason: str) -> Dict[str, Any]:
        logger.warning(f"Dispatch refused: {reason}", factory=FACTORY, data={"job_id": job_id})
        return {"job_id": job_id, "status": "REJECTED", "error": reason, "order_id": None, "order_status": None,
                "receipt": None, "gate_mode": None, "approval": None}

    def _finish(self, job_id, status, error, order_id, receipt, board_results, task) -> Dict[str, Any]:
        verified = status == "COMPLETED"
        self.learn.submit_event({
            "factory": FACTORY, "action": "dispatch_task", "outcome": "success" if verified else "failure",
            "score": 1.0 if verified else 0.0,
            "metadata": {"job_id": job_id, "task_id": str(task.get("id"))[:64],
                         "status": str((receipt or {}).get("status")), "model": str((receipt or {}).get("model"))}})
        proof, approval = board_results or (None, None)
        out = {"job_id": job_id, "status": status, "error": error, "order_id": order_id, "gate_mode": None,
               "receipt": receipt, "approval": (approval or {}).get("status"),
               "order_status": ((approval or {}).get("order_status") or (proof or {}).get("order_status"))}
        logger.info(f"Orchestra dispatch {status}", factory=FACTORY,
                    data={k: v for k, v in out.items() if k != "receipt"})
        return out
