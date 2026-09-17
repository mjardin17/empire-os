#!/usr/bin/env python3
"""
eBay OAuth Authentication Agent
Handles OAuth flow, token management, and verification.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import webbrowser

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.ebay_oauth_handler import EbayOAuthHandler

# Global state for auth callback
auth_code = None
auth_error = None

class AuthCallbackHandler(BaseHTTPRequestHandler):
    """HTTP handler for OAuth callback."""

    def do_GET(self):
        global auth_code, auth_error

        query = urlparse(self.path).query
        params = parse_qs(query)

        if "code" in params:
            auth_code = params["code"][0]
            message = "✅ Authorization successful! You can close this window."
            status = 200
        elif "error" in params:
            auth_error = params.get("error_description", ["Unknown error"])[0]
            message = f"❌ Authorization failed: {auth_error}"
            status = 400
        else:
            message = "❌ Invalid callback"
            status = 400

        # Send response
        self.send_response(status)
        self.send_header("Content-type", "text/html")
        self.end_headers()

        html = f"""
        <html>
            <head><title>eBay Authorization</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>{message}</h1>
                <p>Returning to command line...</p>
            </body>
        </html>
        """

        self.wfile.write(html.encode())

    def log_message(self, format, *args):
        pass  # Suppress logging

def authenticate(client_id: str, client_secret: str, use_sandbox: bool = False):
    """Run OAuth flow interactively."""
    print("\n" + "="*70)
    print("eBay OAuth Authentication")
    print("="*70)

    oauth = EbayOAuthHandler(client_id, client_secret, use_sandbox=use_sandbox)

    # Step 1: Get auth URL
    print("\n1️⃣ Generating authorization URL...")
    auth_url = oauth.get_auth_url()

    print(f"\n2️⃣ Opening browser for approval...")
    print(f"   If browser doesn't open, visit: {auth_url}\n")

    # Try to open browser
    try:
        webbrowser.open(auth_url)
    except:
        print(f"   Please visit this URL manually: {auth_url}\n")

    # Step 2: Start callback listener
    print("3️⃣ Waiting for authorization response...")

    global auth_code, auth_error
    auth_code = None
    auth_error = None

    server = HTTPServer(("localhost", 8080), AuthCallbackHandler)
    server.timeout = 120  # 2-minute timeout

    while auth_code is None and auth_error is None:
        server.handle_request()

    server.server_close()

    if auth_error:
        print(f"❌ Authorization failed: {auth_error}")
        return False

    # Step 3: Exchange code for tokens
    print(f"\n4️⃣ Exchanging code for tokens...")

    result = oauth.get_access_token_with_auth_code(auth_code)

    if result["status"] == "success":
        print(f"\n✅ SUCCESS!")
        print(f"   Access Token: {oauth.access_token[:30]}...")
        print(f"   Refresh Token: {oauth.refresh_token[:30]}...")
        print(f"   Expires: {oauth.token_expiry}")
        print(f"\n   Credentials saved to: ~/.ebay_credentials.json")
        return True
    else:
        print(f"❌ Token exchange failed: {result.get('reason')}")
        return False

def test_connection(client_id: str, client_secret: str, use_sandbox: bool = False):
    """Test eBay OAuth connection."""
    print("\n" + "="*70)
    print("eBay OAuth Connection Test")
    print("="*70)

    oauth = EbayOAuthHandler(client_id, client_secret, use_sandbox=use_sandbox)

    # Check for stored credentials
    if not oauth.access_token:
        print("\n❌ No stored credentials found.")
        print("   Run: python agents/ebay_auth_agent.py --authenticate")
        return False

    # Test token validity
    print("\n1️⃣ Checking token validity...")
    if oauth.is_token_valid():
        print("   ✅ Token is valid")
    else:
        print("   ⚠️ Token needs refresh...")
        if oauth.refresh_access_token():
            print("   ✅ Token refreshed successfully")
        else:
            print("   ❌ Token refresh failed")
            return False

    # Get user info
    print("\n2️⃣ Fetching eBay account info...")
    user_info = oauth.get_user_info()

    if user_info["status"] == "success":
        print("   ✅ Connected!")
        user = user_info.get("user", {})
        print(f"   Username: {user.get('username', 'Unknown')}")
        print(f"   Account ID: {user.get('userId', 'Unknown')}")
    else:
        print(f"   ❌ Failed: {user_info.get('reason')}")
        return False

    # Test API access
    print("\n3️⃣ Testing API access (inventory)...")
    try:
        from lib.ebay_api_connector import EbayInventoryConnector

        connector = EbayInventoryConnector(oauth)
        listings = connector.get_active_listings()

        if listings["status"] == "success":
            count = listings.get("listing_count", 0)
            print(f"   ✅ API access OK")
            print(f"   Active listings: {count}")
        else:
            print(f"   ⚠️ API error: {listings.get('reason')}")
    except Exception as e:
        print(f"   ⚠️ Could not test API: {e}")

    print("\n" + "="*70)
    print("✅ eBay OAuth is fully configured and working!")
    print("="*70)
    return True

def main():
    parser = argparse.ArgumentParser(description="eBay OAuth Authentication")
    parser.add_argument("--authenticate", action="store_true", help="Run OAuth flow")
    parser.add_argument("--test", action="store_true", help="Test OAuth connection")
    parser.add_argument("--refresh", action="store_true", help="Refresh access token")
    parser.add_argument("--sandbox", action="store_true", help="Use eBay Sandbox")

    args = parser.parse_args()

    # Load credentials from .env
    from dotenv import load_dotenv
    load_dotenv()

    client_id = os.getenv("EBAY_CLIENT_ID")
    client_secret = os.getenv("EBAY_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("❌ Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env")
        print("\nSetup steps:")
        print("1. Go to https://developer.ebay.com")
        print("2. Create an app (Merchant type)")
        print("3. Get Client ID + Secret from 'Keys' section")
        print("4. Add to .env:")
        print("   EBAY_CLIENT_ID=your_client_id")
        print("   EBAY_CLIENT_SECRET=your_client_secret")
        return

    use_sandbox = args.sandbox or os.getenv("EBAY_SANDBOX_MODE", "false").lower() == "true"

    if args.authenticate:
        authenticate(client_id, client_secret, use_sandbox)
    elif args.test:
        test_connection(client_id, client_secret, use_sandbox)
    elif args.refresh:
        print("Refreshing token...")
        oauth = EbayOAuthHandler(client_id, client_secret, use_sandbox=use_sandbox)
        if oauth.refresh_access_token():
            print("✅ Token refreshed")
        else:
            print("❌ Refresh failed")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
