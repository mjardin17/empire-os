#!/usr/bin/env python3
"""Simple credential collector - browser automation for ALL platforms."""

from pathlib import Path

# ALL PLATFORMS - Browser automation only (username/password)
PLATFORMS = [
    ("whatnot", "Whatnot"),
    ("mercari", "Mercari"),
    ("facebook", "Facebook Marketplace"),
    ("etsy", "Etsy"),
    ("pinterest", "Pinterest"),
    ("grailed", "Grailed"),
    ("vinted", "Vinted"),
    ("vestiaire", "Vestiaire Collective"),
    ("ebay", "eBay"),
    ("reverb", "Reverb.com"),
    ("realreal", "The RealReal"),
    ("mercadolibre", "Mercado Libre"),
    ("depop", "Depop"),
    ("poshmark", "Poshmark"),
]

print("\n" + "="*70)
print("CREDENTIAL SETUP")
print("="*70)
print("\nPress Enter to skip any platform.\n")

creds = {}

# Load existing .env if it exists
env_file = Path(".env")
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                creds[k.strip()] = v.strip()

for platform, display_name in PLATFORMS:
    print(f"▶ {display_name}")

    username = input(f"  Username/Email: ").strip()
    if not username:
        print(f"  (skipped)\n")
        continue

    password = input(f"  Password: ").strip()
    if not password:
        print(f"  (skipped)\n")
        continue

    # Store credentials for all platforms
    key_user = f"{platform.upper()}_USERNAME"
    key_pass = f"{platform.upper()}_PASSWORD"
    creds[key_user] = username
    creds[key_pass] = password
    print(f"  ✓ Saved\n")

# Save to .env
if creds:
    with open(env_file, "w") as f:
        f.write("# Credentials\n")
        for k, v in sorted(creds.items()):
            f.write(f"{k}={v}\n")

    print("="*70)
    print(f"✓ Saved to .env")
    print(f"✓ {len(creds)} credentials saved")
    print("="*70 + "\n")
else:
    print("No credentials added\n")
