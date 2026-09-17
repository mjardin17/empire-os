#!/usr/bin/env python3
"""Agent: Interactive accounts setup - collects credentials and creates accounts.csv"""

import csv
from pathlib import Path


def main():
    print("\n" + "="*70)
    print("🤖 ACCOUNTS SETUP AGENT")
    print("="*70)
    print("\nI'll collect your account credentials and create accounts.csv")
    print("Then we can log in to all platforms automatically\n")

    accounts = []

    platforms = [
        ("whatnot", "Whatnot", "username"),
        ("mercari", "Mercari", "email"),
        ("facebook", "Facebook Marketplace", "email"),
        ("etsy", "Etsy", "email"),
    ]

    for platform, display_name, field_type in platforms:
        print(f"\n{'─'*70}")
        print(f"📱 {display_name}")
        print(f"{'─'*70}")

        username = input(f"Enter your {display_name} {field_type}: ").strip()
        if not username:
            print(f"⊘ Skipping {display_name}")
            continue

        password = input(f"Enter your {display_name} password: ").strip()
        if not password:
            print(f"⊘ Skipping {display_name} (no password)")
            continue

        accounts.append({
            "platform": platform,
            "username": username,
            "password": password
        })
        print(f"✓ Added {display_name}")

    if not accounts:
        print("\n❌ No accounts added")
        return

    # Save to accounts.csv
    csv_path = Path("accounts.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["platform", "username", "password"])
        writer.writeheader()
        writer.writerows(accounts)

    print(f"\n{'='*70}")
    print(f"✅ ACCOUNTS SAVED")
    print(f"{'='*70}")
    print(f"\n✓ Created: accounts.csv")
    print(f"✓ Accounts: {len(accounts)}")
    for acc in accounts:
        print(f"    {acc['platform']:15s} → {acc['username']}")

    print(f"\nNext step: Run LOGIN_ALL.bat to log in to all accounts")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
