"""
StoryForge Empire Automation Studio -- Format Package Generator
-----------------------------------------------------------------
Turns one "Ready" book into every requested format package:
kdp, epub, pdf, hardcover, paperback, large_print, coloring_book,
activity_book, audiobook, marketing_package.

Same honesty rule as `core/publishing/platform_export.py`: this module
never fabricates a binary it can't actually produce. Concretely:

  - `epub` calls Phase 4's real `EpubExporter` (stdlib-only, spec-valid)
    when chapter HTML is supplied.
  - `kdp` reuses Phase 4's `PlatformExporter` (it's both a selling
    platform and a manuscript format), so KDP packaging logic lives in
    exactly one place.
  - `pdf`, `hardcover`, `paperback`, `large_print`, `coloring_book`, and
    `activity_book` are real print-ready *specifications* (trim size,
    bleed, DPI, margin, page-count guidance written to a JSON spec file
    plus a human-readable brief) -- generating the actual interior PDF
    requires page-layout/rasterization the manuscript pipeline (Phase
    1-4 Book Studio / Image Studio) doesn't produce yet, so this is a
    deliberate, documented manual seam, exactly like
    `platform_export.NullConnector` is for direct marketplace
    submission. Wire a real layout engine in later by implementing
    `_render_interior_pdf` -- nothing else here changes.
  - `audiobook` is a real production package: chapter-by-chapter
    narration script + timing/voice spec, ready to hand to a TTS
    provider or narrator. No audio is synthesized here (that's a seam
    for a real TTS provider, e.g. via ElevenLabs/Higgsfield -- register
    one the same way image/AI providers are registered).
  - `marketing_package` aggregates real marketing copy via the
    provider-abstracted `MarketingProvider` (see providers.py) into one
    manifest, plus SEO metadata generated deterministically from the
    book's own listing metadata.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.book.exporter import BookManifest, Chapter, EpubExporter
from core.publishing.models import BookMetadata
from core.automation.models import FORMAT_TYPES, FormatPackage
from core.automation.providers import MarketingProvider, PublishingProvider


class FormatGenerationError(ValueError):
    pass


# Real, commonly-used print specs. Advisory (like PLATFORM_CONSTRAINTS in
# Phase 4) -- always confirm against the current printer's spec sheet.
_PRINT_SPECS: Dict[str, Dict[str, Any]] = {
    "hardcover": {"trim_sizes": ["6x9", "8.5x8.5", "8x10"], "bleed_in": 0.125, "min_page_count": 24, "dpi": 300},
    "paperback": {"trim_sizes": ["6x9", "5x8", "8.5x8.5"], "bleed_in": 0.125, "min_page_count": 24, "dpi": 300},
    "large_print": {"trim_sizes": ["6x9", "7x10"], "bleed_in": 0.125, "min_page_count": 24, "dpi": 300,
                     "min_font_pt": 18, "recommended_font_pt": 20},
    "coloring_book": {"trim_sizes": ["8.5x11"], "bleed_in": 0.125, "min_page_count": 20, "dpi": 300,
                       "line_art_only": True, "recommended_line_weight_pt": 2.0},
    "activity_book": {"trim_sizes": ["8.5x11"], "bleed_in": 0.125, "min_page_count": 20, "dpi": 300,
                       "sections": ["mazes", "word_search", "coloring", "dot_to_dot", "matching"]},
    "pdf": {"trim_sizes": ["6x9", "8.5x11"], "bleed_in": 0.0, "dpi": 150},
}


class FormatPackageGenerator:
    def __init__(self, output_root: str = "automation_formats"):
        self.output_root = Path(output_root)
        self._epub_exporter = EpubExporter()

    def generate(
        self,
        metadata: BookMetadata,
        format_type: str,
        publishing_provider: Optional[PublishingProvider] = None,
        marketing_provider: Optional[MarketingProvider] = None,
        chapters: Optional[List[Dict[str, str]]] = None,
        source_assets: Optional[Dict[str, str]] = None,
        book_summary: str = "",
        version: int = 1,
    ) -> FormatPackage:
        if format_type not in FORMAT_TYPES:
            raise FormatGenerationError(
                f"Unknown format '{format_type}'. Supported: {', '.join(sorted(FORMAT_TYPES))}"
            )

        out_dir = self.output_root / metadata.project_id / format_type
        out_dir.mkdir(parents=True, exist_ok=True)

        handler = getattr(self, f"_generate_{format_type}")
        return handler(
            metadata=metadata, out_dir=out_dir, publishing_provider=publishing_provider,
            marketing_provider=marketing_provider, chapters=chapters,
            source_assets=source_assets, book_summary=book_summary, version=version,
        )

    # -- individual format handlers -----------------------------------

    def _generate_kdp(self, metadata, out_dir, publishing_provider, **_) -> FormatPackage:
        provider = publishing_provider
        if provider is None:
            raise FormatGenerationError("kdp format requires a PublishingProvider")
        package = provider.publish(metadata, "kdp")
        return FormatPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            format_type="kdp", status="generated" if not package.constraint_warnings else "spec_ready",
            output_path=str(Path(package.asset_paths.get("listing_json", ""))).rsplit("/", 1)[0]
            if package.asset_paths else "",
            spec=package.listing_fields, asset_paths=package.asset_paths,
            notes="; ".join(package.constraint_warnings), created_at=time.time(),
        )

    def _generate_epub(self, metadata, out_dir, chapters, **_) -> FormatPackage:
        if chapters:
            manifest = BookManifest(
                title=metadata.title or "Untitled",
                author=metadata.author or "",
                language=metadata.language or "en",
                chapters=[Chapter(title=c.get("title", ""), html_body=c.get("html_body", "")) for c in chapters],
            )
            output_path = str(out_dir / f"{metadata.id}.epub")
            path = self._epub_exporter.export(manifest, output_path.rsplit(".epub", 1)[0])
            return FormatPackage(
                id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
                format_type="epub", status="generated", output_path=path,
                asset_paths={"epub": path}, spec={"chapter_count": len(chapters)},
                created_at=time.time(),
            )
        spec = {"note": "No chapter HTML supplied yet -- generate real EPUB once manuscript export is ready."}
        spec_path = out_dir / "epub_spec.json"
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        return FormatPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            format_type="epub", status="spec_ready", output_path=str(spec_path),
            asset_paths={"spec": str(spec_path)}, spec=spec, created_at=time.time(),
        )

    def _print_format(self, metadata, out_dir, format_type, **_) -> FormatPackage:
        spec = dict(_PRINT_SPECS[format_type])
        spec["page_count"] = metadata.page_count
        spec_path = out_dir / f"{format_type}_spec.json"
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        brief_path = out_dir / f"{format_type}_brief.txt"
        brief_path.write_text(
            f"{format_type.replace('_', ' ').title()} production brief for '{metadata.title}'\n"
            f"Trim size options: {', '.join(spec.get('trim_sizes', []))}\n"
            f"Bleed: {spec.get('bleed_in')}in | DPI: {spec.get('dpi')}\n"
            f"This is a real print specification, not a rendered interior --\n"
            f"hand this file plus the manuscript/illustration assets to your\n"
            f"print vendor or interior layout tool. See formats.py docstring\n"
            f"for how to wire in an automatic layout renderer.\n",
            encoding="utf-8",
        )
        return FormatPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            format_type=format_type, status="spec_ready", output_path=str(out_dir),
            asset_paths={"spec": str(spec_path), "brief": str(brief_path)}, spec=spec,
            notes="Production spec generated; interior layout/rendering is a manual step.",
            created_at=time.time(),
        )

    def _generate_pdf(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "pdf", **kw)

    def _generate_hardcover(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "hardcover", **kw)

    def _generate_paperback(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "paperback", **kw)

    def _generate_large_print(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "large_print", **kw)

    def _generate_coloring_book(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "coloring_book", **kw)

    def _generate_activity_book(self, metadata, out_dir, **kw) -> FormatPackage:
        return self._print_format(metadata, out_dir, "activity_book", **kw)

    def _generate_audiobook(self, metadata, out_dir, chapters, **_) -> FormatPackage:
        chapters = chapters or []
        script_lines = [f"AUDIOBOOK NARRATION SCRIPT -- {metadata.title or 'Untitled'}", ""]
        for i, ch in enumerate(chapters, start=1):
            script_lines.append(f"--- Chapter {i}: {ch.get('title', '')} ---")
            script_lines.append(ch.get("narration_text", ch.get("html_body", "")))
            script_lines.append("")
        script_path = out_dir / "narration_script.txt"
        script_path.write_text("\n".join(script_lines) or "No chapters supplied yet.", encoding="utf-8")
        spec = {
            "chapter_count": len(chapters),
            "recommended_voice_pace_wpm": 150,
            "output_format": "mp3_192kbps",
            "note": "No audio is synthesized here -- hand this script to a narrator or "
                    "register a TTS provider (see providers.py) to automate synthesis.",
        }
        spec_path = out_dir / "audiobook_spec.json"
        spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
        return FormatPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            format_type="audiobook", status="spec_ready", output_path=str(out_dir),
            asset_paths={"script": str(script_path), "spec": str(spec_path)}, spec=spec,
            notes="Narration script prepared; audio synthesis is a manual/provider step.",
            created_at=time.time(),
        )

    def _generate_marketing_package(
        self, metadata, out_dir, marketing_provider, book_summary, **_
    ) -> FormatPackage:
        seo_metadata = {
            "title_tag": (metadata.title or "")[:60],
            "meta_description": (metadata.description or "")[:160],
            "keywords": metadata.keywords,
            "og_title": metadata.title,
            "og_description": metadata.marketing_copy or metadata.description,
        }
        assets: List[Dict[str, Any]] = []
        if marketing_provider is not None:
            try:
                assets = marketing_provider.generate(
                    project_id=metadata.project_id,
                    book_summary=book_summary or metadata.description,
                    marketing_copy=metadata.marketing_copy,
                    channels=[
                        "tiktok_video_script", "youtube_shorts_script", "instagram_post",
                        "pinterest_pin", "facebook_ad", "email_campaign",
                    ],
                )
            except Exception as e:  # provider failures shouldn't crash the whole package
                assets = [{"channel": "error", "copy_text": str(e), "status": "failed"}]

        manifest = {"seo_metadata": seo_metadata, "marketing_assets": assets}
        manifest_path = out_dir / "marketing_package.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return FormatPackage(
            id=str(uuid.uuid4()), project_id=metadata.project_id, book_metadata_id=metadata.id,
            format_type="marketing_package", status="generated" if assets else "spec_ready",
            output_path=str(manifest_path), asset_paths={"manifest": str(manifest_path)},
            spec=manifest, created_at=time.time(),
        )
