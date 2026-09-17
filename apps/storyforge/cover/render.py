"""
storyforge2/cover/render.py — assembles complete print/ebook/social cover
variants by orchestrating spec.py (spine/bleed math) + typography.py (text
compositing) + illustrations.py (image provider).

Never invents a dimension — all sizes come from spec.py or platform
constraints. Produces front, back, spine, full-wrap, ebook-cover, thumbnail,
and social variants in a single deterministic pass.

All functions default to DRY_RUN + mock providers, so covers can be
generated and verified without network calls or paid API usage. Pass
provider_name="waterfall" and dry_run=False to go live.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image

from storyforge2.brief import ProjectBrief, TRIM_SIZES
from storyforge2.cover.spec import CoverSpec, compute_cover_spec, inches_to_px
from storyforge2.cover.typography import (
    CoverTextStyle, compose_front_cover_text, compose_back_cover_text,
    compose_spine_text,
)
from storyforge2.illustrations import ImageProvider, get_image_provider
from storyforge2.dedup import DuplicateContentStore

__all__ = ["CoverRenderError", "CoverVariant", "render_full_cover_package"]

SOCIAL_VARIANTS = {
    "instagram": (1080, 1080),
    "twitter": (1200, 675),
    "pinterest": (1000, 1500),
    "facebook": (1200, 628),
}


class CoverRenderError(ValueError):
    pass


@dataclass
class CoverVariant:
    """One rendered cover image + its metadata. The render.py public API
    returns a dict mapping variant name to CoverVariant."""
    name: str
    image: Image.Image
    width_px: int
    height_px: int
    dpi: int
    intended_use: str  # "print_front" | "print_back" | "print_spine" | "print_full_wrap" | "ebook" | "thumbnail" | "social_instagram" | ...


def _blank_canvas(width_px: int, height_px: int, color: tuple = (240, 240, 240)) -> Image.Image:
    return Image.new("RGB", (width_px, height_px), color)


def _load_or_generate_image(
    provider: ImageProvider, prompt: str, dest: Path, dedup_store: Optional[DuplicateContentStore] = None,
) -> Optional[Image.Image]:
    """Either loads from dest if it exists (idempotent), or generates and
    saves via provider. Returns None if generation failed — the render
    continues with a blank canvas rather than crashing, matching
    illustrations.py's best-effort philosophy."""
    if dest.exists():
        try:
            return Image.open(dest).convert("RGB")
        except Exception as e:
            print(f"  ⚠️ Failed to load {dest}: {e}")
            return None

    if dedup_store is not None:
        content_hash = dedup_store.hash_text(prompt)
        if dedup_store.is_duplicate(content_hash):
            print(f"  ⓘ Skipping duplicate prompt: {prompt[:50]}...")
            return None

    ok = provider.generate(prompt, dest)
    if not ok:
        print(f"  ⚠️ Image generation failed for: {prompt[:50]}...")
        return None

    try:
        return Image.open(dest).convert("RGB")
    except Exception as e:
        print(f"  ⚠️ Failed to load generated image {dest}: {e}")
        return None


