"""
core/publishing/connectors/payhip_connector.py — Payhip direct publish.

Ported from video-bot-pipeline/storyforge/uploader.py's upload_to_payhip().
Payhip is the author's own store (100% margin minus Payhip's cut) — this
one uses the PDF asset, not the EPUB, matching the source's behavior.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from core.publishing.platform_export import PublishingConnector
from core.publishing.models import PlatformPackage

DEFAULT_PRICE_USD = "4.99"


class PayhipConnector(PublishingConnector):
    name = "payhip"

    def _api_key(self, credentials: Optional[Dict[str, str]]) -> str:
        credentials = credentials or {}
        return credentials.get("PAYHIP_API_KEY") or os.environ.get("PAYHIP_API_KEY", "")

    def is_configured(self, credentials: Optional[Dict[str, str]] = None) -> bool:
        return bool(self._api_key(credentials))

    def submit(self, package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        api_key = self._api_key(credentials)
        if not api_key:
            return {"status": "skipped", "message": "PAYHIP_API_KEY not configured — skipping"}

        pdf_path = package.asset_paths.get("pdf", "")
        if not pdf_path or not Path(pdf_path).exists():
            return {"status": "error", "message": f"PDF not found at asset_paths['pdf']={pdf_path!r}"}

        try:
            import requests
        except ImportError:
            return {"status": "error", "message": "requests not installed — pip install requests"}

        fields = package.listing_fields
        headers = {"Authorization": f"Bearer {api_key}"}
        price = str(fields.get("price") or DEFAULT_PRICE_USD)

        try:
            with open(pdf_path, "rb") as f:
                resp = requests.post(
                    "https://payhip.com/api/v1/product",
                    headers=headers,
                    data={
                        "title": fields.get("title", ""),
                        "description": fields.get("description", ""),
                        "price": price,
                        "currency": "USD",
                    },
                    files={"file": (Path(pdf_path).name, f, "application/pdf")},
                    timeout=120,
                )
        except requests.RequestException as e:
            return {"status": "error", "message": f"Upload request failed: {e}"}

        if resp.status_code in (200, 201):
            result = resp.json()
            url = result.get("link", "")
            return {"status": "success", "message": f"Live on Payhip: {url}", "url": url}
        return {"status": "error", "message": f"Upload failed: {resp.text[:300]}"}
