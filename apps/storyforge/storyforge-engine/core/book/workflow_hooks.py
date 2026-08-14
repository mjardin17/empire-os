"""
core/book/workflow_hooks.py — real handlers for the full book pipeline.

Registers two new step types (workflow.py has no "chapters"/"epub_export"
concept at all — these don't exist to override, unlike core/video's
"video" step) and one that closes a real gap: the existing "kdp"/"d2d"/
"payhip" steps (_handle_publish_platform in core/automation/workflow.py)
only call PublishingProvider.publish(), which wraps PlatformExporter.
export() — i.e. they *prepare* a listing package, they never call
Phase 3's publish_package() (the fix for the dead connector.submit()
seam). "submit_platform_packages" is the step that actually does.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict

from core.book.exporter import EpubExporter
from core.book.generator import generate_book
from core.image.image_studio import ImageStudio
from core.publishing.models import BookMetadata
from core.publishing.platform_export import publish_package
from core.publishing.studio import PublishingStudio

_epub_exporter = EpubExporter()
_publishing_studio = PublishingStudio(db_path="storyforge_publishing.db", output_root="publishing_exports")
# Same db_path/output_dir convention as every other ImageStudio instance
# in this engine (main.py, core/book/router.py) — one shared SQLite file.
_image_studio = ImageStudio(db_path="storyforge_images.db", output_dir="generated_images")


def _handle_generate_chapters(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    project_id = config.get("project_id", "")
    result = generate_book(
        niche=config.get("niche", ""),
        title=config.get("title", ""),
        book_type=config.get("book_type", "adult_thriller"),
        provider_name=config.get("provider", "gemini"),
        model=config.get("model", "gemini-2.0-flash"),
        author=config.get("author", "Empire OS Publishing"),
        project_id=project_id,
        image_studio=_image_studio if config.get("generate_cover", True) else None,
        image_provider=config.get("image_provider", "video_pipeline"),
    )

    context["book_manifest"] = result.manifest
    context["cover_image_path"] = result.manifest.cover_image_path
    context["book_metadata"] = BookMetadata(
        id=str(uuid.uuid4()),
        project_id=project_id,
        title=result.manifest.title,
        description=config.get("description", ""),
        author=result.manifest.author,
        categories=config.get("categories", []),
        keywords=config.get("keywords", []),
    )

    return {
        "chapter_count": len(result.manifest.chapters),
        "formula_clean": len(result.chapter_warnings) == 0,
        "chapter_warnings": [w.__dict__ for w in result.chapter_warnings],
        "cover_image_path": result.manifest.cover_image_path,
    }


def _handle_export_epub(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    manifest = context.get("book_manifest")
    if manifest is None:
        return {"status": "error", "message": "context['book_manifest'] is required — run the chapters step first"}

    output_path = config.get("output_path", f"exported_books/{manifest.title.replace(' ', '_')}")
    epub_path = _epub_exporter.export(manifest, output_path)

    context["epub_path"] = epub_path
    context["source_assets"] = {**context.get("source_assets", {}), "epub": epub_path}
    return {"status": "exported", "epub_path": epub_path}


def _handle_submit_platform_packages(config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """The step that actually calls connector.submit() — the "kdp"/
    "d2d"/"payhip" steps that ran earlier in the chain only prepared
    packages via PlatformExporter, matching this engine's existing
    "review before you submit" default. This step is the explicit
    "now actually send it" gate."""
    packages = context.get("platform_packages", {})
    if not packages:
        return {"status": "skipped", "message": "no platform_packages in context — run kdp/d2d/payhip steps first"}

    credentials = config.get("credentials")
    results: Dict[str, Any] = {}
    for platform, package in packages.items():
        result = publish_package(package, credentials)
        _publishing_studio.save_platform_package(package)
        results[platform] = {**result, "package_id": package.id}

    return {"platforms_submitted": list(results.keys()), "results": results}


def register() -> None:
    from core.automation.workflow import register_step_handler, _handle_publish_platform
    register_step_handler("chapters", _handle_generate_chapters)
    register_step_handler("epub_export", _handle_export_epub)
    register_step_handler("submit_platform_packages", _handle_submit_platform_packages)
    # "d2d" is a platform this repo added (Phase 3) that didn't exist in
    # the original _STEP_HANDLERS dict — kdp/etsy/shopify/gumroad/payhip/
    # woocommerce all had one, d2d didn't. Same lambda pattern as those.
    register_step_handler("d2d", lambda c, ctx: _handle_publish_platform("d2d", c, ctx))
