"""
merch/connectors/printify.py -- Printify product creation.

Built as the fallback to Printful. The two vendors differ in four ways that
each have a failure mode, so this is not a copy of printful.py with the URL
swapped:

1. **Price is an integer of minor units, not a decimal string.** Printful
   takes "24.99"; Printify takes 2499. Sending 24.99 where cents are expected
   lists the product at 25 cents. This is the single most expensive mistake
   available in this file, so the conversion is one function with its own
   tests and rejects anything that would silently round.

2. **Everything is shop-scoped.** Products are created under
   /v1/shops/{shop_id}/products.json. An account with several shops has no
   default, so PRINTIFY_SHOP_ID is required, not optional.

3. **Artwork uploads first, separately.** POST /v1/uploads/images.json returns
   an image id, and the product references that id -- not the URL. Because
   that endpoint also accepts base64 `contents`, a **local raster file is
   submittable to Printify**, which is not true of Printful. Hence
   `accepts_local_upload = True`.

4. **blueprint_id + print_provider_id are required.** These identify the blank
   and who prints it. They are not derivable from a product type, so they are
   required arguments with no defaults -- a wrong blueprint prints the design
   on the wrong garment.

## Verification status

[Verified] Nothing. No PRINTIFY_API_KEY exists here, so no call below has been
run against a live account. The request shapes come from Printify's published
REST documentation and are [Likely]. As with Printful, a 2xx that does not
contain a recognisable product id is reported as a failure rather than as a
listing that may not exist.
"""

from __future__ import annotations

import base64
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

from ..artwork import ArtworkKind
from .base import MerchConnector, MerchPublishRequest, ConnectorResult

__all__ = [
    "PrintifyConnector",
    "PrintifyArtworkError",
    "PrintifyPriceError",
    "PRINTIFY_BASE_URL",
    "to_minor_units",
]

PRINTIFY_BASE_URL = "https://api.printify.com/v1"

REQUEST_TIMEOUT_SECONDS = 60
MAX_TITLE_LENGTH = 255

# Printify REQUIRES a User-Agent on every request and rejects those without
# one. Confirmed against developers.printify.com, not assumed -- the first
# draft of this connector omitted it and every live call would have failed.
USER_AGENT = "StoryForge2/1.0 (+empire-os)"

# Printify rejects uploads above this; catching it locally beats a 413.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


class PrintifyPriceError(ValueError):
    """A price could not be converted to minor units without losing money."""


class PrintifyArtworkError(ValueError):
    """The artwork cannot be packaged into an upload request."""


