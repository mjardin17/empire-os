"""
storyforge2/illustrations.py — character sheets + per-page illustrations.

Real generation reuses empire_render.fetch_one_scene_image() (this
repo's own proven "one image for one prompt, no episode/channel
coupling" function — the Wikimedia -> Gemini-image -> Pollinations
waterfall) rather than reimplementing image generation. Imported
lazily so importing this module doesn't pull in the whole video
pipeline's dependency surface unless a real (non-mock) provider is
actually used.

Character sheets reuse the *convention* empire_render.py already
established (characters/<channel>/<key>_sheet.png, consumed by
find_character_reference()) but this module is what GENERATES a sheet
— confirmed absent anywhere in the repo before this.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from storyforge2.dedup import DuplicateContentStore
from storyforge2.layout import BookLayout, IllustrationSlot


class IllustrationError(RuntimeError):
    pass


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:40]


# -- Provider layer -----------------------------------------------------

class ImageProvider(ABC):
    name: str = "base"

    @abstractmethod
    def generate(self, prompt: str, dest: Path) -> bool:
        """Write an image to `dest`. Returns True on success. Never
        raises for a routine generation failure — returns False so the
        caller can retry/skip, matching this repo's existing
        fetch_one_scene_image() contract."""
        ...


class WaterfallImageProvider(ImageProvider):
    """Real generation via empire_render.py's proven single-image
    fetch function — free-tier-first (Wikimedia/Gemini/Pollinations),
    same as the rest of this repo's image pipeline."""
    name = "waterfall"

    def generate(self, prompt: str, dest: Path) -> bool:
        from empire_render import fetch_one_scene_image
        dest.parent.mkdir(parents=True, exist_ok=True)
        return fetch_one_scene_image(prompt=prompt, work_dir=dest.parent, tag=_slugify(prompt), dest=dest)


class MockImageProvider(ImageProvider):
    """Zero-cost, zero-network. Writes a real, valid small PNG (not a
    zero-byte stub) with the prompt text rendered on it, so DRY_RUN
    output is genuinely openable and inspectable, not a placeholder
    that only pretends to exist."""
    name = "mock"

    def generate(self, prompt: str, dest: Path) -> bool:
        from PIL import Image, ImageDraw

        dest.parent.mkdir(parents=True, exist_ok=True)
        img = Image.new("RGB", (512, 512), color=(30, 30, 40))
        draw = ImageDraw.Draw(img)
        label = "\n".join(_wrap(prompt, 40)[:12])
        draw.multiline_text((16, 16), f"MOCK IMAGE (DRY_RUN)\n\n{label}", fill=(220, 220, 220))
        img.save(dest, "PNG")
        return dest.exists()


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def get_image_provider(name: str) -> ImageProvider:
    providers: dict[str, type[ImageProvider]] = {"waterfall": WaterfallImageProvider, "mock": MockImageProvider}
    if name not in providers:
        raise IllustrationError(f"Unknown image provider '{name}'. Available: {list(providers)}")
    return providers[name]()


# -- Character sheets -----------------------------------------------------

def generate_character_sheet(
    character_name: str, description: str, output_dir: str, provider_name: str = "mock",
    dedup_store: Optional[DuplicateContentStore] = None,
) -> Optional[Path]:
    """One reference image per named character, used as prompt context
    for every illustration that character appears in (kept consistent
    via the same text description, not true model-level identity lock
    — that would require a paid reference-conditioning provider this
    pipeline treats as optional)."""
    provider = get_image_provider(provider_name)
    dest = Path(output_dir) / f"{_slugify(character_name)}_sheet.png"
    if dest.exists():
        return dest  # idempotent — don't regenerate an existing sheet

    prompt = f"Character reference sheet for {character_name}: {description}. Full body, neutral pose, consistent art style, plain background."
    if dedup_store is not None:
        content_hash = dedup_store.hash_text(prompt)
        if dedup_store.check_and_register(content_hash):
            # Same prompt already used for a different asset in this
            # project — still generate (character sheets are meant to
            # be reused across every illustration of that character),
            # but this is the seam where a stricter policy could reject.
            pass

    ok = provider.generate(prompt, dest)
    return dest if ok else None


def generate_illustrations(
    layout: BookLayout, output_dir: str, provider_name: str = "mock",
    dedup_store: Optional[DuplicateContentStore] = None,
) -> dict[int, list[Path]]:
    """One entry per chapter number -> list of generated illustration
    paths (in slot order). A slot that fails to generate is skipped,
    not fatal to the rest of the book — matches the "cover generation
    is best-effort" philosophy already applied elsewhere in this
    session's work; a missing illustration shouldn't take down the
    whole book."""
    provider = get_image_provider(provider_name)
    store = dedup_store or DuplicateContentStore(path=str(Path(output_dir) / "used_hashes.json"))
    results: dict[int, list[Path]] = {}

    for chapter in layout.chapters:
        paths: list[Path] = []
        for slot in chapter.illustration_slots:
            content_hash = store.hash_text(slot.prompt)
            if store.is_duplicate(content_hash):
                # Deterministically vary the prompt rather than silently
                # reusing/skipping — "no scene reuse, ever" (this repo's
                # own standing rule) applies here the same way it
                # already does for video scenes.
                slot = IllustrationSlot(
                    chapter_number=slot.chapter_number, slot_index=slot.slot_index,
                    prompt=f"{slot.prompt} (alternate framing, scene variant {slot.slot_index}-b)",
                    placement=slot.placement,
                )
            dest = Path(output_dir) / f"ch{chapter.chapter_number:03d}_illus{slot.slot_index:02d}.png"
            if provider.generate(slot.prompt, dest):
                store.register(store.hash_text(slot.prompt))
                paths.append(dest)
        results[chapter.chapter_number] = paths

    return results
