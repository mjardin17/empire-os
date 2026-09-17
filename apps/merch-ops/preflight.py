"""
merch/preflight.py -- read-only credential and connectivity check.

Answers one question before anything is created: do these credentials work,
and what does the vendor say this account actually has?

**Every call here is a GET.** Nothing is created, updated, or published. This
is safe to run against a live account with a freshly minted token, which is
the point -- the first contact with a real API should not be a write.

    python -m merch.preflight
    python -m merch.preflight --blueprint 384

Credential values are never printed. Presence and length only, so a truncated
paste is visible without the secret reaching a terminal or a log.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

__all__ = ["load_env_file", "credential_report", "check_printify", "main"]

PLACEHOLDER_PREFIXES = ("your", "<", "xxx", "changeme", "todo", "replace")


def load_env_file(path: str | Path = ".env") -> dict[str, str]:
    """Parse a .env file into a dict without overwriting the real environment.

    Deliberately does not use python-dotenv: this is a dozen lines and avoids
    adding a dependency for one read.
    """
    env_path = Path(path)
    if not env_path.is_file():
        return {}

    values: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def credential_report(names: tuple[str, ...], env: dict[str, str]) -> list[str]:
    """Presence and shape of each credential. Never the value."""
    lines: list[str] = []
    for name in names:
        value = env.get(name) or os.environ.get(name, "")
        if not value:
            lines.append(f"  {name:22} MISSING")
        elif value.lower().startswith(PLACEHOLDER_PREFIXES):
            lines.append(f"  {name:22} PLACEHOLDER -- still the template value")
        else:
            lines.append(f"  {name:22} present ({len(value)} chars)")
    return lines


def check_printify(env: dict[str, str], blueprint_id: Optional[int] = None) -> int:
    """Verify a Printify token with read-only calls. Returns an exit code."""
    from .connectors import PrintifyConnector

    print("Printify")
    print("\n".join(credential_report(("PRINTIFY_API_KEY", "PRINTIFY_SHOP_ID"), env)))
    print()

    api_key = env.get("PRINTIFY_API_KEY") or os.environ.get("PRINTIFY_API_KEY", "")
    if not api_key:
        print("  Cannot check connectivity without PRINTIFY_API_KEY.")
        print("  Get one at https://printify.com/app/account/api")
        print("  (My Profile -> Connections; the token is shown only once.)")
        return 1

    connector = PrintifyConnector()
    credentials = {"PRINTIFY_API_KEY": api_key}

    print("  GET /v1/shops.json ...")
    result = connector.fetch_shops(credentials=credentials)
    if not result.success:
        print(f"  FAILED [{result.error_code}] {result.message}")
        return 1

    shops = result.metadata.get("shops", [])
    print(f"  OK -- {result.message}")
    for shop in shops:
        print(f"      id={shop['id']}  {shop.get('title') or '<untitled>'}"
              f"  channel={shop.get('channel') or '?'}")

    configured = env.get("PRINTIFY_SHOP_ID") or os.environ.get("PRINTIFY_SHOP_ID", "")
    if shops and not configured:
        print()
        print(f"  Next: add to .env ->  PRINTIFY_SHOP_ID={shops[0]['id']}")
    elif configured and shops:
        known = {str(s["id"]) for s in shops}
        if str(configured) not in known:
            print()
            print(f"  WARNING: PRINTIFY_SHOP_ID={configured} is not one of this "
                  f"account's shops ({', '.join(sorted(known))}).")
            return 1

    if blueprint_id is not None:
        print()
        print(f"  GET /v1/catalog/blueprints/{blueprint_id}/print_providers.json ...")
        providers = connector.fetch_blueprint_providers(blueprint_id, credentials)
        if not providers.success:
            print(f"  FAILED [{providers.error_code}] {providers.message}")
            return 1
        print(f"  OK -- {providers.message}")
        for provider in providers.metadata.get("providers", []):
            print(f"      print_provider_id={provider['id']}  {provider.get('title')}")

    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only credential + connectivity check for merch vendors. "
                    "Creates nothing.",
    )
    parser.add_argument("--env", default=".env", help="path to the .env file")
    parser.add_argument(
        "--blueprint", type=int, default=None,
        help="also list print providers for this Printify blueprint id",
    )
    args = parser.parse_args(argv)

    env = load_env_file(args.env)
    print(f"Reading credentials from {args.env} "
          f"({'found' if env else 'not found or empty'})")
    print()
    return check_printify(env, blueprint_id=args.blueprint)


if __name__ == "__main__":
    sys.exit(main())