def to_minor_units(price: float | str | Decimal) -> int:
    """Convert a currency amount to integer minor units (cents).

    Uses Decimal rather than `int(price * 100)`. Most cent values are not
    exactly representable as floats, and multiplying then truncating loses a
    cent on 4.6% of them: `int(1.15 * 100)` is 114, `int(0.29 * 100)` is 28.
    A cent under on every sale of an affected price is a silent, permanent
    leak. (24.99 happens to be safe -- which is exactly why spot-checking one
    price is not evidence the approach is sound.)

    Raises rather than rounds when an amount has sub-cent precision. A price
    of 24.999 is a mistake somewhere upstream, and quietly turning it into
    2500 hides that.
    """
    try:
        amount = Decimal(str(price))
    except (InvalidOperation, ValueError) as exc:
        raise PrintifyPriceError(f"price is not a number: {price!r}") from exc

    if amount <= 0:
        raise PrintifyPriceError(f"price must be positive, got {price!r}")

    minor = amount * 100
    if minor != minor.to_integral_value():
        raise PrintifyPriceError(
            f"price {price!r} has sub-cent precision and cannot be converted "
            f"exactly; round it upstream rather than here"
        )
    return int(minor.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


class PrintifyConnector(MerchConnector):
    platform_id = "printify"
    name = "Printify"
    credential_env = ("PRINTIFY_API_KEY", "PRINTIFY_SHOP_ID")
    accepts_local_upload = True

    def __init__(self, base_url: str = PRINTIFY_BASE_URL):
        self.base_url = base_url.rstrip("/")

    # -- request building -------------------------------------------------

    def build_payload(self, request: MerchPublishRequest, blueprint_id: int,
                      print_provider_id: int, image_id: str,
                      print_position: str = "front") -> dict[str, Any]:
        """The exact JSON body that would be POSTed to create the product.

        `image_id` comes from a prior upload -- Printify references artwork by
        id, never by URL, so this cannot be built before the upload succeeds.
        """
        variant_ids = [_as_int(v.vendor_variant_id) for v in request.variants]

        variants = [
            {
                "id": _as_int(variant.vendor_variant_id),
                "price": to_minor_units(variant.price_for(request.retail_price)),
                "is_enabled": True,
            }
            for variant in request.variants
        ]

        return {
            "title": request.title[:MAX_TITLE_LENGTH],
            "description": request.description,
            "blueprint_id": blueprint_id,
            "print_provider_id": print_provider_id,
            "variants": variants,
            "print_areas": [
                {
                    "variant_ids": variant_ids,
                    "placeholders": [
                        {
                            "position": print_position,
                            "images": [
                                {"id": image_id, "x": 0.5, "y": 0.5,
                                 "scale": 1, "angle": 0},
                            ],
                        },
                    ],
                },
            ],
        }

    def build_upload_payload(self, request: MerchPublishRequest) -> dict[str, Any]:
        """The body for POST /uploads/images.json.

        Hosted artwork is sent by URL; a local file is sent as base64
        `contents`. Both are documented Printify inputs.
        """
        artwork = request.artwork
        file_name = _file_name_for(request, artwork.raw)

        if artwork.kind is ArtworkKind.LOCAL_FILE:
            path = Path(artwork.raw)
            raw_bytes = path.read_bytes()
            if len(raw_bytes) > MAX_UPLOAD_BYTES:
                raise PrintifyArtworkError(
                    f"artwork is {len(raw_bytes) / 1024 / 1024:.1f}MB, over "
                    f"Printify's {MAX_UPLOAD_BYTES // 1024 // 1024}MB upload limit"
                )
            return {
                "file_name": file_name,
                "contents": base64.b64encode(raw_bytes).decode("ascii"),
            }

        return {"file_name": file_name, "url": artwork.raw}

    # -- publish ----------------------------------------------------------

    def publish(self, request: MerchPublishRequest,
                credentials: Optional[dict[str, str]] = None,
                dry_run: bool = True,
                blueprint_id: Optional[int] = None,
                print_provider_id: Optional[int] = None,
                print_position: str = "front") -> ConnectorResult:
        """Upload the artwork, then create the product.

        `blueprint_id` and `print_provider_id` have no defaults on purpose --
        guessing either one prints the design on a garment nobody chose.
        """
        failure = self.preflight(request, credentials)
        if failure is not None:
            return failure

        if blueprint_id is None or print_provider_id is None:
            return self._failure(
                "Printify needs both blueprint_id and print_provider_id -- these "
                "identify the blank and its printer, and are not derivable from "
                "a product type. Read them from /catalog/blueprints.json.",
                "missing_catalog_ids",
            )

        try:
            prices = [
                to_minor_units(v.price_for(request.retail_price))
                for v in request.variants
            ]
        except PrintifyPriceError as exc:
            return self._failure(f"Printify: {exc}", "invalid_price")

        if dry_run:
            return self._success(
                f"[DRY_RUN] Would upload artwork then create '{request.title}' on "
                f"Printify: blueprint {blueprint_id}, provider "
                f"{print_provider_id}, {len(request.variants)} variant(s) at "
                f"{prices} minor units ({request.retail_price:.2f} major).",
                dry_run=True,
                upload=self._safe_upload_summary(request),
                prices_minor_units=prices,
                blueprint_id=blueprint_id,
                print_provider_id=print_provider_id,
            )

        try:
            import requests
        except ImportError:
            return self._failure(
                "requests not installed -- run: pip install requests",
                "missing_dependency",
            )

        headers = self._headers(credentials)
        shop_id = self._credential("PRINTIFY_SHOP_ID", credentials)

        upload = self._upload_artwork(request, headers, requests)
        if not upload.success:
            return upload
        image_id = upload.metadata["image_id"]

        payload = self.build_payload(
            request, blueprint_id, print_provider_id, image_id, print_position,
        )

        try:
            response = requests.post(
                f"{self.base_url}/shops/{shop_id}/products.json",
                headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printify product request failed after the artwork uploaded "
                f"(image {image_id} is now orphaned): {str(exc)[:200]}",
                "request_error", image_id=image_id,
            )

        return self._interpret_create_response(response, request, shop_id, image_id)

    def _headers(self, credentials: Optional[dict[str, str]]) -> dict[str, str]:
        """Headers for every Printify call.

        User-Agent is mandatory, not decorative -- Printify rejects requests
        without one.
        """
        return {
            "Authorization": f"Bearer {self._credential('PRINTIFY_API_KEY', credentials)}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        }

    # -- steps ------------------------------------------------------------

    def _upload_artwork(self, request: MerchPublishRequest, headers: dict[str, str],
                        requests: Any) -> ConnectorResult:
        try:
            payload = self.build_upload_payload(request)
        except PrintifyArtworkError as exc:
            return self._failure(f"Printify: {exc}", "artwork_rejected")
        except OSError as exc:
            return self._failure(
                f"Could not read artwork file: {str(exc)[:200]}", "artwork_unreadable",
            )

        try:
            response = requests.post(
                f"{self.base_url}/uploads/images.json",
                headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printify artwork upload failed: {str(exc)[:200]}", "upload_error",
            )

        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printify upload returned non-JSON (HTTP {response.status_code})",
                "bad_response",
            )

        if response.status_code not in (200, 201):
            return self._failure(
                f"Printify rejected the artwork (HTTP {response.status_code}): "
                f"{_error_text(body)}",
                "upload_failed",
            )

        image_id = body.get("id")
        if not image_id:
            return self._failure(
                f"Printify upload returned no image id -- not proceeding to "
                f"product creation. Body: {str(body)[:200]}",
                "no_image_id",
            )

        return self._success("artwork uploaded", image_id=image_id)

    def _interpret_create_response(self, response: Any, request: MerchPublishRequest,
                                   shop_id: str, image_id: str
                                   ) -> ConnectorResult:
        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printify returned non-JSON (HTTP {response.status_code}): "
                f"{response.text[:200]}",
                "bad_response", image_id=image_id,
            )

        if response.status_code not in (200, 201):
            return self._failure(
                f"Printify rejected the product (HTTP {response.status_code}): "
                f"{_error_text(body) or response.text[:200]}",
                "create_failed", image_id=image_id,
            )

        product_id = body.get("id")
        if not product_id:
            return self._failure(
                f"Printify returned HTTP {response.status_code} with no product "
                f"id -- not treating this as published. Body: {str(body)[:200]}",
                "no_product_id", image_id=image_id,
            )

        return self._success(
            f"Created '{request.title}' on Printify "
            f"({len(request.variants)} variant(s)). Product is a draft until "
            f"published to a sales channel.",
            listing_url=f"https://printify.com/app/store/products/{product_id}",
            product_id=product_id, image_id=image_id, shop_id=shop_id,
        )

    def _safe_upload_summary(self, request: MerchPublishRequest) -> dict[str, Any]:
        """Upload description for a dry run, without base64 in the output.

        A dry run gets read in a terminal; dumping a megabyte of base64 into
        it makes the actual result unreadable.
        """
        artwork = request.artwork
        if artwork.kind is ArtworkKind.LOCAL_FILE:
            path = Path(artwork.raw)
            size = path.stat().st_size if path.is_file() else 0
            return {"mode": "base64_contents", "file_name": path.name,
                    "bytes": size}
        return {"mode": "url", "url": artwork.raw}

    # -- catalogue --------------------------------------------------------

    def fetch_shops(self, credentials: Optional[dict[str, str]] = None
                    ) -> ConnectorResult:
        """List the shops on this account, to find PRINTIFY_SHOP_ID.

        Read-only, and the cheapest way to confirm a new API key works before
        anything is created. Only needs PRINTIFY_API_KEY -- the shop id is
        what this call is for, so requiring it would be circular.
        """
        if not self._credential("PRINTIFY_API_KEY", credentials):
            return self._failure(
                f"{self.name}: missing credentials: PRINTIFY_API_KEY",
                "missing_credentials",
            )

        try:
            import requests
        except ImportError:
            return self._failure(
                "requests not installed -- run: pip install requests",
                "missing_dependency",
            )

        try:
            response = requests.get(
                f"{self.base_url}/shops.json",
                headers=self._headers(credentials),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printify shops request failed: {str(exc)[:200]}", "request_error",
            )

        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printify returned non-JSON (HTTP {response.status_code})",
                "bad_response",
            )

        if response.status_code != 200:
            return self._failure(
                f"Printify shops lookup failed (HTTP {response.status_code}): "
                f"{_error_text(body)}",
                "shops_failed",
            )

        shops = body if isinstance(body, list) else body.get("data", [])
        return self._success(
            f"Found {len(shops)} shop(s). Set PRINTIFY_SHOP_ID to the id you want.",
            shops=[{"id": s.get("id"), "title": s.get("title"),
                    "channel": s.get("sales_channel")} for s in shops],
        )

    def fetch_blueprint_providers(self, blueprint_id: int,
                                  credentials: Optional[dict[str, str]] = None
                                  ) -> ConnectorResult:
        """List print providers for a blueprint, so provider ids are read
        rather than guessed. Always live -- nothing to dry-run."""
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

        try:
            response = requests.get(
                f"{self.base_url}/catalog/blueprints/{blueprint_id}/print_providers.json",
                headers=self._headers(credentials),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            return self._failure(
                f"Printify catalogue request failed: {str(exc)[:200]}", "request_error",
            )

        try:
            body = response.json()
        except ValueError:
            return self._failure(
                f"Printify returned non-JSON (HTTP {response.status_code})",
                "bad_response",
            )

        if response.status_code != 200:
            return self._failure(
                f"Printify catalogue lookup failed (HTTP {response.status_code}): "
                f"{_error_text(body)}",
                "catalog_failed",
            )

        providers = body if isinstance(body, list) else body.get("data", [])
        return self._success(
            f"Found {len(providers)} print provider(s) for blueprint {blueprint_id}.",
            providers=[{"id": p.get("id"), "title": p.get("title")}
                       for p in providers],
        )


def _file_name_for(request: MerchPublishRequest, raw: str) -> str:
    name = Path(raw).name if raw else ""
    if name and "." in name and not name.startswith("data:"):
        return name[:100]
    stem = (request.sku or request.title or "artwork").strip().replace(" ", "-")
    return f"{stem[:80]}.png"


def _as_int(value: str) -> Any:
    """Printify variant ids are numeric.

    A non-numeric id is passed through so the vendor names the bad value,
    rather than this connector coercing it into a valid-looking one.
    """
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return value


def _error_text(body: Any) -> str:
    if not isinstance(body, dict):
        return ""
    for key in ("message", "error"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value[:200]
        if isinstance(value, dict):
            return str(value)[:200]
    errors = body.get("errors")
    return str(errors)[:200] if errors else ""
