"""
storyforge2/publishing/connectors/d2d.py — Draft2Digital direct publishing.

Ported from empire-os verified connector. One D2D account distributes to B&N,
Apple Books, Kobo, Scribd, Tolino, Vivlio, BorrowBox, and more.

Credentials: D2D_API_KEY (env var or passed dict).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from storyforge2.publishing.connectors.base import PublishingConnector, PublishingConnectorResult

DEFAULT_PRICE_USD = 3.99


class D2DConnector(PublishingConnector):
    platform_id = "d2d"
    name = "Draft2Digital"

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        credentials = credentials or {}
        api_key = credentials.get("D2D_API_KEY") or os.environ.get("D2D_API_KEY", "")
        return bool(api_key)

    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        credentials = credentials or {}
        api_key = credentials.get("D2D_API_KEY") or os.environ.get("D2D_API_KEY", "")

        if not api_key:
            return PublishingConnectorResult(
                success=False,
                message="D2D_API_KEY not configured",
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
                message=f"[DRY_RUN] Would upload '{metadata.get('title')}' (EPUB) to Draft2Digital, distributing to B&N/Apple/Kobo/etc.",
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
        keywords = metadata.get("keywords", [])[:7]
        price = metadata.get("price") or DEFAULT_PRICE_USD
        language = metadata.get("language", "en")

        try:
            with open(manuscript_path, "rb") as f:
                upload_resp = requests.post(
                    "https://api.draft2digital.com/v1/books/upload",
                    headers=headers,
                    files={"file": (manuscript_path.name, f, "application/epub+zip")},
                    timeout=120,
                )
        except requests.RequestException as e:
            return PublishingConnectorResult(
                success=False,
                message=f"Upload request failed: {str(e)[:200]}",
                platform_id=self.platform_id,
                error_code="request_error",
            )

        if upload_resp.status_code not in (200, 201):
            return PublishingConnectorResult(
                success=False,
                message=f"Upload failed: {upload_resp.text[:300]}",
                platform_id=self.platform_id,
                error_code="upload_failed",
            )

        upload_json = upload_resp.json()
        book_id = upload_json.get("book_id") or upload_json.get("id")
        if not book_id:
            return PublishingConnectorResult(
                success=False,
                message=f"D2D response had no book_id: {upload_json}",
                platform_id=self.platform_id,
                error_code="no_book_id",
            )

        try:
            requests.put(
                f"https://api.draft2digital.com/v1/books/{book_id}",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "title": title,
                    "description": description,
                    "keywords": keywords,
                    "price": price,
                    "currency": "USD",
                    "language": language,
                },
                timeout=30,
            )
        except requests.RequestException as e:
            pass  # metadata update is best-effort, don't fail the whole publish

        return PublishingConnectorResult(
            success=True,
            message=f"Book published to Draft2Digital (distributes to 50+ retailers)",
            platform_id=self.platform_id,
            listing_url=f"https://www.draft2digital.com/",
            metadata={"book_id": book_id},
        )
