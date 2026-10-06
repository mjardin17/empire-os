import json
import time
import uuid
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from shared.logger import logger
from shared.approval_gate import approval_gate

BOSSLISTERS_BASE_URL = "http://localhost:3001"
ALLOWED_HOSTS = {"localhost", "127.0.0.1"}
ALLOWED_PORT = 3001
HTTP_TIMEOUT_SEC = 90  # first hit of a route in `next dev` compiles it
EBAY_LISTING_ROUTE = "/api/channels/ebay/create-listing"


class BossListersAdapter:
    """
    BossListers Adapter
    Thin HTTP client over the existing BossListers Next.js API (localhost:3001 only).
    Does NOT reimplement any connector and does NOT touch the live eBay tenant path:
    every request is sent with dryRun=true, and a LIVE approval-gate decision is
    refused here (BLOCKED) rather than forwarded.
    """
    def __init__(self, base_url: str = BOSSLISTERS_BASE_URL):
        parsed = urlparse(base_url)
        if parsed.hostname not in ALLOWED_HOSTS or parsed.port != ALLOWED_PORT:
            raise ValueError(f"BossListers adapter only talks to localhost:{ALLOWED_PORT}, got {base_url}")
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
            return {"http_status": None, "body": {"error": f"BossListers unreachable: {e}"}}

    def health(self) -> bool:
        res = self._request("GET", "/api/health")
        return res["http_status"] == 200

    def submit_job(self, product: Dict[str, Any], policies: Optional[Dict[str, Any]] = None,
                   joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = f"job_bosslisters_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        gate = approval_gate.evaluate(
            action="list_on_ebay",
            factory="BOSSLISTERS",
            payload={"job_id": job_id, "sku": product.get("sku"), "title": product.get("title")},
            joshua_approved=joshua_approved,
        )

        base = {"job_id": job_id, "gate_mode": gate["mode"], "sku": product.get("sku"), "error": None}

        if gate["mode"] == "LIVE":
            reason = "Live listing is not wired through this adapter (Piece 5 is dry-run only); no request was sent."
            logger.warning(reason, factory="BOSSLISTERS", data=base)
            return {**base, "status": "BLOCKED", "error": reason, "response": None}

        if not self.health():
            error = "BossListers is not reachable on localhost:3001 (/api/health failed)."
            logger.error(error, factory="BOSSLISTERS")
            return {**base, "status": "FAILED", "error": error, "response": None}

        res = self._request("POST", EBAY_LISTING_ROUTE, {
            "product": product, "policies": policies or {}, "dryRun": True,
        })
        body = res["body"]
        confirmed_dry = res["http_status"] == 200 and body.get("ok") is True and body.get("dry_run") is True and body.get("published") is False

        result = {
            **base,
            "status": "COMPLETED" if confirmed_dry else "FAILED",
            "error": None if confirmed_dry else (body.get("error") or f"Unexpected response (HTTP {res['http_status']})"),
            "http_status": res["http_status"],
            "ready_for_live": body.get("ready_for_live"),
            "missing": body.get("missing"),
            "would_call": body.get("would_call"),
            "response": body,
        }
        logger.info(f"BossListers job {job_id} {result['status']}", factory="BOSSLISTERS",
                    data={k: v for k, v in result.items() if k != "response"})
        return result
