"""
merch/rasterize.py -- SVG to print-ready PNG.

This is the step that unblocks everything else: every POD vendor wants a
raster file, and MerchPulse stores designs as SVG. Without this, no design in
an export can be listed anywhere.

## Why the output is verified, not trusted

A rasteriser that silently produces a blank canvas, or one at the wrong size,
returns success and writes a real PNG. Nothing downstream can tell the
difference until a customer receives a blank shirt. So `rasterize_svg`
re-opens what it wrote and checks dimensions, file size, and whether anything
was actually drawn, and returns that evidence on the result.

## Backend

svglib parses the SVG, reportlab's renderPM rasterises it, and renderPM needs
a native backend -- rlPyCairo here. All three are optional imports: this
module is importable without them and reports a clear install line instead of
an ImportError from three frames down.

Verified working on this machine: the real MerchPulse design rasterised to
4500x4500 with 254 distinct colours.

## Known limitation: no alpha

**This backend cannot produce transparent PNGs.** Probed directly -- default
gives a white background, `bg=None` gives black, and `configPIL
{'transparent': 1}` is ignored. Output is always RGB.

That is a real POD hazard, not a cosmetic one: a print file with a white
background prints a **white rectangle** on a coloured garment. So:

- `background` is an explicit argument with no silent default behaviour, and
  the result carries `has_uniform_border` so a caller can see it is there.
- `transparent_from` is opt-in chroma-keying and reports exactly how many
  pixels it removed, because knocking out a colour that also appears inside
  the artwork destroys the design while still producing a plausible file.

A design that genuinely needs alpha (most text-only designs do) needs a
renderer that supports it. Do not work around this by guessing.
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

__all__ = [
    "RasterError",
    "RasterResult",
    "rasterize_svg",
    "rasterize_design",
    "backend_available",
    "DEFAULT_PRINT_WIDTH",
]

# A 12x15in DTG area at 300 DPI. Used only when a caller gives no target.
DEFAULT_PRINT_WIDTH = 4500

INSTALL_HINT = "pip install svglib rlPyCairo"

# Below this many distinct colours the render is treated as empty. Two allows
# for a shape on a background; one is a flat canvas and nothing else.
MIN_DISTINCT_COLOURS = 2

# Colour counting stops here. The check only needs "more than one", and an
# exact count on a 20-megapixel file costs seconds and gigabytes for nothing.
MAX_COLOURS_COUNTED = 4096


class RasterError(Exception):
    """Rasterisation failed, or produced output that failed verification."""


@dataclass(frozen=True)
class RasterResult:
    """A rasterised print file plus the evidence it is usable."""

    path: Path
    width: int
    height: int
    file_bytes: int
    distinct_colours: int
    luminance_range: tuple[int, int]
    background: str
    transparent_pixels: int = 0
    colours_capped: bool = False
    # True when the image has more distinct colours than the counter looked
    # at, so `distinct_colours` is a floor rather than an exact figure.

    @property
    def is_blank(self) -> bool:
        """A single flat colour means nothing drew."""
        return (
            self.distinct_colours < MIN_DISTINCT_COLOURS
            or self.luminance_range[0] == self.luminance_range[1]
        )

    def warnings(self) -> list[str]:
        out: list[str] = []
        if self.transparent_pixels:
            out.append(
                f"chroma-key removed {self.transparent_pixels:,} pixels -- confirm "
                f"that colour did not also appear inside the artwork"
            )
        return out

    def __str__(self) -> str:
        return (
            f"{self.path.name}: {self.width}x{self.height}, "
            f"{self.file_bytes / 1024:.0f}KB, {self.distinct_colours} colours"
        )


def backend_available() -> tuple[bool, str]:
    """Whether the rasterisation stack is importable.

    Returns (ok, detail) so a caller can report the install line rather than
    surfacing an ImportError from inside a dependency.
    """
    try:
        from svglib.svglib import svg2rlg  # noqa: F401
    except ImportError:
        return False, f"svglib is not installed -- {INSTALL_HINT}"
    try:
        from reportlab.graphics import renderPM  # noqa: F401
    except ImportError:
        return False, f"reportlab is not installed -- {INSTALL_HINT}"
    try:
        import rlPyCairo  # noqa: F401
    except ImportError:
        return False, (
            f"renderPM has no native backend -- {INSTALL_HINT} "
            f"(reportlab alone cannot rasterise)"
        )
    return True, "ok"


def rasterize_svg(
    svg: str,
    out_path: str | Path,
    target_width: int = DEFAULT_PRINT_WIDTH,
    target_height: Optional[int] = None,
    background: str = "white",
    transparent_from: Optional[str] = None,
) -> RasterResult:
    """Rasterise SVG markup (or a path to an .svg file) to a PNG.

    Aspect ratio is always preserved. When both dimensions are given and the
    aspect differs, the artwork is scaled to fit and centred on a canvas of
    `background` -- stretching a design to fill a print area distorts it, and
    a distorted design still looks like a successful render.

    Raises RasterError rather than returning a bad file, because every caller
    downstream would otherwise have to re-check the same things.
    """
    ok, detail = backend_available()
    if not ok:
        raise RasterError(detail)

    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    from PIL import Image

    if target_width <= 0 or (target_height is not None and target_height <= 0):
        raise RasterError(
            f"target dimensions must be positive, got {target_width}x{target_height}"
        )

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    drawing = _parse_svg(svg, svg2rlg)
    if drawing is None:
        raise RasterError("SVG could not be parsed into a drawing")
    if not drawing.width or not drawing.height:
        raise RasterError(
            f"SVG has no usable size ({drawing.width}x{drawing.height}) -- it "
            f"likely declares only a viewBox with percentage width/height"
        )

    # Scale to fit the target box, preserving aspect.
    scale = target_width / drawing.width
    if target_height is not None:
        scale = min(scale, target_height / drawing.height)

    drawing.width *= scale
    drawing.height *= scale
    drawing.scale(scale, scale)

    try:
        renderPM.drawToFile(drawing, str(out_path), fmt="PNG")
    except Exception as exc:  # renderPM raises several unrelated types
        raise RasterError(f"rasterisation failed: {type(exc).__name__}: {exc}") from exc

    if not out_path.is_file():
        raise RasterError(f"rasteriser reported success but wrote no file: {out_path}")

    image = Image.open(out_path)
    image.load()

    if target_height is not None and image.size != (target_width, target_height):
        image = _pad_to_canvas(image, target_width, target_height, background, Image)
        image.save(out_path, "PNG")

    transparent_pixels = 0
    if transparent_from is not None:
        image, transparent_pixels = _chroma_key(image, transparent_from, Image)
        image.save(out_path, "PNG")

    return _verify(out_path, image, background, transparent_pixels)


def rasterize_design(
    design: dict,
    out_path: str | Path,
    target_width: int = DEFAULT_PRINT_WIDTH,
    target_height: Optional[int] = None,
    background: str = "white",
    transparent_from: Optional[str] = None,
) -> RasterResult:
    """Rasterise a MerchPulse Design record.

    Uses `svg_source`. The `artwork_url` data: URI holds the same markup, but
    the raw field needs no unquoting and cannot be truncated by a URI length
    limit somewhere upstream.
    """
    svg = (design.get("svg_source") or "").strip()
    if not svg:
        raise RasterError(
            f"design {design.get('id', '<no id>')} has no svg_source to rasterise"
        )
    return rasterize_svg(
        svg, out_path, target_width=target_width, target_height=target_height,
        background=background, transparent_from=transparent_from,
    )


# -- internals -------------------------------------------------------------


def _parse_svg(svg: str, svg2rlg):
    """svglib reads from a path, so inline markup goes through a temp file."""
    candidate = svg.strip()
    if candidate.lower().endswith(".svg") and Path(candidate).is_file():
        return svg2rlg(candidate)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir) / "input.svg"
        tmp.write_text(candidate, encoding="utf-8")
        return svg2rlg(str(tmp))


def _pad_to_canvas(image, width: int, height: int, background: str, Image):
    """Centre the artwork on an exact-size canvas rather than stretching it."""
    canvas = Image.new("RGB", (width, height), background)
    offset = ((width - image.width) // 2, (height - image.height) // 2)
    canvas.paste(image.convert("RGB"), offset)
    return canvas


def _chroma_key(image, colour: str, Image) -> tuple[object, int]:
    """Make one exact colour transparent, and count what was removed.

    Done with band masks rather than a Python loop over pixels: a 4500x4500
    print file is 20 million pixels, and iterating them in Python takes
    minutes. Every operation here runs inside Pillow.
    """
    from PIL import ImageChops, ImageColor

    target = ImageColor.getrgb(colour)[:3]
    rgba = image.convert("RGBA")

    bands = rgba.convert("RGB").split()
    masks = [
        band.point(lambda v, t=value: 255 if v == t else 0)
        for band, value in zip(bands, target)
    ]
    matched = ImageChops.multiply(ImageChops.multiply(masks[0], masks[1]), masks[2])

    removed = matched.histogram()[255]
    rgba.putalpha(ImageChops.invert(matched))
    return rgba, removed


def _count_colours(rgb) -> tuple[int, bool]:
    """Distinct colour count, capped.

    `getcolors` runs in Pillow and returns None past its cap, which is all the
    blank check needs. Building a Python set of every pixel is what made this
    take minutes on a print-size file.
    """
    colours = rgb.getcolors(maxcolors=MAX_COLOURS_COUNTED)
    if colours is None:
        return MAX_COLOURS_COUNTED, True
    return len(colours), False


def _verify(path: Path, image, background: str, transparent_pixels: int
            ) -> RasterResult:
    """Re-read what was written and confirm something actually drew."""
    file_bytes = path.stat().st_size
    if file_bytes == 0:
        raise RasterError(f"rasteriser wrote a zero-byte file: {path}")

    rgb = image.convert("RGB")
    distinct, capped = _count_colours(rgb)
    extrema = image.convert("L").getextrema()

    result = RasterResult(
        path=path, width=image.width, height=image.height,
        file_bytes=file_bytes, distinct_colours=distinct,
        luminance_range=extrema, background=background,
        transparent_pixels=transparent_pixels, colours_capped=capped,
    )

    if result.is_blank:
        raise RasterError(
            f"rasterised to a blank canvas ({image.width}x{image.height}, "
            f"{distinct} distinct colour(s)) -- the SVG parsed but nothing drew"
        )

    return result