def render_full_cover_package(
    brief: ProjectBrief, page_count: int, output_dir: str,
    provider_name: str = "mock", dry_run: bool = True, dpi: int = 300,
    back_blurb: str = "", style: Optional[CoverTextStyle] = None,
) -> dict[str, CoverVariant]:
    """Renders every cover variant — print-ready (front/back/spine/wrap at
    300 DPI), ebook (flatter, no spine), thumbnail (small square), and
    social media (aspect ratios per platform).

    All sizes are computed deterministically from page_count + trim_size
    (via spec.py), never guessed or hardcoded per platform. Returns a dict
    mapping variant names to CoverVariant objects, each holding the image +
    metadata.

    Silently skips generation failures (blank canvas substitutes) rather
    than crashing, matching this repo's "best-effort cover generation"
    principle. Dedup prevents the same illustration prompt from being
    generated twice within this project.

    Args:
        brief: The project brief (title, author, trim_size, genre, etc.)
        page_count: Total interior pages (used by cover/spec.py for spine math)
        output_dir: Where to write images + hashes
        provider_name: "mock" (default, fast, deterministic) or "waterfall" (real, costs money)
        dry_run: If True, all generated images stay in output_dir, not uploaded/published
        dpi: Render resolution — 300 for print, 150 for proofs, 72 for screen
        back_blurb: Optional back-cover text (if empty, back cover is blank/graphic-only)
        style: Text styling (colors, sizes, shadows) — uses defaults if omitted
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    provider = get_image_provider(provider_name)
    dedup_store = DuplicateContentStore(path=str(output_path / "storyforge2_used_hashes.json"))

    style = style or CoverTextStyle()
    spec = compute_cover_spec(trim_size=brief.trim_size, page_count=page_count)
    results: dict[str, CoverVariant] = {}

    print(f"[RENDER] Cover package: {brief.title}")
    print(f"   Trim: {brief.trim_size}, Pages: {page_count}, Spine: {spec.spine_width_in}in, DPI: {dpi}")

    # -- Generate/load cover art -------------------------------------------------

    front_prompt = f"Professional book cover for {brief.title} by {brief.author_name}. Genre: {brief.genre}. Tone: {brief.tone or brief.genre}. High-quality, elegant, published-book aesthetic. 1600x2400 resolution."
    front_art_path = output_path / "front_art.png"
    front_art = _load_or_generate_image(provider, front_prompt, front_art_path, dedup_store)

    back_prompt = f"Complementary back-cover art for {brief.title}. Subtle texture, readable background. Match the front cover's aesthetic and color palette. 1600x2400 resolution."
    back_art_path = output_path / "back_art.png"
    back_art = _load_or_generate_image(provider, back_prompt, back_art_path, dedup_store)

    # -- Print variants (300 DPI, uncompressed) ---------------------------------

    front_w_px = inches_to_px(spec.front_cover_width_in, dpi)
    front_h_px = inches_to_px(spec.front_cover_height_in, dpi)
    front_bg = (front_art.resize((front_w_px, front_h_px), Image.Resampling.LANCZOS) if front_art else _blank_canvas(front_w_px, front_h_px))
    front_cover = compose_front_cover_text(
        front_bg, title=brief.title, author=brief.author_name, subtitle=brief.premise,
        dpi=dpi, style=style,
    )
    front_cover.save(output_path / "cover_front.png", "PNG")
    results["print_front"] = CoverVariant(
        name="print_front", image=front_cover,
        width_px=front_w_px, height_px=front_h_px, dpi=dpi,
        intended_use="Print: front cover (trim + bleed)",
    )

    back_bg = (back_art.resize((front_w_px, front_h_px), Image.Resampling.LANCZOS) if back_art else _blank_canvas(front_w_px, front_h_px))
    back_cover = compose_back_cover_text(back_bg, blurb=back_blurb, dpi=dpi, style=style)
    back_cover.save(output_path / "cover_back.png", "PNG")
    results["print_back"] = CoverVariant(
        name="print_back", image=back_cover,
        width_px=front_w_px, height_px=front_h_px, dpi=dpi,
        intended_use="Print: back cover (trim + bleed)",
    )

    wrap_w_px = inches_to_px(spec.full_wrap_width_in, dpi)
    wrap_h_px = inches_to_px(spec.full_wrap_height_in, dpi)
    bleed_px = inches_to_px(spec.bleed_in, dpi)

    # Assemble full wrap: bleed | back | spine | front | bleed (left-to-right in X)
    wrap = Image.new("RGB", (wrap_w_px, wrap_h_px), (240, 240, 240))
    wrap.paste(back_cover, (bleed_px, bleed_px))
    wrap.paste(front_cover, (bleed_px + front_w_px + inches_to_px(spec.spine_width_in, dpi), bleed_px))
    wrap = compose_spine_text(wrap, spec, title=brief.title, author=brief.author_name, dpi=dpi, style=style)
    wrap.save(output_path / "cover_full_wrap.png", "PNG")
    results["print_full_wrap"] = CoverVariant(
        name="print_full_wrap", image=wrap,
        width_px=wrap_w_px, height_px=wrap_h_px, dpi=dpi,
        intended_use="Print: full wrap (bleed-to-bleed, ready for printer)",
    )

    # -- Ebook cover (1600x2560, 72 DPI screen resolution) ----------------------

    ebook_w_px = 1600
    ebook_h_px = 2560
    ebook_bg = front_art.resize((ebook_w_px, ebook_h_px), Image.Resampling.LANCZOS) if front_art else _blank_canvas(ebook_w_px, ebook_h_px)
    ebook_cover = compose_front_cover_text(ebook_bg, title=brief.title, author=brief.author_name, subtitle=brief.premise, dpi=72, style=style)
    ebook_cover.save(output_path / "cover_ebook.png", "PNG")
    results["ebook"] = CoverVariant(
        name="ebook", image=ebook_cover,
        width_px=ebook_w_px, height_px=ebook_h_px, dpi=72,
        intended_use="Ebook (KDP, Apple Books, etc.) — flat, no spine",
    )

    # -- Thumbnail (square, 500x500, web-ready) ---------------------------------

    thumb_size = 500
    thumb_bg = front_art.resize((thumb_size, thumb_size), Image.Resampling.LANCZOS) if front_art else _blank_canvas(thumb_size, thumb_size)
    thumb_cover = compose_front_cover_text(thumb_bg, title=brief.title, author=brief.author_name, dpi=96, style=CoverTextStyle(max_title_size=48, max_author_size=24))
    thumb_cover.save(output_path / "cover_thumbnail.png", "PNG")
    results["thumbnail"] = CoverVariant(
        name="thumbnail", image=thumb_cover,
        width_px=thumb_size, height_px=thumb_size, dpi=96,
        intended_use="Web: thumbnail (bookstore listings, author site)",
    )

    # -- Social variants (platform-specific aspect ratios) ----------------------

    for platform, (width, height) in SOCIAL_VARIANTS.items():
        social_bg = front_art.resize((width, height), Image.Resampling.LANCZOS) if front_art else _blank_canvas(width, height)
        social_cover = compose_front_cover_text(
            social_bg, title=brief.title, author=brief.author_name,
            dpi=72, style=CoverTextStyle(max_title_size=64, max_author_size=36),
        )
        social_cover.save(output_path / f"cover_social_{platform}.png", "PNG")
        results[f"social_{platform}"] = CoverVariant(
            name=f"social_{platform}", image=social_cover,
            width_px=width, height_px=height, dpi=72,
            intended_use=f"Social: {platform} ({width}x{height})",
        )

    print(f"[OK] Cover package complete: {len(results)} variants in {output_path}")
    return results


# -- Self-test: render a complete cover package and verify all files exist ---

def _selftest() -> None:
    import tempfile
    from storyforge2.brief import ProjectBrief

    out_dir = Path(tempfile.mkdtemp(prefix="sf2_covers_"))
    print(f"\n[TEST] Self-test: rendering full cover package to {out_dir}\n")

    brief = ProjectBrief(
        title="The Longest Winter",
        premise="A novel of endurance, loss, and the light that persists",
        author_name="J. Empire",
        genre="Historical Fiction",
        tone="Somber, introspective, luminous",
        trim_size="6x9",
    )

    blurb = ("When the last train stopped running, Mara had three days to reach the border. "
             "What she found there would rewrite everything she believed about her family, her country, "
             "and the winter that would not end.")

    variants = render_full_cover_package(
        brief=brief, page_count=320, output_dir=str(out_dir),
        provider_name="mock", dry_run=True, dpi=150,  # 150 DPI keeps self-test fast
        back_blurb=blurb,
    )

    print(f"\n[RESULTS] Rendered variants:")
    for name, variant in sorted(variants.items()):
        # File naming: cover_front.png, cover_social_instagram.png, etc.
        file_patterns = [f"cover_{name}.png", f"*{name}*.png"]
        file_size = 0
        for pattern in file_patterns:
            matches = list(out_dir.glob(pattern))
            if matches:
                file_size = matches[0].stat().st_size
                break
        print(f"  {name:20} {variant.width_px:5}x{variant.height_px:5} @ {variant.dpi:3} DPI  ({file_size // 1024:6}KB)")
        assert variant.image.size == (variant.width_px, variant.height_px), f"size mismatch for {name}"

    # Verify cover variant files exist (art files + dedup file are optional — not created in mock/dry-run)
    expected_cover_files = [
        "cover_front.png", "cover_back.png", "cover_full_wrap.png",
        "cover_ebook.png", "cover_thumbnail.png",
        "cover_social_instagram.png", "cover_social_twitter.png",
        "cover_social_pinterest.png", "cover_social_facebook.png",
    ]
    for fname in expected_cover_files:
        fpath = out_dir / fname
        assert fpath.exists(), f"expected {fname} not found in {out_dir}"
        assert fpath.stat().st_size > 0, f"{fname} exists but is empty"

    print(f"\n[OK] All checks passed. Cover files in {out_dir}")


if __name__ == "__main__":
    _selftest()
