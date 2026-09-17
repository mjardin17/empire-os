#!/usr/bin/env python3
"""SalesTrackerAgent — polls eBay orders, records sales to Supabase atomically.

Runs every 5 minutes. Fetches orders since last poll, resolves SKU to products
table, decrements inventory, logs sales. Uses Supabase RPC for atomicity.

Ready to run as soon as eBay token is refreshed.
"""

import os
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from dotenv import load_dotenv
from lib.ebay_sales import EbaySalesClient, EbaySalesError, resolve_sku_from_legacy_item_id

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass
class SalesTrackerState:
    last_poll_time: str = field(default_factory=lambda: (
        datetime.now(timezone.utc) - timedelta(days=1)
    ).isoformat())
    processed_orders: dict[str, str] = field(default_factory=dict)

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.__dict__, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "SalesTrackerState":
        if not path.exists():
            return cls()
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(**data)


class SupabaseSalesWriter:
    """Writes sales to Supabase via RPC call with atomic dedup and SKU resolution."""

    def __init__(self, supabase_url: str, anon_key: str,
                 service_role_key: Optional[str] = None):
        self.supabase_url = supabase_url
        self.anon_key = anon_key
        self.service_role_key = service_role_key or anon_key
        self._client = None

    def _get_client(self):
        """Lazy-load Supabase client."""
        if self._client is None:
            try:
                import supabase
                self._client = supabase.create_client(self.supabase_url, self.service_role_key)
            except ImportError:
                raise ImportError("supabase-py required: pip install supabase")
        return self._client

    def record_sale(self, order_id: str, sku: str, quantity: int,
                   total_price: str) -> dict[str, Any]:
        """Record a sale atomically via Supabase RPC."""
        client = self._get_client()
        try:
            response = client.rpc(
                "record_sale",
                {
                    "p_order_id": order_id,
                    "p_sku": sku,
                    "p_quantity": quantity,
                    "p_total_price": float(total_price),
                }
            ).execute()
            return response.data[0] if response.data else {"status": "recorded"}
        except Exception as e:
            raise EbaySalesError(
                "supabase_write",
                f"Failed to record sale {order_id}: {e}"
            )


class SalesTrackerAgent:
    def __init__(self, ebay_access_token: str,
                 supabase_url: str, supabase_anon_key: str,
                 ebay_transport: Optional[Callable] = None,
                 state_file: Path = None,
                 sandbox: bool = False):
        self.ebay_client = EbaySalesClient(
            access_token=ebay_access_token,
            transport=ebay_transport,
            sandbox=sandbox
        )
        self.sales_writer = SupabaseSalesWriter(supabase_url, supabase_anon_key)
        self.state_file = state_file or Path("sales_tracker_state.json")
        self.state = SalesTrackerState.load(self.state_file)

    def poll_and_record(self) -> dict[str, Any]:
        """Fetch orders since last poll and record sales."""
        try:
            since = datetime.fromisoformat(self.state.last_poll_time)
        except (ValueError, AttributeError):
            since = datetime.now(timezone.utc) - timedelta(days=1)

        logger.info(f"Polling eBay orders since {since.isoformat()}")

        try:
            orders = self.ebay_client.get_orders_since(since)
        except EbaySalesError as e:
            return {
                "status": "failed",
                "error": str(e),
                "orders_processed": 0,
                "orders_skipped": 0,
            }

        processed = 0
        skipped = 0
        errors = []

        for order in orders:
            for line_item in order.line_items:
                order_key = f"{order.order_id}:{line_item.line_item_id}"

                if order_key in self.state.processed_orders:
                    logger.debug(f"Order {order_key} already processed, skipping")
                    skipped += 1
                    continue

                try:
                    sku = resolve_sku_from_legacy_item_id(line_item.legacy_item_id)
                except EbaySalesError as e:
                    logger.error(f"SKU resolution failed for {order_key}: {e}")
                    errors.append({"order_key": order_key, "error": str(e)})
                    skipped += 1
                    continue

                try:
                    self.sales_writer.record_sale(
                        order_id=order.order_id,
                        sku=sku,
                        quantity=line_item.quantity,
                        total_price=order.total_value,
                    )
                    self.state.processed_orders[order_key] = sku
                    processed += 1
                    logger.info(f"✅ Recorded sale {order_key}: {sku} x{line_item.quantity}")
                except EbaySalesError as e:
                    logger.error(f"Failed to record sale {order_key}: {e}")
                    errors.append({"order_key": order_key, "error": str(e)})
                    skipped += 1

        self.state.last_poll_time = datetime.now(timezone.utc).isoformat()
        self.state.save(self.state_file)

        return {
            "status": "success" if processed > 0 else "no_orders",
            "orders_processed": processed,
            "orders_skipped": skipped,
            "errors": errors if errors else None,
            "next_poll": self.state.last_poll_time,
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    token = os.environ.get("EBAY_REFRESH_TOKEN")
    if not token:
        print("ERROR: EBAY_REFRESH_TOKEN not set")
        exit(1)

    sb_url = os.environ.get("SUPABASE_URL")
    sb_key = os.environ.get("SUPABASE_ANON_KEY")
    if not sb_url or not sb_key:
        print("ERROR: SUPABASE_URL and SUPABASE_ANON_KEY required")
        exit(1)

    agent = SalesTrackerAgent(token, sb_url, sb_key)
    result = agent.poll_and_record()
    print(f"Status: {result['status']}")
    if result.get('error'):
        print(f"Error: {result['error']}")
    print(f"Processed: {result['orders_processed']}, Skipped: {result['orders_skipped']}")
