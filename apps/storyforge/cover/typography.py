"""
storyforge2/cover/typography.py — deterministic PIL text compositing for
book covers (title, author, subtitle, back-cover blurb, spine text).

Ports the *technique* already proven in this repo — iron_legends_render.py's
`_font()` / `anchor="mm"` / shadow-then-fill title-card pattern, and
make_clip_windows.py's Windows-font-with-fallback list — rather than that
code directly, since covers need two things video title cards never
needed: auto-shrink-to-fit (a title/blurb of unknown length must never
overflow a fixed print box) and a 90°-rotated spine.

This module only draws text into an image it's given. It doesn't decide
sizes (cover/spec.py owns spine/bleed/trim math) or fetch/generate cover
art (illustrations.py owns that) — render.py (not yet built) is what
will assemble a full cover by calling spec.py, an image provider, and
this module together.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

__all__ = [
    "TypographyError",
    "CoverTextStyle",
    "compose_front_cover_text",
    "compose_back_cover_text",
    "compose_spine_text",
]

# Windows font paths, in fallback order — this repo runs on Windows
# (documented in CLAUDE.md), and this exact list is the same one already
# proven working in make_clip_windows.py's load_font(). Falls all the
# way to ImageFont.load_default() so a missing font degrades output
# quality rather than crashing cover generation.
_WINDOWS_FONTS = Path("C:/Windows/Fonts")
_BOLD_CANDIDATES = [
    _WINDOWS_FONTS / "arialbd.ttf",
    _WINDOWS_FONTS / "calibrib.ttf",
    _WINDOWS_FONTS / "trebucbd.ttf",
    _WINDOWS_FONTS / "georgiab.ttf",
]
_REGULAR_CANDIDATES = [
    _WINDOWS_FONTS / "arial.ttf",
    _WINDOWS_FONTS / "calibri.ttf",
    _WINDOWS_FONTS / "trebuc.ttf",
    _WINDOWS_FONTS / "georgia.ttf",
]
_ITALIC_CANDIDATES = [
    _WINDOWS_FONTS / "ariali.ttf",
    _WINDOWS_FONTS / "calibrii.ttf",
    _WINDOWS_FONTS / "georgiai.ttf",
]
_FONT_CANDIDATES = {"bold": _BOLD_CANDIDATES, "italic": _ITALIC_CANDIDATES, "regular": _REGULAR_CANDIDATES}

# Print-safety margin — keep cover text this far inside the trim edge so
# imprecise trimming during binding never clips it. 0.25" is a
# near-universal POD cover-design convention, on the same footing as
# spec.py's STANDARD_BLEED_IN (a print-industry norm, not a
# platform-specific figure that needs its own citation).
SAFE_MARGIN_IN = 0.25


class TypographyError(ValueError):
    pass


@dataclass
class CoverTextStyle:
    title_color: tuple = (255, 255, 255)
    title_shadow: Optional[tuple] = (0, 0, 0)
    author_color: tuple = (230, 230, 230)
    blurb_color: tuple = (20, 20, 20)
    max_title_size: int = 160
    max_subtitle_size: int = 56
    max_author_size: int = 60
    max_blurb_size: int = 34


# -- Font + measurement helpers ------------------------------------------

def _load_font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    for path in _FONT_CANDIDATES.get(weight, _REGULAR_CANDIDATES):
        try:
            return ImageFont.truetype(str(path), size)
        except Exception:
            continue
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return right - left, bottom - top


def _wrap_to_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width_px: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        width, _ = _text_size(draw, candidate, font)
        if width <= max_width_px or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _fit_font_to_box(
    draw: ImageDraw.ImageDraw, text: str, weight: str,
    max_width_px: int, max_height_px: int, max_size: int, min_size: int = 12,
) -> tuple[ImageFont.ImageFont, list[str]]:
    """Shrinks font size until the wrapped text fits max_width x
    max_height, never going below min_size. If it still doesn't fit at
    min_size, returns the min_size attempt anyway — best-effort, matching
    illustrations.py's "a failure here shouldn't take down the whole
    book" philosophy, rather than raising for an unusually long title."""
    size = max_size
    font = _load_font(size, weight)
    lines = _wrap_to_width(draw, text, font, max_width_px)
    while size > min_size:
        line_h = _text_size(draw, "Ag", font)[1] + 4
        total_height = line_h * len(lines)
        widest = max((_text_size(draw, ln, font)[0] for ln in lines), default=0)
        if total_height <= max_height_px and widest <= max_width_px:
            return font, lines
        size -= 2
        font = _load_font(size, weight)
        lines = _wrap_to_width(draw, text, font, max_width_px)
    return font, lines


