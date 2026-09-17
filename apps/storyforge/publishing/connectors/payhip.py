"""
storyforge2/publishing/connectors/payhip.py — Payhip independent author store.

Ported from empire-os verified connector. Payhip is the author's own store
(100% revenue minus Payhip's cut) — uses PDF not EPUB, matching the original
behavior.

Credentials: PAYHIP_API_KEY (env var or passed dict).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from storyforge2.publishing.connectors.base import PublishingConnector, PublishingConnectorResult

DEFAULT_PRICE_USD = "4.99"


class PayhipConnector(PublishingConnector):
    platform_id = "payhip"
    name = "Payhip"

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        credentials = credentials or {}
        api_key = credentials.get("PAYHIP_API_KEY") or os.environ.get("PAYHIP_API_KEY", "")
        return bool(api_key)

    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        credentials = credentials or {}
        api_key = credentials.get("PAYHIP_API_KEY") or os.environ.get("PAYHIP_API_KEY", "")

        if not api_key:
            return PublishingConnectorResult(
                success=False,
                message="PAYHIP_API_KEY not configured",
                platform_id=self.platform_id,
                error_code="missing_credentials",
            )

        if not manuscript_path.exists():
            return PublishingConnectorResult(
                success=False,
                message=f"Manuscript not found: {manuscript_path}",
                platform_id=self.platform_id,
                error_code="file_not_found",
            )

        if dry_run:
            return PublishingConnectorResult(
                success=True,
                message=f"[DRY_RUN] Would upload '{metadata.get('title')}' (PDF) to Payhip author store",
                platform_id=self.platform_id,
            )

        try:
            import requests
        except ImportError:
            return PublishingConnectorResult(
                success=False,
                message="requests not installed — run: pip install requests",
                platform_id=self.platform_id,
                error_code="missing_dependency",
            )

        headers = {"Authorization": f"Bearer {api_key}"}
        title = metadata.get("title", "")
        description = metadata.get("description", "")
        price = str(metadata.get("price") or DEFAULT_PRICE_USD)

        try:
            with open(manuscript_path, "rb") as f:
                resp = requests.post(
                    "https://payhip.com/api/v1/product",
                    headers=headers,
                    data={
                        "title": title,
                        "description": description,
                        "price": price,
                        "currency": "USD",
                    },
                    files={"file": (manuscript_path.name, f, "application/pdf")},
                    timeout=120,
                )
        except requests.RequestException as e:
            return PublishingConnectorResult(
                success=False,
                message=f"Upload request failed: {str(e)[:200]}",
                platform_id=self.platform_id,
                error_code="request_error",
            )

        if resp.status_code in (200, 201):
            result = resp.json()
            url = result.get("link", "")
            return PublishingConnectorResult(
                success=True,
                message=f"Book published to Payhip",
                platform_id=self.platform_id,
                listing_url=url,
                metadata={"payhip_link": url},
            )

        return PublishingConnectorResult(
            success=False,
            message=f"Upload failed: {resp.text[:300]}",
            platform_id=self.platform_id,
            error_code="upload_failed",
        )
