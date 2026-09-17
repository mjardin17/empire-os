"""
merch/artwork.py -- classify a Design's artwork for POD submission.

Print-on-demand vendors do not accept whatever a design tool happens to hold.
Printful, Printify and Gooten all fetch the print file from a **public HTTPS
URL** and all want a **raster** file (PNG/JPG) at print resolution. A design
stored as an inline SVG or a `data:` URI cannot be submitted, no matter how
correct it looks on screen.

MerchPulse stores exactly that: `artwork_url` is a `data:image/svg+xml` URI
and `svg_source` is the markup. So the gap between "design approved" and
"design submittable" is real and needs naming before a connector tries.

This module names it. It deliberately does **not** rasterise -- that needs a
real SVG renderer (cairosvg/resvg), which is a new dependency and a new class
of silent failure (a bad rasterisation still produces a file). Reporting the
gap honestly beats papering over it.

Confidence: the "raster only, fetched by URL" constraint is [Likely] -- it
matches all three vendors' published print-file guidance, but has not been
exercised against a live account here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

__all__ = [
    "ArtworkKind",
    "ArtworkSource",
    "MIN_PRINT_PIXELS",
    "RASTER_EXTENSIONS",
]

# Formats POD vendors accept as a print file.
RASTER_EXTENSIONS: frozenset[str] = frozenset({".png", ".jpg", ".jpeg"})
VECTOR_EXTENSIONS: frozenset[str] = frozenset({".svg", ".eps", ".ai", ".pdf"})

# Shortest acceptable edge for a garment print file. A 12x15in DTG area at
# 300 DPI is 3600x4500; 1500px is the floor below which no vendor will take it
# even for a small placement.
MIN_PRINT_PIXELS = 1500

_DATA_URI_RE = re.compile(r"^data:(?P<mime>[\w.+-]+/[\w.+-]+)?(?P<params>;[^,]*)?,", re.I)
_DIMENSIONS_RE = re.compile(r"^\s*(\d+)\s*[xX*]\s*(\d+)\s*$")

# The closing quote is required so a unit-suffixed value ("100mm") does not
# match as a bare pixel count. "px" is allowed because it IS pixels.
#
# The lookbehind rejects hyphenated attributes. `\b` does NOT: a hyphen is a
# non-word character, so `\bwidth` happily matches inside `stroke-width`, and
# a real export read as 12x1200 because its border was `stroke-width="12"`.
_SVG_DIM_RE = re.compile(
    r'(?<![\w-])(width|height)\s*=\s*["\'](\d+(?:\.\d+)?)(?:px)?["\']', re.I
)

# A Windows drive letter parses as a URL scheme -- "C:/art.png" comes back
# with scheme "c" -- so it must be recognised before urlparse is trusted.
_WINDOWS_PATH_RE = re.compile(r"^[a-zA-Z]:[\\/]")


class ArtworkKind(Enum):
    """What the artwork actually is, as opposed to what it is called."""

    HOSTED_RASTER = "hosted_raster"
    # https URL to a PNG/JPG. The only kind a POD vendor can consume directly.

    HOSTED_VECTOR = "hosted_vector"
    # https URL to an SVG/EPS/AI. Fetchable, but rejected as a print file.

    DATA_URI = "data_uri"
    # Embedded in the record. Never fetchable by a vendor -- must be written
    # out and hosted first.

    LOCAL_FILE = "local_file"
    # A path on this machine. Must be uploaded somewhere public first.

    INLINE_MARKUP = "inline_markup"
    # Raw SVG markup with no URL at all.

    MISSING = "missing"
    # No artwork on the record.

    UNKNOWN = "unknown"
    # Present but unrecognisable -- treated as unusable rather than assumed ok.


@dataclass(frozen=True)
class ArtworkSource:
    """A Design's artwork, classified for POD submission."""

    kind: ArtworkKind
    raw: str = ""
    mime: str = ""
    declared_dimensions: Optional[tuple[int, int]] = None
    intrinsic_dimensions: Optional[tuple[int, int]] = None

    # -- construction -----------------------------------------------------

    @classmethod
    def from_design(cls, design: dict[str, Any]) -> "ArtworkSource":
        """Classify a MerchPulse Design record.

        Prefers `artwork_url`; falls back to `svg_source` when there is no URL.
        """
        declared = _parse_dimensions(design.get("dimensions"))
        url = (design.get("artwork_url") or "").strip()
        svg = (design.get("svg_source") or "").strip()

        if url:
            source = cls.from_url(url)
        elif svg:
            source = cls(
                kind=ArtworkKind.INLINE_MARKUP,
                raw=svg,
                mime="image/svg+xml",
                intrinsic_dimensions=_svg_dimensions(svg),
            )
        else:
            return cls(kind=ArtworkKind.MISSING, declared_dimensions=declared)

        intrinsic = source.intrinsic_dimensions
        if intrinsic is None and svg:
            intrinsic = _svg_dimensions(svg)

        return cls(
            kind=source.kind,
            raw=source.raw,
            mime=source.mime,
            declared_dimensions=declared,
            intrinsic_dimensions=intrinsic,
        )

    @classmethod
    def from_url(cls, url: str) -> "ArtworkSource":
        url = url.strip()
        if not url:
            return cls(kind=ArtworkKind.MISSING)

        data_match = _DATA_URI_RE.match(url)
        if data_match:
            mime = (data_match.group("mime") or "").lower()
            payload = url[data_match.end():]
            intrinsic = _svg_dimensions(payload) if "svg" in mime else None
            return cls(
                kind=ArtworkKind.DATA_URI, raw=url, mime=mime,
                intrinsic_dimensions=intrinsic,
            )

        if _WINDOWS_PATH_RE.match(url) or url.startswith(("\\\\", "/", "./", "../")):
            return cls(kind=ArtworkKind.LOCAL_FILE, raw=url,
                       mime=_mime_for(Path(url).suffix.lower()))

        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            ext = Path(parsed.path).suffix.lower()
            if ext in RASTER_EXTENSIONS:
                return cls(kind=ArtworkKind.HOSTED_RASTER, raw=url, mime=_mime_for(ext))
            if ext in VECTOR_EXTENSIONS:
                return cls(kind=ArtworkKind.HOSTED_VECTOR, raw=url, mime=_mime_for(ext))
            return cls(kind=ArtworkKind.UNKNOWN, raw=url)

        if parsed.scheme in ("file", "") and Path(url).suffix:
            return cls(kind=ArtworkKind.LOCAL_FILE, raw=url,
                       mime=_mime_for(Path(url).suffix.lower()))

        return cls(kind=ArtworkKind.UNKNOWN, raw=url)

    # -- assessment -------------------------------------------------------

    @property
    def is_https(self) -> bool:
        return urlparse(self.raw).scheme == "https"

    @property
    def is_raster(self) -> bool:
        """Whether the underlying file is a raster image.

        Independent of where it lives -- a local PNG is raster, a hosted SVG
        is not. Vendors reject on format regardless of transport.
        """
        return self.mime in ("image/png", "image/jpeg")

    def is_pod_ready(self, allow_local_upload: bool = False) -> tuple[bool, str]:
        """Whether a POD vendor could print this as-is.

        Returns (ok, reason). The reason states what must happen next, not
        just that something is wrong.

        `allow_local_upload` reflects a real capability split: Printify takes
        base64 file contents, so a local raster file is submittable to it.
        Printful only fetches by URL, so the same file is not submittable
        there. Defaulting to False keeps the stricter answer the default.
        """
        if self.kind is ArtworkKind.MISSING:
            return False, "design has no artwork"

        if self.kind is ArtworkKind.DATA_URI:
            return False, (
                "artwork is an embedded data: URI -- vendors fetch print files "
                "over HTTPS, so it must be written to a file and hosted first"
            )

        if self.kind is ArtworkKind.INLINE_MARKUP:
            return False, (
                "artwork exists only as inline SVG markup -- it must be "
                "rasterised to PNG and hosted before submission"
            )

        if self.kind is ArtworkKind.LOCAL_FILE:
            if not allow_local_upload:
                return False, (
                    "artwork is a local file -- this vendor pulls by URL, so it "
                    "must be uploaded to public storage first"
                )
            if not self.is_raster:
                return False, (
                    f"artwork is a local vector file ({self.mime or 'unknown'}) -- "
                    f"print files must be raster PNG/JPG even when uploaded directly"
                )
            if not Path(self.raw).is_file():
                return False, f"artwork file does not exist: {self.raw}"
            undersized = self.resolution_problem()
            return (False, undersized) if undersized else (True, "ok")

        if self.kind is ArtworkKind.HOSTED_VECTOR:
            return False, (
                f"artwork is vector ({self.mime or 'svg'}) -- POD print files "
                f"must be raster PNG/JPG"
            )

        if self.kind is ArtworkKind.UNKNOWN:
            return False, "artwork format is unrecognised, so it cannot be assumed printable"

        if not self.is_https:
            return False, "artwork URL is not HTTPS -- vendors reject plain-HTTP print files"

        too_small = self.resolution_problem()
        if too_small:
            return False, too_small

        return True, "ok"

    def resolution_problem(self) -> Optional[str]:
        """Resolution complaint, if the artwork's real size is known.

        Only intrinsic dimensions count. `declared_dimensions` is a claim the
        record makes about itself and is not evidence.
        """
        if self.intrinsic_dimensions is None:
            return None
        width, height = self.intrinsic_dimensions
        if min(width, height) < MIN_PRINT_PIXELS:
            return (
                f"artwork is {width}x{height}px, below the {MIN_PRINT_PIXELS}px "
                f"minimum edge for a print file"
            )
        return None

    def dimension_discrepancy(self) -> Optional[str]:
        """Where the record's claimed size disagrees with the real artwork.

        MerchPulse stores `dimensions` as free text set at design time; nothing
        recomputes it from the asset, so it can claim print resolution the file
        does not have.
        """
        if self.declared_dimensions is None or self.intrinsic_dimensions is None:
            return None
        if self.declared_dimensions == self.intrinsic_dimensions:
            return None
        dw, dh = self.declared_dimensions
        iw, ih = self.intrinsic_dimensions
        return (
            f"record claims {dw}x{dh} but the artwork is {iw}x{ih} -- "
            f"the declared size is unverified metadata, not the asset"
        )

    def warnings(self, allow_local_upload: bool = False) -> list[str]:
        out: list[str] = []
        ok, reason = self.is_pod_ready(allow_local_upload=allow_local_upload)
        if not ok:
            out.append(reason)
        discrepancy = self.dimension_discrepancy()
        if discrepancy:
            out.append(discrepancy)
        return out


def _mime_for(ext: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".eps": "application/postscript",
        ".ai": "application/postscript",
        ".pdf": "application/pdf",
    }.get(ext, "")


def _parse_dimensions(value: Any) -> Optional[tuple[int, int]]:
    if not isinstance(value, str):
        return None
    match = _DIMENSIONS_RE.match(value)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def _svg_dimensions(markup: str) -> Optional[tuple[int, int]]:
    """Read width/height off SVG markup.

    Percentage or unit-suffixed values are ignored rather than guessed at --
    an unknown size is more useful than a wrong one.
    """
    found = {name.lower(): value for name, value in _SVG_DIM_RE.findall(markup)}
    if "width" in found and "height" in found:
        try:
            return int(float(found["width"])), int(float(found["height"]))
        except ValueError:
            return None
    return None
