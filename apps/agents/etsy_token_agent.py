#!/usr/bin/env python3
"""Agent: Extract Etsy API token automatically via browser automation."""

import asyncio
import json
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("❌ Playwright not installed. Run: INSTALL_PLAYWRIGHT.bat")
    exit(1)


async def get_etsy_token():
    """Extract Etsy OAuth token automatically."""
    print("\n" + "="*70)
    print("🤖 ETSY TOKEN EXTRACTION AGENT")
    print("="*70)
    print("\nOpening Etsy Developer portal...")
    print("Make sure you're logged in to your Etsy account first!\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        # Go to Etsy developers
        print("→ Navigating to Etsy Developers...")
        await page.goto("https://www.etsy.com/developers/", wait_until="domcontentloaded")
        await asyncio.sleep(2)

        # Look for "Get Started" button
        print("→ Looking for 'Get Started' button...")
        try:
            # Try to find and click Get Started
            started_button = await page.query_selector("a:has-text('Get Started')")
            if started_button:
                await started_button.click()
                await asyncio.sleep(3)
                print("✓ Clicked 'Get Started'")
        except:
            print("⚠️ Could not auto-click 'Get Started' - you may need to click manually")
            print("Waiting 30 seconds for you to navigate...")
            await asyncio.sleep(30)

        # Wait for user to create app and navigate to keys
        print("\n→ Waiting for you to:")
        print("  1. Create a new app (name: 'Inventory Sync')")
        print("  2. Go to the 'Keys' tab")
        print("  3. Look for 'OAuth Token'\n")
        print("Waiting 60 seconds...\n")
        await asyncio.sleep(60)

        # Try to extract OAuth token from page
        print("→ Scanning page for OAuth token...")
        try:
            # Look for token in visible text or input fields
            tokens_found = await page.query_selector_all("input[type='text'], input[type='password']")
            token_value = None

            for token_input in tokens_found:
                value = await token_input.get_attribute("value")
                if value and len(value) > 20:  # OAuth tokens are long
                    token_value = value
                    print(f"✓ Found potential token: {value[:20]}...")
                    break

            if token_value:
                # Save to .env
                env_file = Path(".env")
                env_content = ""
                if env_file.exists():
                    with open(env_file) as f:
                        env_content = f.read()

                # Add or update ETSY_TOKEN
                if "ETSY_TOKEN=" in env_content:
                    env_content = env_content.replace(
                        [line for line in env_content.split("\n") if line.startswith("ETSY_TOKEN=")][0],
                        f"ETSY_TOKEN={token_value}"
                    )
                else:
                    env_content += f"\nETSY_TOKEN={token_value}\n"

                with open(env_file, "w") as f:
                    f.write(env_content)

                print(f"\n✅ SUCCESS!")
                print(f"✓ Extracted Etsy OAuth token")
                print(f"✓ Saved to .env")
                print(f"\nToken: {token_value[:30]}...")
            else:
                print("\n⚠️ Could not auto-extract token")
                print("Please copy your OAuth token manually:")
                print("1. In the browser, find the OAuth Token field")
                print("2. Copy it (Ctrl+C)")
                token = input("\n▶ Paste your Etsy OAuth token here: ").strip()
                if token:
                    env_file = Path(".env")
                    env_content = ""
                    if env_file.exists():
                        with open(env_file) as f:
                            env_content = f.read()
                    if "ETSY_TOKEN=" in env_content:
                        lines = env_content.split("\n")
                        env_content = "\n".join([f"ETSY_TOKEN={token}" if l.startswith("ETSY_TOKEN=") else l for l in lines])
                    else:
                        env_content += f"\nETSY_TOKEN={token}\n"
                    with open(env_file, "w") as f:
                        f.write(env_content)
                    print(f"✓ Saved to .env")

        except Exception as e:
            print(f"Error: {e}")

        await browser.close()

    print("\n" + "="*70)
    print("Etsy token agent complete")
    print("="*70 + "\n")


if __name__ == "__main__":
    asyncio.run(get_etsy_token())
