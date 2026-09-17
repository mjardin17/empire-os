#!/usr/bin/env python3
"""Agent: Get Etsy and Pinterest tokens automatically."""

import asyncio
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("❌ Playwright not installed. Run: INSTALL_PLAYWRIGHT.bat")
    exit(1)


async def get_tokens():
    """Get Etsy and Pinterest tokens via browser."""
    print("\n" + "="*70)
    print("🤖 TOKEN GETTER AGENT")
    print("="*70)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        tokens = {}

        # ETSY
        print("\n📱 ETSY TOKEN")
        print("─"*70)
        etsy_ready = input("Is your Etsy app approved and ready? (y/n): ").strip().lower()
        if etsy_ready == "y":
            print("→ Opening Etsy Developers...")
            await page.goto("https://www.etsy.com/developers/", wait_until="domcontentloaded")
            await asyncio.sleep(2)

            print("→ Follow these steps:")
            print("  1. Go to 'Keys' tab")
            print("  2. Copy the OAuth Token")
            print("\nWaiting 60 seconds for you to get the token...\n")
            await asyncio.sleep(60)

            token = input("Paste your Etsy OAuth Token here: ").strip()
            if token:
                tokens["ETSY_TOKEN"] = token
                print("✓ Etsy token saved\n")
            else:
                print("⊘ Etsy token skipped\n")
        else:
            print("⊘ Etsy skipped (waiting for approval)\n")

        # PINTEREST
        print("📱 PINTEREST TOKEN")
        print("─"*70)
        print("→ Opening Pinterest Developers...")
        await page.goto("https://developers.pinterest.com/", wait_until="domcontentloaded")
        await asyncio.sleep(2)

        print("→ Follow these steps:")
        print("  1. Sign in with your Pinterest account")
        print("  2. Create a new app")
        print("  3. Go to 'Credentials' or 'Settings'")
        print("  4. Copy your Access Token")
        print("\nWaiting 60 seconds for you to get the token...\n")
        await asyncio.sleep(60)

        token = input("Paste your Pinterest Access Token here: ").strip()
        if token:
            tokens["PINTEREST_TOKEN"] = token
            print("✓ Pinterest token saved\n")
        else:
            print("⊘ Pinterest token skipped\n")

        await browser.close()

    # Save to .env
    if tokens:
        env_file = Path(".env")
        env_content = ""
        if env_file.exists():
            with open(env_file) as f:
                env_content = f.read()

        # Add tokens to .env
        for key, value in tokens.items():
            if f"{key}=" in env_content:
                # Update existing
                lines = env_content.split("\n")
                env_content = "\n".join([f"{key}={value}" if l.startswith(f"{key}=") else l for l in lines])
            else:
                # Add new
                env_content += f"{key}={value}\n"

        with open(env_file, "w") as f:
            f.write(env_content)

        print("="*70)
        print("✅ TOKENS SAVED")
        print("="*70)
        print(f"✓ Saved {len(tokens)} tokens to .env")
        for key in tokens:
            print(f"  • {key}")
        print("\nReady to run: CREDS.bat\n")
    else:
        print("No tokens collected\n")


if __name__ == "__main__":
    asyncio.run(get_tokens())
