"""
merch/connectors/printful.py -- Printful product creation.

Printful is the one merch channel with a real API where a design could
actually be listed today, which is why it is built first.

Credentials: PRINTFUL_API_KEY (Bearer token). PRINTFUL_STORE_ID is optional
and only needed on accounts with more than one store -- Printful rejects an
ambiguous request rather than guessing, so this connector passes the header
through when set.

## What is verified and what is not

[Verified] Nothing against a live account. No API key exists here yet, so no
call in this file has been exercised. Everything below is written from
Printful's published REST documentation.

[Likely] The shape used:
  - POST {base}/store/products with {"sync_product": {...}, "sync_variants": [...]}
  - Auth via `Authorization: Bearer <key>`
  - Multi-store accounts disambiguated by `X-PF-Store-Id`
  - Print files referenced by public URL in each variant's `files` array
  - `variant_id` is a Printful **catalogue** variant id, not a name

Because it is unverified, `publish()` treats an unexpected response as a
failure with the vendor's own text attached, rather than reporting success on
a 2xx it did not actually understand.

## Catalogue ids are never guessed

`variant_id` values are per-blank and not derivable from a size label. This
connector will not map "L" to an id. Use `fetch_catalog_variants()` to read
them from Printful, or supply them from the dashboard.
"""

from __future__ import annotations

from typing import Any, Optional

from ..artwork import ArtworkSource
from .base import MerchConnector, MerchPublishRequest, ConnectorResult

__all__ = ["PrintfulConnector", "PRINTFUL_BASE_URL"]

PRINTFUL_BASE_URL = "https://api.printful.com"

# Printful applies its own limits; these are the documented ones worth
# catching locally rather than as a 400.
MAX_NAME_LENGTH = 255
REQUEST_TIMEOUT_SECONDS = 60