def _fit_single_line(draw: ImageDraw.ImageDraw, text: str, weight: str, max_width_px: int, max_size: int, min_size: int = 8) -> ImageFont.ImageFont:
    """Same shrink loop as _fit_font_to_box but never wraps — for spine
    text, where a second line is a design failure, not an option."""
    size = max(max_size, min_size)
    font = _load_font(size, weight)
    while size > min_size:
        width, _ = _text_size(draw, text, font)
        if width <= max_width_px:
            return font
        size -= 2
        font = _load_font(size, weight)
    return font


def _draw_centered_lines(
    draw: ImageDraw.ImageDraw, lines: list[str], font: ImageFont.ImageFont,
    center_x: int, top_y: int, fill: tuple, shadow_fill: Optional[tuple] = None,
    shadow_offset: int = 3, line_spacing: int = 6,
) -> int:
    """Draws lines centered horizontally around center_x, stacked
    downward from top_y. Shadow-then-fill (dark offset copy drawn first,
    real color on top) — the same technique proven in
    iron_legends_render.py's title cards, ported here since PIL has no
    built-in drop-shadow. Returns the y just past the last line."""
    _, line_h = _text_size(draw, "Ag", font)
    y = top_y
    for line in lines:
        mid_y = y + line_h // 2
        if shadow_fill is not None:
            draw.text((center_x + shadow_offset, mid_y + shadow_offset), line, font=font, fill=shadow_fill, anchor="mm")
        draw.text((center_x, mid_y), line, font=font, fill=fill, anchor="mm")
        y += line_h + line_spacing
    return y


def _draw_left_lines(draw: ImageDraw.ImageDraw, lines: list[str], font: ImageFont.ImageFont, left_x: int, top_y: int, fill: tuple, line_spacing: int = 6) -> int:
    """Left-aligned paragraph stacking — back-cover blurbs read as body
    copy, not a centered poster headline, so they get standard
    left-aligned typesetting instead of _draw_centered_lines."""
    _, line_h = _text_size(draw, "Ag", font)
    y = top_y
    for line in lines:
        draw.text((left_x, y), line, font=font, fill=fill)
        y += line_h + line_spacing
    return y


# -- Public API ------------------------------------------------------------

