"""
storyforge2/cover/spec.py — real print-spec math (spine width, bleed,
full-wrap dimensions). Confirmed absent anywhere in this repo before
this file (grepped for spine/bleed/trim_size math repo-wide — the only
hits were an unrelated EPUB-navigation `.spine` list and narrative uses
of the word "bleeding").

"Never invent printer measurements. Cover dimensions must come from
validated platform settings or user-entered specifications." — this
module follows that literally: PAPER_SPINE_FACTORS below only contains
values Amazon KDP has publicly published in its own paperback cover
templates/help documentation (white paper: 0.002252 in/page, cream
paper: 0.0025 in/page — these two are widely and consistently
documented). Any paper type or printer not in this table, or a custom
figure, must be supplied explicitly via `spine_factor_override` —
get_spine_width() raises rather than guessing.
"""

from __future__ import annotations

from dataclasses import dataclass

from storyforge2.brief import TRIM_SIZES

# Inches of spine width added per interior page. [Certain] for "white"
# and "cream" — these are Amazon KDP's own published paperback spine
# constants, repeated consistently across their cover-template
# documentation. Do not add more paper types here without a citable
# source — anything else must go through spine_factor_override.
PAPER_SPINE_FACTORS = {
    "white": 0.002252,
    "cream": 0.0025,
}

# Standard print-industry bleed — 1/8 inch (0.125") on every edge that
# touches the trim line. This is a near-universal print convention, not
# platform-specific, so it's a plain constant rather than a lookup.
STANDARD_BLEED_IN = 0.125

MIN_PAGES_FOR_SPINE_TEXT = 79  # KDP's own published minimum page count before spine text is legible/allowed


class CoverSpecError(ValueError):
    pass


@dataclass
class CoverSpec:
    trim_width_in: float
    trim_height_in: float
    page_count: int
    paper_type: str
    spine_width_in: float
    bleed_in: float
    include_spine_text: bool
    front_cover_width_in: float
    front_cover_height_in: float
    full_wrap_width_in: float
    full_wrap_height_in: float


def get_spine_width_in(page_count: int, paper_type: str = "white", spine_factor_override: float | None = None) -> float:
    if page_count < 1:
        raise CoverSpecError("page_count must be >= 1")
    if spine_factor_override is not None:
        factor = spine_factor_override
    elif paper_type in PAPER_SPINE_FACTORS:
        factor = PAPER_SPINE_FACTORS[paper_type]
    else:
        raise CoverSpecError(
            f"No validated spine-width factor for paper_type={paper_type!r}. "
            f"Known: {sorted(PAPER_SPINE_FACTORS)}. Pass spine_factor_override= with a "
            f"figure from your printer's own published specification — this function "
            f"will not invent one."
        )
    return round(page_count * factor, 4)


def compute_cover_spec(
    trim_size: str, page_count: int, paper_type: str = "white",
    bleed_in: float = STANDARD_BLEED_IN, spine_factor_override: float | None = None,
) -> CoverSpec:
    if trim_size not in TRIM_SIZES:
        raise CoverSpecError(f"Unknown trim_size {trim_size!r}. Known sizes: {sorted(TRIM_SIZES)}")
    trim_width, trim_height = TRIM_SIZES[trim_size]

    spine_width = get_spine_width_in(page_count, paper_type, spine_factor_override)
    include_spine_text = page_count >= MIN_PAGES_FOR_SPINE_TEXT

    # Full print-wrap = bleed + back cover + spine + front cover + bleed
    # (left-right), trim height + bleed top/bottom. Matches the layout
    # every major POD printer's cover template uses.
    full_wrap_width = round((2 * bleed_in) + (2 * trim_width) + spine_width, 4)
    full_wrap_height = round(trim_height + (2 * bleed_in), 4)

    return CoverSpec(
        trim_width_in=trim_width, trim_height_in=trim_height, page_count=page_count,
        paper_type=paper_type, spine_width_in=spine_width, bleed_in=bleed_in,
        include_spine_text=include_spine_text,
        front_cover_width_in=trim_width, front_cover_height_in=trim_height,
        full_wrap_width_in=full_wrap_width, full_wrap_height_in=full_wrap_height,
    )


def inches_to_px(inches: float, dpi: int = 300) -> int:
    """300 DPI is the standard print-quality resolution every major POD
    printer (KDP, IngramSpark, etc.) requires — not a Story Forge 2
    invention."""
    return round(inches * dpi)