class PrintfulConnector(MerchConnector):
    platform_id = "printful"
    name = "Printful"
    credential_env = ("PRINTFUL_API_KEY",)

    def __init__(self, base_url: str = PRINTFUL_BASE_URL):
        self.base_url = base_url.rstrip("/")

    # -- request building -------------------------------------------------

    def build_payload(self, request: MerchPublishRequest) -> dict[str, Any]:
        """The exact JSON body that would be POSTed.

        Split out from `publish()` so a dry run can show the real payload and
        a test can assert on it without a network call.
        """
        artwork_url = request.artwork.raw
        sync_product: dict[str, Any] = {"name": request.title[:MAX_NAME_LENGTH]}
        if request.external_id:
            sync_product["external_id"] = request.external_id
        if artwork_url:
            sync_product["thumbnail"] = artwork_url

        sync_variants = [
            {
                "variant_id": _as_int(variant.vendor_variant_id),
                "retail_price": f"{variant.price_for(request.retail_price):.2f}",
                "files": [{"type": "default", "url": artwork_url}],
                **({"sku": request.sku} if request.sku else {}),
            }
            for variant in request.variants
        ]

        return {"sync_product": sync_product, "sync_variants": sync_variants}

    # -- publish ----------------------------------------------------------

    def publish(self, request: MerchPublishRequest,
                credentials: Optional[dict[str, str]] = None,
                dry_run: bool = True) -> ConnectorResult:
        failure = self.preflight(request, credentials)
        if failure is not None:
            return failure

        payload = self.build_payload(request)

        if dry_run:
            return self._success(
                f"[DRY_RUN] Would create '{request.title}' on Printful with "
                f"{len(request.variants)} variant(s) at "
                f"{request.retail_price:.2f}, printing "
                f"{request.artwork.raw[:80]}",
                payload=payload,
                dry_run=True,
            )

        try:
            import requests
        except ImportError:
            return self._failure(
                "requests not installed -- run: pip install requests",
                "missing_dependency",
            )

        api_key = self._credential("PRINTFUL_API_KEY", credentials)
        store_id = self._credential("PRINTFUL_STORE_ID", credentials)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if store_id:
            headers["X-PF-Store-Id"] = store_id

        try:
            response = requests.post(
                f"{self.base_url}/store/products",
                headers=headers, json=payload,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printful request failed: {str(exc)[:200]}", "request_error",
            )

        return self._interpret_create_response(response, request)

    def _interpret_create_response(self, response: Any, request: MerchPublishRequest
                                   ) -> ConnectorResult:
        """Read Printful's response without assuming a 2xx means success.

        Printful returns its own `code` inside the body. A transport-level 200
        carrying an error body would otherwise be recorded as a live listing
        that does not exist.
        """
        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printful returned non-JSON (HTTP {response.status_code}): "
                f"{response.text[:200]}",
                "bad_response",
            )

        if response.status_code not in (200, 201):
            return self._failure(
                f"Printful rejected the product (HTTP {response.status_code}): "
                f"{_error_text(body) or response.text[:200]}",
                "create_failed",
            )

        result = body.get("result")
        if not isinstance(result, dict):
            return self._failure(
                f"Printful returned HTTP {response.status_code} with no product "
                f"in `result` -- not treating this as published. Body: {str(body)[:200]}",
                "unexpected_response",
            )

        product_id = result.get("id")
        if product_id is None:
            return self._failure(
                f"Printful response had no product id -- cannot confirm the "
                f"listing exists. Body: {str(body)[:200]}",
                "no_product_id",
            )

        return self._success(
            f"Created '{request.title}' on Printful "
            f"({len(request.variants)} variant(s)).",
            listing_url=f"https://www.printful.com/dashboard/sync/{product_id}",
            product_id=product_id,
            external_id=result.get("external_id"),
        )

    # -- catalogue --------------------------------------------------------

    def fetch_catalog_variants(self, printful_product_id: int,
                               credentials: Optional[dict[str, str]] = None
                               ) -> ConnectorResult:
        """Read the catalogue variants for one Printful blank.

        Exists so variant ids come from Printful rather than from a hardcoded
        guess. Always a live call -- there is nothing to dry-run.
        """
        missing = self.missing_credentials(credentials)
        if missing:
            return self._failure(
                f"{self.name}: missing credentials: {', '.join(missing)}",
                "missing_credentials",
            )

        try:
            import requests
        except ImportError:
            return self._failure(
                "requests not installed -- run: pip install requests",
                "missing_dependency",
            )

        api_key = self._credential("PRINTFUL_API_KEY", credentials)
        try:
            response = requests.get(
                f"{self.base_url}/products/{printful_product_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printful catalogue request failed: {str(exc)[:200]}",
                "request_error",
            )

        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printful returned non-JSON (HTTP {response.status_code})",
                "bad_response",
            )

        if response.status_code != 200:
            return self._failure(
                f"Printful catalogue lookup failed (HTTP {response.status_code}): "
                f"{_error_text(body) or ''}",
                "catalog_failed",
            )

        variants = (body.get("result") or {}).get("variants") or []
        return self._success(
            f"Found {len(variants)} catalogue variant(s) for product "
            f"{printful_product_id}.",
            variants=[
                {
                    "id": v.get("id"),
                    "size": v.get("size"),
                    "color": v.get("color"),
                    "price": v.get("price"),
                }
                for v in variants
            ],
        )


def _as_int(value: str) -> Any:
    """Printful wants a numeric variant_id.

    A non-numeric id is passed through untouched so the vendor's own error
    names the bad value, rather than this connector silently coercing it to
    something that prints on the wrong garment.
    """
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return value


def _error_text(body: Any) -> str:
    if not isinstance(body, dict):
        return ""
    error = body.get("error")
    if isinstance(error, dict):
        return str(error.get("message", ""))[:200]
    if isinstance(error, str):
        return error[:200]
    return str(body.get("result", ""))[:200] if body.get("code") else ""
