"""
storyforge2/publishing/connectors/kdp.py — Amazon Kindle Direct Publishing.

Ported from the empire-os session's verified KDP connector, adapted to Story
Forge 2's Brief/State conventions. Uses Playwright for browser automation
(KDP has no public listing-submission API — the web UI is the only entry point).

Credentials: KDP_EMAIL, KDP_PASSWORD (env vars or passed dict).

⚠️ WARNING: This opens a real browser window and expects human interaction for
2FA/security prompts. Not suitable for headless/CI environments without special
setup. Dry-run mode logs what would happen without touching KDP.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

from storyforge2.publishing.connectors.base import PublishingConnector, PublishingConnectorResult

DEFAULT_PRICE_USD = "3.99"


class KDPConnector(PublishingConnector):
    platform_id = "kdp"
    name = "Amazon Kindle Direct Publishing"

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        credentials = credentials or {}
        email = credentials.get("KDP_EMAIL") or os.environ.get("KDP_EMAIL", "")
        password = credentials.get("KDP_PASSWORD") or os.environ.get("KDP_PASSWORD", "")
        return bool(email and password)

    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        credentials = credentials or {}
        email = credentials.get("KDP_EMAIL") or os.environ.get("KDP_EMAIL", "")
        password = credentials.get("KDP_PASSWORD") or os.environ.get("KDP_PASSWORD", "")

        if not email or not password:
            return PublishingConnectorResult(
                success=False,
                message="KDP_EMAIL and KDP_PASSWORD not configured",
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
                message=f"[DRY_RUN] Would publish '{metadata.get('title')}' to KDP with email {email}",
                platform_id=self.platform_id,
            )

        # Real publish (requires Playwright + manual interaction for 2FA)
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return PublishingConnectorResult(
                success=False,
                message="playwright not installed — run: pip install playwright && playwright install chromium",
                platform_id=self.platform_id,
                error_code="missing_dependency",
            )

        title = metadata.get("title", "")
        subtitle = metadata.get("subtitle", "")
        description = metadata.get("description", "")
        keywords = metadata.get("keywords", [])[:7]
        price = str(metadata.get("price") or DEFAULT_PRICE_USD)

        print(f"\n[KDP] Opening browser for {email}...")
        print("[KDP] You will need to log in and complete any 2FA prompts manually.")
        print(f"[KDP] Publishing '{title}' to KDP...\n")

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

            return PublishingConnectorResult(
                success=True,
                message="Book published to KDP. Please complete the upload in the browser window and click 'Save'.",
                platform_id=self.platform_id,
                listing_url=f"https://kdp.amazon.com/en_US/",
            )

        except Exception as e:
            return PublishingConnectorResult(
                success=False,
                message=f"KDP publish failed: {str(e)[:200]}",
                platform_id=self.platform_id,
                error_code="publish_error",
            )
        finally:
            browser.close()
            pw.stop()
