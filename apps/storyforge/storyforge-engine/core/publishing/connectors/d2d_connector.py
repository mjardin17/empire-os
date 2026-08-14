"""
core/publishing/connectors/d2d_connector.py — Draft2Digital direct publish.

Ported from video-bot-pipeline/storyforge/uploader.py's upload_to_d2d().
One D2D account distributes to B&N, Apple Books, Kobo, Scribd, Tolino,
Vivlio, BorrowBox, and more with a single "publish to all channels" call.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from core.publishing.platform_export import PublishingConnector
from core.publishing.models import PlatformPackage

DEFAULT_PRICE_USD = 3.99


class D2DConnector(PublishingConnector):
    name = "d2d"

    def _api_key(self, credentials: Optional[Dict[str, str]]) -> str:
        credentials = credentials or {}
        return credentials.get("D2D_API_KEY") or os.environ.get("D2D_API_KEY", "")

    def is_configured(self, credentials: Optional[Dict[str, str]] = None) -> bool:
        return bool(self._api_key(credentials))

    def submit(self, package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        api_key = self._api_key(credentials)
        if not api_key:
            return {"status": "skipped", "message": "D2D_API_KEY not configured — skipping"}

        epub_path = package.asset_paths.get("epub", "")
        if not epub_path or not Path(epub_path).exists():
            return {"status": "error", "message": f"EPUB not found at asset_paths['epub']={epub_path!r}"}

        try:
            import requests
        except ImportError:
            return {"status": "error", "message": "requests not installed — pip install requests"}

        fields = package.listing_fields
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            with open(epub_path, "rb") as f:
                upload_resp = requests.post(
                    "https://api.draft2digital.com/v1/books/upload",
                    headers=headers,
                    files={"file": (Path(epub_path).name, f, "application/epub+zip")},
                    timeout=120,
                )
        except requests.RequestException as e:
            return {"status": "error", "message": f"Upload request failed: {e}"}

        if upload_resp.status_code not in (200, 201):
            return {"status": "error", "message": f"Upload failed: {upload_resp.text[:300]}"}

        upload_json = upload_resp.json()
        book_id = upload_json.get("book_id") or upload_json.get("id")
        if not book_id:
            return {"status": "error", "message": f"D2D response had no book_id: {upload_json}"}

        try:
            requests.put(
                f"https://api.draft2digital.com/v1/books/{book_id}",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "title": fields.get("title", ""),
                    "description": fields.get("description", ""),
                    "keywords": fields.get("keywords", [])[:7],
                    "price": fields.get("price") or DEFAULT_PRICE_USD,
                    "currency": "USD",
                    "language": fields.get("language", "en"),
                },
                timeout=30,
            )

            pub_resp = requests.post(
                f"https://api.draft2digital.com/v1/books/{book_id}/publish",
                headers=headers,
                json={"channels": "all"},
                timeout=30,
            )
        except requests.RequestException as e:
            return {"status": "error", "message": f"Metadata/publish request failed: {e}", "book_id": book_id}

        if pub_resp.status_code in (200, 201, 202):
            return {
                "status": "success",
                "message": "Published to all D2D channels (B&N, Apple, Kobo, Scribd, ...)",
                "book_id": book_id,
            }
        return {"status": "error", "message": f"Publish failed: {pub_resp.text[:300]}", "book_id": book_id}
