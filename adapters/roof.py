import time
from typing import Any, Callable, Dict, List, Optional

from shared.logger import logger
from shared.approval_gate import approval_gate

from adapters.mission_board import MissionBoardAdapter
from adapters.learn_loop import LearnLoopAdapter
from adapters.video_studio import VideoStudioAdapter
from adapters.book_maker import BookMakerAdapter
from adapters.merch_factory import MerchFactoryAdapter
from adapters.bosslisters import BossListersAdapter

FACTORY = "ROOF"

FIXTURE_CHAPTERS = [
    {"title": "One Roof", "content": "Four factories, one mission board.\n\nJoshua is the approval gate."},
    {"title": "Proof Before Live", "content": "Every job runs dry first and posts proof.\n\nNothing goes live without a yes."},
]
FIXTURE_PRODUCT = {
    "sku": "FIXTURE-ROOF-001",
    "title": "[FIXTURE] Empire OS roof dry-run listing",
    "description": "Test fixture. Never listed.",
    "price": "0.00",  # Joshua sets every real price
    "quantity": 1,
}


class EmpireRoof:
    """
    Empire OS roof: runs the four factories end to end under one mission board.

    For each factory: post an order -> claim it -> run the factory job (dry-run
    unless the approval gate says LIVE) -> post proof -> record a learn-loop
    event. The final order step (approved) belongs to Joshua: it is only sent
    when joshua_approved=True, otherwise every order stays at proof_posted.
    """

    def __init__(self, board: MissionBoardAdapter, learn: LearnLoopAdapter,
                 bosslisters_url: str = "http://localhost:3001"):
        self.board = board
        self.learn = learn
        self.video = VideoStudioAdapter()
        self.books = BookMakerAdapter()
        self.merch = MerchFactoryAdapter()
        self.bosslisters = BossListersAdapter(bosslisters_url)

    # -- factory runners: each returns (success, proof_text, details) ------

    def _run_video(self) -> Dict[str, Any]:
        r = self.video.submit_job(channel="GG", episode_id="ROOF_E2E",
                                  prompt="Empire OS roof end-to-end clip", duration_seconds=5)
        ok = r.get("status") == "COMPLETED" and bool(r.get("video_path"))
        return {"ok": ok, "gate_mode": r.get("gate_mode"), "job_id": r.get("job_id"),
                "proof": f"{r.get('status')} video={r.get('video_path')} thumb={r.get('thumbnail_path')}",
                "error": r.get("error")}

    def _run_books(self) -> Dict[str, Any]:
        r = self.books.submit_job(title="Roof Proof Manual", author="Empire OS", chapters=FIXTURE_CHAPTERS)
        ok = r.get("status") == "COMPLETED"
        return {"ok": ok, "gate_mode": r.get("gate_mode"), "job_id": r.get("job_id"),
                "proof": f"{r.get('status')} epub={r.get('epub_path')} pdf={r.get('pdf_path')}",
                "error": r.get("error")}

    def _run_merch(self) -> Dict[str, Any]:
        scan = self.merch.load_latest_scan()
        r = self.merch.submit_job(scan, top_n=3)
        ok = r.get("status") == "COMPLETED" and all(x.get("dry_run") for x in r.get("results", []))
        niches = ", ".join(x["niche"] for x in r.get("results", []))
        return {"ok": ok, "gate_mode": r.get("gate_mode"), "job_id": r.get("job_id"),
                "proof": f"{r.get('status')} printful dry-run x{r.get('opportunities_submitted')}: {niches}",
                "error": None if ok else "merch dry-run did not complete"}

    def _run_bosslisters(self) -> Dict[str, Any]:
        r = self.bosslisters.submit_job(FIXTURE_PRODUCT)
        resp = r.get("response") or {}
        ok = r.get("status") == "COMPLETED" and resp.get("dry_run") is True and resp.get("published") is False
        return {"ok": ok, "gate_mode": r.get("gate_mode"), "job_id": r.get("job_id"),
                "proof": f"{r.get('status')} ebay dry-run published={resp.get('published')} ready_for_live={r.get('ready_for_live')}",
                "error": r.get("error")}

    # -- orchestration ----------------------------------------------------

    def run(self, joshua_approved: bool = False) -> Dict[str, Any]:
        run_id = f"roof_{int(time.time())}"
        gate = approval_gate.evaluate(action="run_empire", factory=FACTORY,
                                      payload={"run_id": run_id}, joshua_approved=joshua_approved)
        steps: List[Dict[str, Any]] = []
        runners: List[tuple] = [
            ("VIDEO_STUDIO", "Render a short clip", self._run_video),
            ("BOOK_MAKER", "Build an EPUB + 6x9 PDF", self._run_books),
            ("MERCH_FACTORY", "Scan trends and dry-run Printful products", self._run_merch),
            ("BOSSLISTERS", "Dry-run one eBay listing", self._run_bosslisters),
        ]

        for factory, title, runner in runners:
            order = self.board.post_order(f"[{run_id}] {factory}: {title}", description="Roof end-to-end run")
            order_id = (order.get("order") or {}).get("order_id")
            step: Dict[str, Any] = {"factory": factory, "order_id": order_id, "board_ok": order["status"] == "COMPLETED"}
            if not order_id:
                step.update(ok=False, error=f"could not post order: {order.get('error')}")
                steps.append(step)
                self._record(factory, "post_order", False, step)
                continue

            claim = self.board.claim(order_id)
            try:
                result = runner() if claim["status"] == "COMPLETED" else {"ok": False, "proof": "claim failed", "error": claim.get("error")}
            except Exception as exc:  # a factory crash must not stop the other factories
                logger.error(f"{factory} crashed: {exc}", factory=FACTORY)
                result = {"ok": False, "proof": f"CRASHED: {exc}", "error": str(exc)}

            proof_text = (result["proof"] if result["ok"] else f"FAILED: {result.get('error') or result['proof']}")[:900]
            proof = self.board.post_proof(order_id, proof_text) if claim["status"] == "COMPLETED" else None
            approval = self.board.approve(order_id, joshua_approved=joshua_approved) if proof and proof["status"] == "COMPLETED" else None
            self._record(factory, "roof_run", result["ok"], result)

            step.update(
                ok=result["ok"], gate_mode=result.get("gate_mode"), job_id=result.get("job_id"),
                proof=proof_text, error=result.get("error"),
                order_status=(approval.get("order_status") if approval and approval.get("order_status") else
                              (proof or {}).get("order_status")),
                approval=(approval or {}).get("status"),
            )
            steps.append(step)

        all_ok = all(s.get("ok") for s in steps)
        summary = {
            "run_id": run_id,
            "gate_mode": gate["mode"],
            "status": "COMPLETED" if all_ok else "FAILED",
            "factories_ok": sum(1 for s in steps if s.get("ok")),
            "factories_total": len(steps),
            "steps": steps,
            "learn_summary": self.learn.score_summary(),
        }
        logger.info(f"Roof run {run_id} {summary['status']}", factory=FACTORY,
                    data={k: v for k, v in summary.items() if k not in ("steps", "learn_summary")})
        return summary

    def _record(self, factory: str, action: str, ok: bool, detail: Dict[str, Any]) -> None:
        try:
            self.learn.submit_event({
                "factory": factory, "action": action,
                "outcome": "success" if ok else "failure", "score": 1.0 if ok else 0.0,
                "metadata": {"job_id": str(detail.get("job_id") or detail.get("order_id") or "")[:64],
                             "gate_mode": str(detail.get("gate_mode") or "")},
            })
        except Exception as exc:
            logger.error(f"learn-loop record failed for {factory}: {exc}", factory=FACTORY)