def compose_front_cover_text(
    image: Image.Image, title: str, author: str, subtitle: str = "",
    dpi: int = 300, style: Optional[CoverTextStyle] = None,
) -> Image.Image:
    """Composites title (+ optional subtitle) near the top and author
    near the bottom, both centered and kept inside SAFE_MARGIN_IN.
    Generic over image size/DPI, so the same function serves the print
    front cover, the ebook cover, and thumbnail/social variants — only
    the canvas render.py hands it differs."""
    if not title.strip():
        raise TypographyError("title is required")
    style = style or CoverTextStyle()
    image = image.convert("RGBA")
    draw = ImageDraw.Draw(image)
    width, height = image.size
    margin_px = round(SAFE_MARGIN_IN * dpi)
    box_w = max(1, width - 2 * margin_px)

    title_font, title_lines = _fit_font_to_box(draw, title, "bold", box_w, round(height * 0.32), style.max_title_size)
    next_y = _draw_centered_lines(draw, title_lines, title_font, width // 2, round(height * 0.08), style.title_color, style.title_shadow)

    if subtitle.strip():
        sub_font, sub_lines = _fit_font_to_box(draw, subtitle, "italic", box_w, round(height * 0.1), style.max_subtitle_size)
        next_y = _draw_centered_lines(draw, sub_lines, sub_font, width // 2, next_y + round(height * 0.015), style.title_color, style.title_shadow, shadow_offset=2)

    if author.strip():
        author_font, author_lines = _fit_font_to_box(draw, author, "regular", box_w, round(height * 0.08), style.max_author_size)
        author_top = height - margin_px - round(height * 0.08)
        _draw_centered_lines(draw, author_lines, author_font, width // 2, author_top, style.author_color, style.title_shadow, shadow_offset=2)

    return image


def compose_back_cover_text(image: Image.Image, blurb: str, dpi: int = 300, style: Optional[CoverTextStyle] = None) -> Image.Image:
    """Composites the back-cover blurb as a left-aligned paragraph block,
    vertically centered. A blank blurb is a legitimate choice (a
    graphic-only back cover), not an error — returns the image
    unchanged rather than raising."""
    if not blurb.strip():
        return image
    style = style or CoverTextStyle()
    image = image.convert("RGBA")
    draw = ImageDraw.Draw(image)
    width, height = image.size
    margin_px = round(SAFE_MARGIN_IN * dpi)
    box_w = max(1, width - 2 * margin_px)
    box_h = round(height * 0.5)

    font, lines = _fit_font_to_box(draw, blurb, "regular", box_w, box_h, style.max_blurb_size, min_size=16)
    _, line_h = _text_size(draw, "Ag", font)
    actual_h = line_h * len(lines)
    top_y = (height - actual_h) // 2
    _draw_left_lines(draw, lines, font, margin_px, top_y, style.blurb_color)
    return image


def compose_spine_text(
    full_wrap_image: Image.Image, spec, title: str, author: str,
    dpi: int = 300, style: Optional[CoverTextStyle] = None, clockwise: bool = True,
) -> Image.Image:
    """Draws title + author rotated 90° into the spine strip of a
    full-wrap cover image, built from a cover/spec.py CoverSpec so the
    pixel math can't drift out of sync with spec.py's own layout order
    (bleed | back cover | spine | front cover | bleed).

    Silently returns the image unchanged if spec.include_spine_text is
    False (spec.py already owns KDP's minimum-page-count rule — this
    function doesn't re-derive it) or if the spine is too thin to fit
    text even at minimum size (skip, don't clip/overlap the fold).

    clockwise=True (default) matches the common US-paperback convention
    — title reads top-to-bottom, tip your head right to read it. [Likely,
    not universally fixed across printers/regions] — pass clockwise=False
    to flip if a specific platform's template disagrees.
    """
    from storyforge2.cover.spec import inches_to_px

    if not spec.include_spine_text:
        return full_wrap_image
    style = style or CoverTextStyle()
    full_wrap_image = full_wrap_image.convert("RGBA")

    bleed_px = inches_to_px(spec.bleed_in, dpi)
    trim_width_px = inches_to_px(spec.trim_width_in, dpi)
    trim_height_px = inches_to_px(spec.trim_height_in, dpi)
    spine_width_px = inches_to_px(spec.spine_width_in, dpi)
    spine_x_px = bleed_px + trim_width_px  # back cover sits first in the wrap, per spec.py

    expected_size = (inches_to_px(spec.full_wrap_width_in, dpi), inches_to_px(spec.full_wrap_height_in, dpi))
    if full_wrap_image.size != expected_size:
        raise TypographyError(
            f"full_wrap_image size {full_wrap_image.size} doesn't match this spec's expected "
            f"{expected_size} at {dpi} DPI — build the canvas from the same spec/dpi passed here."
        )

    # SAFE_MARGIN_IN governs distance from the trim edge along the
    # spine's *length* (reused below for usable_w) — it's the wrong
    # constant to gate spine *thickness* against: at 0.25in margin on
    # each side that would require a 0.5in-thick spine before any text
    # draws, but KDP's own MIN_PAGES_FOR_SPINE_TEXT (spec.py) allows
    # spine text starting around 0.18-0.2in. Gate instead on whether
    # there's room for even the smallest legible font.
    margin_px = round(SAFE_MARGIN_IN * dpi)
    spine_text_padding_px = 10
    max_title_size = spine_width_px - spine_text_padding_px
    if max_title_size < 8:
        return full_wrap_image  # too thin for even minimum-legible text at this DPI

    # Compose horizontally on a wide/short strip (width = spine's eventual
    # length, height = spine's eventual thickness), then rotate — the
    # standard way to lay out text that must run along a narrow print
    # element.
    strip = Image.new("RGBA", (trim_height_px, spine_width_px), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(strip)
    usable_w = max(1, trim_height_px - 2 * margin_px)
    max_author_size = max(8, round((spine_width_px - spine_text_padding_px) * 0.6))

    title_font = _fit_single_line(sdraw, title, "bold", usable_w, max_title_size)
    author_font = _fit_single_line(sdraw, author, "regular", usable_w, max_author_size) if author.strip() else None

    _, title_h = _text_size(sdraw, "Ag", title_font)
    author_h = _text_size(sdraw, "Ag", author_font)[1] if author_font else 0
    gap = max(4, spine_width_px // 20) if author_font else 0
    block_h = title_h + gap + author_h
    top_y = max(0, (spine_width_px - block_h) // 2)

    next_y = _draw_centered_lines(sdraw, [title], title_font, trim_height_px // 2, top_y, style.title_color, style.title_shadow, shadow_offset=2)
    if author_font:
        _draw_centered_lines(sdraw, [author], author_font, trim_height_px // 2, next_y, style.author_color, style.title_shadow, shadow_offset=1)

    angle = -90 if clockwise else 90  # PIL rotates counter-clockwise for positive angles
    rotated = strip.rotate(angle, expand=True)
    if rotated.size != (spine_width_px, trim_height_px):
        raise TypographyError(f"spine rotation produced {rotated.size}, expected {(spine_width_px, trim_height_px)} — rotation math is broken")

    full_wrap_image.alpha_composite(rotated, (spine_x_px, bleed_px))
    return full_wrap_image


# -- Self-test: real render, real files, real pixel checks -----------------

def _selftest() -> None:
    """Not a pytest file (tests/storyforge2/ is still pending) — a
    standalone script that builds real cover images and verifies text was
    actually drawn (pixel-diffed against a blank background), not just
    that the function returned without raising. Run directly:
    python -m storyforge2.cover.typography
    """
    import tempfile

    from storyforge2.cover.spec import compute_cover_spec, inches_to_px

    out_dir = Path(tempfile.mkdtemp(prefix="sf2_typography_"))
    print(f"Writing test covers to {out_dir}")

    spec = compute_cover_spec(trim_size="6x9", page_count=220, paper_type="white")
    print(f"  spec: spine={spec.spine_width_in}in wrap={spec.full_wrap_width_in}x{spec.full_wrap_height_in}in include_spine_text={spec.include_spine_text}")

    dpi = 150  # keep the self-test fast; math is DPI-independent, already exercised at 300 implicitly via inches_to_px

    def blank(w: int, h: int, color=(40, 60, 90)) -> Image.Image:
        return Image.new("RGB", (w, h), color)

    # Front cover
    front_w, front_h = inches_to_px(spec.front_cover_width_in, dpi), inches_to_px(spec.front_cover_height_in, dpi)
    front_bg = blank(front_w, front_h)
    front = compose_front_cover_text(front_bg.copy(), "The Longest Winter", "J. Empire", subtitle="A Novel of Endurance", dpi=dpi)
    diff_pixels = sum(1 for p1, p2 in zip(front_bg.convert("RGB").getdata(), front.convert("RGB").getdata()) if p1 != p2)
    assert diff_pixels > 500, f"front cover: too few pixels changed ({diff_pixels}) — text likely didn't draw"
    front.convert("RGB").save(out_dir / "front.png")
    print(f"  front cover OK: {front.size}, {diff_pixels} px changed")

    # Back cover
    back_bg = blank(front_w, front_h)
    blurb = ("When the last train stopped running, Mara had three days to reach the border. "
             "What she found there would rewrite everything she believed about her family, her country, "
             "and the winter that would not end.")
    back = compose_back_cover_text(back_bg.copy(), blurb, dpi=dpi, style=CoverTextStyle(blurb_color=(255, 255, 255)))
    diff_pixels = sum(1 for p1, p2 in zip(back_bg.convert("RGB").getdata(), back.convert("RGB").getdata()) if p1 != p2)
    assert diff_pixels > 500, f"back cover: too few pixels changed ({diff_pixels}) — text likely didn't draw"
    back.convert("RGB").save(out_dir / "back.png")
    print(f"  back cover OK: {back.size}, {diff_pixels} px changed")

    # Empty blurb must be a no-op, not an error
    unchanged = compose_back_cover_text(back_bg.copy(), "   ", dpi=dpi)
    assert list(unchanged.convert("RGB").getdata()) == list(back_bg.convert("RGB").getdata()), "blank blurb should be a no-op"
    print("  blank blurb no-op OK")

    # Full wrap with spine text
    wrap_w, wrap_h = inches_to_px(spec.full_wrap_width_in, dpi), inches_to_px(spec.full_wrap_height_in, dpi)
    wrap_bg = blank(wrap_w, wrap_h)
    wrapped = compose_spine_text(wrap_bg.copy(), spec, "The Longest Winter", "J. Empire", dpi=dpi)

    bleed_px = inches_to_px(spec.bleed_in, dpi)
    trim_width_px = inches_to_px(spec.trim_width_in, dpi)
    spine_width_px = inches_to_px(spec.spine_width_in, dpi)
    trim_height_px = inches_to_px(spec.trim_height_in, dpi)
    spine_x0 = bleed_px + trim_width_px
    spine_box_before = wrap_bg.crop((spine_x0, bleed_px, spine_x0 + spine_width_px, bleed_px + trim_height_px))
    spine_box_after = wrapped.convert("RGB").crop((spine_x0, bleed_px, spine_x0 + spine_width_px, bleed_px + trim_height_px))
    spine_diff = sum(1 for p1, p2 in zip(spine_box_before.getdata(), spine_box_after.getdata()) if p1 != p2)
    assert spine_diff > 20, f"spine: too few pixels changed inside the spine box ({spine_diff}) — spine text likely didn't draw"
    wrapped.convert("RGB").save(out_dir / "full_wrap.png")
    print(f"  full wrap + spine OK: {wrapped.size}, {spine_diff} px changed inside spine box ({spine_width_px}px wide)")

    # Mismatched-canvas guard must actually raise
    try:
        compose_spine_text(blank(10, 10), spec, "X", "Y", dpi=dpi)
        raise AssertionError("expected TypographyError for a mismatched canvas size, got none")
    except TypographyError:
        print("  mismatched-canvas guard OK (raised as expected)")

    print(f"\nAll checks passed. Inspect the real files in {out_dir}")


if __name__ == "__main__":
    _selftest()
