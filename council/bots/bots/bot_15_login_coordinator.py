#!/usr/bin/env python3
"""Council Bot 15: Login Coordinator - handles all platform logins via browser automation."""

import json
import csv
import time
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("❌ Playwright not installed. Run: INSTALL_PLAYWRIGHT.bat")
    exit(1)


class LoginCoordinator:
    """Coordinates logins across all platforms."""

    LOGIN_CONFIGS = {
        "whatnot": {
            "url": "https://www.whatnot.com/login",
            "username_selector": "input[name='username']",
            "password_selector": "input[name='password']",
            "submit_selector": "button[type='submit']",
            "success_check": "https://www.whatnot.com/",
        },
        "mercari": {
            "url": "https://www.mercariapp.com/auth/login",
            "username_selector": "input[type='email']",
            "password_selector": "input[type='password']",
            "submit_selector": "button[type='submit']",
            "success_check": "https://www.mercariapp.com/",
        },
        "facebook": {
            "url": "https://www.facebook.com/login",
            "username_selector": "input[name='email']",
            "password_selector": "input[name='pass']",
            "submit_selector": "button[name='login']",
            "success_check": "https://www.facebook.com/",
        },
        "etsy": {
            "url": "https://www.etsy.com/signin",
            "username_selector": "input[type='email']",
            "password_selector": "input[type='password']",
            "submit_selector": "button[type='submit']",
            "success_check": "https://www.etsy.com/",
        },
    }

    def __init__(self):
        self.results = {"successful": [], "failed": [], "mfa_required": []}
        self.session_dir = Path("sessions")
        self.session_dir.mkdir(exist_ok=True)

    def _load_accounts(self) -> List[Dict]:
        """Load accounts from CSV or JSON."""
        accounts = []

        # Try CSV first
        csv_path = Path("accounts.csv")
        if csv_path.exists():
            print("📋 Loading accounts from accounts.csv...")
            with open(csv_path) as f:
                reader = csv.DictReader(f)
                accounts = list(reader)
            print(f"✓ Loaded {len(accounts)} accounts from CSV")
            return accounts

        # Try JSON
        json_path = Path("accounts.json")
        if json_path.exists():
            print("📋 Loading accounts from accounts.json...")
            with open(json_path) as f:
                accounts = json.load(f)
            print(f"✓ Loaded {len(accounts)} accounts from JSON")
            return accounts

        print("❌ No accounts.csv or accounts.json found")
        return []

    async def login_async(self, platform: str, username: str, password: str) -> bool:
        """Log in to a platform and save session (async)."""
        print(f"\n{'─'*70}")
        print(f"🔐 Logging in to {platform.upper()}")
        print(f"{'─'*70}")

        config = self.LOGIN_CONFIGS.get(platform)
        if not config:
            print(f"❌ Unknown platform: {platform}")
            self.results["failed"].append((platform, username, "Unknown platform"))
            return False

        try:
            async with async_playwright() as p:
                # Launch with longer timeout, visible browser (no headless), and user agent
                browser = await p.chromium.launch(
                    headless=False,  # Show browser window so we can see what's happening
                    args=["--disable-blink-features=AutomationControlled"]
                )
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                )
                page = await context.new_page()

                # Go to login page
                print(f"  → Navigating to {config['url']}...")
                try:
                    await page.goto(config["url"], wait_until="domcontentloaded", timeout=60000)
                except:
                    await page.goto(config["url"], timeout=60000)

                await asyncio.sleep(2)  # Wait for dynamic content

                # Fill username
                print(f"  → Entering credentials for {username}...")
                try:
                    await page.fill(config["username_selector"], username, timeout=10000)
                except Exception as e:
                    print(f"     ⚠️ Could not find username field, trying alternative approach...")
                    try:
                        await page.type(config["username_selector"], username)
                    except:
                        pass

                await asyncio.sleep(1)

                # Fill password
                try:
                    await page.fill(config["password_selector"], password, timeout=10000)
                except Exception as e:
                    print(f"     ⚠️ Could not find password field")
                    try:
                        await page.type(config["password_selector"], password)
                    except:
                        pass

                await asyncio.sleep(1)

                # Submit
                print(f"  → Submitting login...")
                try:
                    await page.click(config["submit_selector"], timeout=5000)
                except:
                    print(f"     ⚠️ Could not click submit button")

                # Wait for navigation - be lenient
                print(f"  → Waiting for login to complete (this may take a minute)...")
                await asyncio.sleep(3)

                try:
                    await page.wait_for_load_state("networkidle", timeout=30000)
                except:
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=30000)
                    except:
                        await asyncio.sleep(3)

                # Check for success
                current_url = page.url
                print(f"     Current URL: {current_url}")

                if config["success_check"] in current_url:
                    print(f"  ✓ Successfully logged in to {platform}")

                    # Save cookies/session
                    cookies = await context.cookies()
                    session_file = self.session_dir / f"{platform}_{username}.json"
                    with open(session_file, "w") as f:
                        json.dump(cookies, f)
                    print(f"  ✓ Session saved to {session_file}")

                    self.results["successful"].append((platform, username))
                    await browser.close()
                    return True
                else:
                    # Check for MFA
                    if "verify" in current_url or "2fa" in current_url or "mfa" in current_url:
                        print(f"  ⚠️ MFA required - check your {platform} account for verification")
                        self.results["mfa_required"].append((platform, username))
                    else:
                        print(f"  ❌ Login failed - verify credentials are correct")
                        self.results["failed"].append((platform, username, f"Login failed or invalid credentials"))

                    await browser.close()
                    return False

        except Exception as e:
            print(f"  ❌ Error: {str(e)}")
            self.results["failed"].append((platform, username, str(e)))
            return False

    def login(self, platform: str, username: str, password: str) -> bool:
        """Log in to a platform (sync wrapper)."""
        return asyncio.run(self.login_async(platform, username, password))

    def run_all(self):
        """Log in to all accounts."""
        accounts = self._load_accounts()
        if not accounts:
            print("❌ No accounts to log in to")
            return

        print("\n" + "="*70)
        print("🤖 COUNCIL BOT 15: LOGIN COORDINATOR")
        print("="*70)
        print(f"\nLogging in to {len(accounts)} accounts across all platforms...\n")

        for i, account in enumerate(accounts, 1):
            platform = account.get("platform", "").lower()
            username = account.get("username") or account.get("email")
            password = account.get("password")

            if not all([platform, username, password]):
                print(f"\n⚠️ Skipping incomplete account entry: {account}")
                continue

            print(f"\n[{i}/{len(accounts)}] Logging in to {platform}...")
            self.login(platform, username, password)
            time.sleep(1)  # Rate limiting

        # Summary
        print("\n" + "="*70)
        print("📊 LOGIN SUMMARY")
        print("="*70)
        print(f"\n✓ Successful:    {len(self.results['successful'])} accounts")
        for platform, username in self.results["successful"]:
            print(f"    {platform:15s} → {username}")

        if self.results["mfa_required"]:
            print(f"\n⚠️ MFA Required:   {len(self.results['mfa_required'])} accounts")
            for platform, username in self.results["mfa_required"]:
                print(f"    {platform:15s} → {username} (manual approval needed)")

        if self.results["failed"]:
            print(f"\n❌ Failed:        {len(self.results['failed'])} accounts")
            for platform, username, reason in self.results["failed"]:
                print(f"    {platform:15s} → {username} ({reason})")

        print(f"\n{'='*70}")
        print(f"Council Bot 15 login coordinator completed")
        print(f"Sessions saved to: {self.session_dir}")
        print(f"{'='*70}\n")


if __name__ == "__main__":
    coordinator = LoginCoordinator()
    coordinator.run_all()
