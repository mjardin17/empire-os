import importlib.util
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from shared.logger import logger
from shared.approval_gate import approval_gate

CLAUDE_ROOT = Path(__file__).resolve().parents[2]
VIDEO_BOT_ROOT = CLAUDE_ROOT / "video-bot-pipeline"
SCANNER_PATH = CLAUDE_ROOT / "viral-engine" / "merch_empire" / "scanner.py"

# Appended (not prepended) so this repo's own `shared` / `adapters` packages win.
if str(VIDEO_BOT_ROOT) not in sys.path:
    sys.path.append(str(VIDEO_BOT_ROOT))

from merch.artwork import ArtworkSource  # noqa: E402
from merch.connectors import MerchPublishRequest, MerchVariant, PrintfulConnector  # noqa: E402

# The Printful connector refuses to run preflight without a key and refuses a
# price <= 0. Neither is a real value: the key is only ever used when the gate
# says DRY_RUN (no network call is made), and the price is a sentinel, not a
# price. Joshua sets every real price.
DRY_RUN_PLACEHOLDER_KEY = "DRYRUN_PLACEHOLDER_NOT_A_REAL_KEY"
FIXTURE_PRICE = 0.01
FIXTURE_ARTWORK_URL = "https://example.invalid/fixture-artwork.png"
FIXTURE_VARIANT_ID = "0"


def _load_scanner_module():
    spec = importlib.util.spec_from_file_location("empire_merch_scanner", SCANNER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MerchFactoryAdapter:
    """
    Merch Factory Adapter
    Wires scanner output -> Printful connector (dry-run only):
    scan (or load latest scan) -> pick opportunities -> build Printful publish requests -> gate -> dry-run publish
    """
    def __init__(self, output_dir: Optional[Path] = None):
        self.output_dir = output_dir or Path(__file__).resolve().parent.parent / "output" / "merch_factory"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.connector = PrintfulConnector()

    # -- scanner side -----------------------------------------------------

    def run_scanner(self) -> Dict[str, Any]:
        """Run the real scanner, redirecting its output files into this repo's output dir."""
        scan_dir = self.output_dir / "scan"
        scan_dir.mkdir(parents=True, exist_ok=True)
        scanner = _load_scanner_module()
        scanner.MERCH_DIR = scan_dir
        logger.info("Running merch scanner (live web probes)", factory="MERCH_FACTORY", data={"scan_dir": str(scan_dir)})
        return scanner.run_scan()

    def load_latest_scan(self) -> Dict[str, Any]:
        """Load the newest scanner output already on disk (no network)."""
        scan_dir = SCANNER_PATH.parent
        candidates = sorted(scan_dir.glob("merch-scan-*.json"))
        if not candidates:
            raise FileNotFoundError(f"No merch-scan-*.json found in {scan_dir}")
        return json.loads(candidates[-1].read_text(encoding="utf-8"))

    # -- mapping ----------------------------------------------------------

    def build_request(self, opportunity: Dict[str, Any]) -> MerchPublishRequest:
        niche = opportunity["niche"]
        slug = niche.lower().replace(" & ", "-").replace(" ", "-")[:40]
        return MerchPublishRequest(
            title=f"[FIXTURE] {niche}",
            artwork=ArtworkSource.from_url(FIXTURE_ARTWORK_URL),
            retail_price=FIXTURE_PRICE,
            variants=[MerchVariant(vendor_variant_id=FIXTURE_VARIANT_ID, label="FIXTURE variant")],
            description=f"Scanner opportunity rank {opportunity.get('rank')} ({opportunity.get('category')}).",
            tags=[opportunity.get("category", "")],
            sku=f"FIXTURE-{slug}",
            product_type="tshirt",
            external_id=f"scan-rank-{opportunity.get('rank')}",
        )

    # -- job --------------------------------------------------------------

    def submit_job(self, scan: Dict[str, Any], top_n: int = 3, joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = f"job_merch_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        opportunities: List[Dict[str, Any]] = scan.get("top_10_opportunities", [])[:top_n]

        gate_decision = approval_gate.evaluate(
            action="list_merch",
            factory="MERCH_FACTORY",
            payload={"job_id": job_id, "opportunity_count": len(opportunities)},
            joshua_approved=joshua_approved,
        )
        is_live = gate_decision["mode"] == "LIVE"

        results: List[Dict[str, Any]] = []
        for opp in opportunities:
            request = self.build_request(opp)
            outcome = self.connector.publish(
                request,
                credentials=None if is_live else {"PRINTFUL_API_KEY": DRY_RUN_PLACEHOLDER_KEY},
                dry_run=not is_live,
            )
            results.append({
                "niche": opp["niche"],
                "rank": opp.get("rank"),
                "score": opp.get("score_breakdown", {}).get("total_score"),
                "success": outcome.success,
                "message": outcome.message,
                "error_code": outcome.error_code,
                "dry_run": bool((outcome.metadata or {}).get("dry_run")),
                "payload": (outcome.metadata or {}).get("payload"),
            })

        report_path = self.output_dir / f"{job_id}.json"
        summary = {
            "job_id": job_id,
            "status": "COMPLETED" if results and all(r["success"] for r in results) else "FAILED",
            "gate_mode": gate_decision["mode"],
            "scan_date": scan.get("scan_date"),
            "opportunities_submitted": len(results),
            "results": results,
            "report_path": str(report_path),
        }
        report_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        logger.info(f"Merch Factory job {job_id} {summary['status']}", factory="MERCH_FACTORY",
                    data={k: v for k, v in summary.items() if k != "results"})
        return summary
