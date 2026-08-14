"""
core/publishing/connectors/kdp_connector.py — Amazon KDP direct publish.

Ported from video-bot-pipeline/storyforge/uploader.py's upload_to_kdp()
(Playwright browser automation — KDP has no public listing-submission
API), adapted from that script's flat `book: dict` onto this engine's
`PlatformPackage`/`credentials` connector interface.

Real credentials required: this will not run without KDP_EMAIL and
KDP_PASSWORD, either passed in `credentials` or set as environment
variables. No credentials are hardcoded anywhere in this file.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from core.publishing.platform_export import PublishingConnector
from core.publishing.models import PlatformPackage

DEFAULT_PRICE_USD = "3.99"


class KDPConnector(PublishingConnector):
    name = "kdp"

    def _creds(self, credentials: Optional[Dict[str, str]]) -> tuple[str, str]:
        credentials = credentials or {}
        email = credentials.get("KDP_EMAIL") or os.environ.get("KDP_EMAIL", "")
        password = credentials.get("KDP_PASSWORD") or os.environ.get("KDP_PASSWORD", "")
        return email, password

    def is_configured(self, credentials: Optional[Dict[str, str]] = None) -> bool:
        email, password = self._creds(credentials)
        return bool(email and password)

    def submit(self, package: PlatformPackage, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        email, password = self._creds(credentials)
        if not email or not password:
            return {"status": "skipped", "message": "KDP_EMAIL / KDP_PASSWORD not configured — skipping"}

        epub_path = package.asset_paths.get("epub", "")
        if not epub_path or not Path(epub_path).exists():
            return {"status": "error", "message": f"EPUB not found at asset_paths['epub']={epub_path!r}"}

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return {"status": "error", "message": "playwright not installed — pip install playwright && playwright install chromium"}

        fields = package.listing_fields
        title = fields.get("title", "")
        subtitle = fields.get("subtitle", "")
        description = fields.get("description", "")
        keywords = fields.get("keywords", [])[:7]
        price = str(fields.get("price") or DEFAULT_PRICE_USD)

        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=False, slow_mo=100)
        page = browser.new_page()
        try:
            page.goto("https://kdp.amazon.com/en_US/", timeout=30000)
            page.click("a:has-text('Sign in')")
            page.wait_for_load_state("networkidle")
            page.fill("input[name='email']", email)
            page.click("input[id='continue']")
            page.wait_for_selector("input[name='password']", timeout=10000)
            page.fill("input[name='password']", password)
            page.click("input[id='signInSubmit']")
            page.wait_for_url("**/kdp.amazon.com/**", timeout=30000)
            time.sleep(2)

            page.goto("https://kdp.amazon.com/en_US/title-setup/kindle/new/details", timeout=30000)
            page.wait_for_load_state("networkidle")
            time.sleep(2)

            page.fill("input[id='data-print-book-title']", title)
            time.sleep(0.3)

            if subtitle:
                sub = page.locator("input[id='data-print-book-subtitle']")
                if sub.count():
                    sub.fill(subtitle)

            desc_field = page.locator("textarea[id='data-print-book-description'], div[contenteditable='true']").first
            if desc_field.count():
                desc_field.fill(description)
            time.sleep(0.3)

            for i, kw in enumerate(keywords):
                kw_field = page.locator(f"input[id='data-print-book-keywords-{i}']")
                if kw_field.count():
                    kw_field.fill(str(kw).strip())

            page.click("input[id='save-announce'], button:has-text('Save and continue')")
            page.wait_for_load_state("networkidle", timeout=30000)
            time.sleep(2)

            upload_input = page.locator("input[type='file'][accept*='epub'], input[name='data-manuscript-file']").first
            if upload_input.count():
                upload_input.set_input_files(str(epub_path))
                page.wait_for_load_state("networkidle", timeout=120000)
                time.sleep(5)

            page.click("input[id='save-announce'], button:has-text('Save and continue')")
            page.wait_for_load_state("networkidle", timeout=30000)

            price_field = page.locator("input[id='data-print-book-marketplace-price-0'], input[name*='price']").first
            if price_field.count():
                price_field.fill(price)

            publish_btn = page.locator("button:has-text('Publish'), input[value*='Publish']").first
            if publish_btn.count():
                publish_btn.click()
                page.wait_for_load_state("networkidle", timeout=60000)

            url = page.url
            return {"status": "success", "message": f"Submitted to KDP: {title}", "url": url}
        except Exception as e:
            return {"status": "error", "message": str(e)}
        finally:
            browser.close()
            pw.stop()
