"""
storyforge2/pipeline.py — end-to-end book pipeline orchestrator.

Ties together all pipeline stages (brief → manuscript → layout → cover →
export → publish) into a single runnable flow. This is what the CLI calls.

Stages are deterministic and idempotent — re-running a stage that's already
done produces the same output and doesn't break anything. State is tracked in
state.py's SQLite ledger.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import json
import re

from storyforge2.brief import ProjectBrief
from storyforge2.state import StateStore
from storyforge2.manuscript import generate_manuscript
from storyforge2.layout import plan_layout
from storyforge2.cover.render import render_full_cover_package
from storyforge2.export.epub import generate_and_validate_epub
from storyforge2.export.pdf import generate_and_validate_pdf
from storyforge2.publishing.registry import get_registry

__all__ = ["BookPipeline", "PipelineError"]


def _load_wired_connectors() -> dict[str, type]:
    """Platforms with a real, wired connector beyond manual_export. Checked
    only after the registry confirms DIRECT_API status for a platform_id —
    being in this table does not bypass that check, it only supplies the
    connector class once the registry has already said DIRECT_API applies.
    Imported lazily, same reasoning as manual_export's import inside
    publish() below — avoids importing every connector module (and their
    dependencies, e.g. lib/etsy_listing.py) just to construct a pipeline."""
    from storyforge2.publishing.connectors.etsy_digital import EtsyDigitalConnector
    return {"etsy_digital": EtsyDigitalConnector}


class PipelineError(RuntimeError):
    pass


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    return slug or "untitled"


class BookPipeline:
    """Orchestrates the full book pipeline: brief → manuscript → layout →
    cover → export → publish.

    All stages are logged to a SQLite ledger (state.py, real StateStore API
    — the previous version imported PipelineState/StageStatus, names that
    have never existed in state.py; this was the bug that blocked every
    manuscript-generation attempt since the Book Factory MVP was built on
    2026-08-17, fixed 2026-08-20) for resume/retry capability. DRY_RUN is
    the default — nothing publishes for real without an explicit flag."""

    def __init__(self, brief: ProjectBrief, work_dir: str = "."):
        self.brief = brief
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.slug = _slugify(brief.title)
        self.state = StateStore(db_path=str(self.work_dir / "pipeline_state.db"))
        self.project_id = self.state.create_project(
            {"title": brief.title, "slug": self.slug}, project_id=self.slug)
        # Populated as stages complete, consumed by later stages in the
        # same run — real data, not re-read from disk on every stage.
        self.manuscript = None
        self.manuscript_path: Path | None = None
        self.layout = None
        self.cover_variants: dict | None = None  # values are CoverVariant objects (holds a PIL .image), NOT file paths
        self.cover_dir: Path | None = None
        self.epub_path: Path | None = None
        self.pdf_path: Path | None = None

    def run(self, provider_name: str = "mock", dry_run: bool = True) -> bool:
        """Runs all pipeline stages in order. Returns True if all stages
        complete successfully (or were already complete)."""
        print(f"\n[PIPELINE] {self.brief.title}")
        print(f"[PIPELINE] Work dir: {self.work_dir}")
        print(f"[PIPELINE] Mode: {'DRY_RUN' if dry_run else 'REAL'}, Provider: {provider_name}\n")

        stages_to_run = [
            ("manuscript", self._stage_manuscript),
            ("layout", self._stage_layout),
            ("illustrations", self._stage_illustrations),
            ("cover", self._stage_cover),
            ("export", self._stage_export),
            # "publish" is manual — final step requires credentials
        ]

        for stage_name, stage_func in stages_to_run:
            if self.state.is_stage_complete(self.project_id, stage_name):
                print(f"  ✓ {stage_name.upper()} already complete, skipping")
                continue

            print(f"  ▶ {stage_name.upper()}...")
            run_id = self.state.start_stage(self.project_id, stage_name,
                                            inputs={"provider": provider_name, "dry_run": dry_run}).id
            try:
                outputs = stage_func(provider_name=provider_name, dry_run=dry_run) or {}
                self.state.complete_stage(run_id, outputs)
                print(f"    ✓ {stage_name} complete\n")
            except Exception as e:
                self.state.fail_stage(run_id, str(e)[:500])
                print(f"    ✗ {stage_name} failed: {e}\n")
                return False

        print(f"[PIPELINE] All stages complete!")
        print(f"[PIPELINE] Output: {self.work_dir}")
        return True

    def _stage_manuscript(self, provider_name: str = "mock", dry_run: bool = True):
        """Generate manuscript from brief, then write it to disk in the
        `\\n\\n## {chapter title}\\n{text}` format storyforge/formatter.py's
        make_epub/make_pdf expect (see their real parsing logic — they
        split on that exact separator, not a structured format)."""
        self.manuscript = generate_manuscript(self.brief, provider_name=provider_name)
        if not self.manuscript or not self.manuscript.chapters:
            raise PipelineError("Manuscript generation produced no chapters")

        lines = [self.brief.title]
        for ch in self.manuscript.chapters:
            lines.append(f"\n\n## {ch.title}\n{ch.text}")
        self.manuscript_path = self.work_dir / f"{self.slug}_manuscript.txt"
        self.manuscript_path.write_text("".join(lines), encoding="utf-8")

        return {"word_count": self.manuscript.word_count,
                "chapters": len(self.manuscript.chapters),
                "manuscript_path": str(self.manuscript_path),
                "all_chapters_valid": self.manuscript.formula_clean}

    def _stage_layout(self, provider_name: str = "mock", dry_run: bool = True):
        """Plan chapter/page layout from the real manuscript produced by the
        previous stage — plan_layout() needs actual chapter text (for
        illustration prompts and real word counts), not just the brief's
        target chapter count."""
        if not self.manuscript:
            raise PipelineError("No manuscript available — manuscript stage must run first")

        self.layout = plan_layout(self.manuscript)
        layout_path = self.work_dir / "layout.json"
        layout_path.write_text(json.dumps({
            "total_estimated_pages": self.layout.total_estimated_pages,
            "chapters": len(self.layout.chapters),
        }))
        return {"total_estimated_pages": self.layout.total_estimated_pages}

    def _stage_illustrations(self, provider_name: str = "mock", dry_run: bool = True):
        """Generate character sheets and per-scene illustrations.

        NOT YET IMPLEMENTED — this is a real, separate scope (image
        generation per scene, character consistency across images) that
        genuinely doesn't exist yet, not a bug to silently paper over. The
        directory is created so downstream stages have a stable path to
        check, but nothing real is produced here."""
        illus_dir = self.work_dir / "illustrations"
        illus_dir.mkdir(exist_ok=True)
        return {"status": "not_implemented", "note": "illustration generation is future scope"}

    def _stage_cover(self, provider_name: str = "mock", dry_run: bool = True):
        """Render full cover package. Needs the real page count from the
        layout stage for spine-width math — a wrong page count produces a
        wrong spine width, which is a real print-quality defect, not a
        cosmetic one."""
        if not self.layout:
            raise PipelineError("No layout available — layout stage must run first")
        page_count = self.layout.total_estimated_pages
        self.cover_dir = self.work_dir / "covers"
        self.cover_variants = render_full_cover_package(
            self.brief, page_count=page_count, output_dir=str(self.cover_dir),
            provider_name=provider_name, dry_run=dry_run, dpi=150,  # 150 DPI for speed in dry-run
            back_blurb="",
        )
        if not self.cover_variants:
            raise PipelineError("Cover rendering produced no variants")
        return {"variants": list(self.cover_variants.keys())}

    def _stage_export(self, provider_name: str = "mock", dry_run: bool = True):
        """Export to EPUB and PDF with validation — calls the real
        generators (storyforge2/export/{epub,pdf}.py), which were already
        built and working but never actually invoked from here; this stage
        previously just wrote a marker text file instead of calling them."""
        if not self.manuscript_path or not self.manuscript_path.exists():
            raise PipelineError("No manuscript available — manuscript stage must run first")

        export_dir = self.work_dir / "exports"
        export_dir.mkdir(exist_ok=True)

        # render_full_cover_package saves real PNG files under a fixed
        # naming convention (cover_ebook.png, cover_front.png, ...) but
        # returns CoverVariant objects (PIL image + metadata) keyed by a
        # different name ("ebook", "print_front", ...) — there's no path
        # field to read, so the file path is reconstructed from the known
        # save-time filename instead. "ebook" is the flat, spine-less cover
        # KDP/Apple/etc. actually want for an EPUB, not the print wrap.
        front_cover_path = None
        if self.cover_dir and "ebook" in (self.cover_variants or {}):
            candidate = self.cover_dir / "cover_ebook.png"
            if candidate.exists():
                front_cover_path = candidate

        manifest = {
            "slug": self.slug,
            "title": self.brief.title,
            "manuscript": str(self.manuscript_path),
            "cover": str(front_cover_path) if front_cover_path else "",
        }

        # NOTE: make_epub()/make_pdf() (storyforge/formatter.py) ignore the
        # output_path argument entirely and always save to
        # {book_dir}/{slug}.{ext} — book_dir is passed as self.work_dir
        # here, so that's where the real files land, not export_dir. The
        # output_path arg is passed through anyway for API-contract
        # consistency with the two functions' documented signatures, but
        # don't trust it for the real path — self.epub_path/pdf_path below
        # are read from the functions' actual return values instead.
        epub_ok, epub_path, epub_errors, epub_warnings = generate_and_validate_epub(
            manifest, self.work_dir, export_dir / f"{self.slug}.epub", strict=False)
        pdf_ok, pdf_path, pdf_errors, pdf_warnings = generate_and_validate_pdf(
            manifest, self.work_dir, export_dir / f"{self.slug}.pdf", strict=False)

        if not epub_ok:
            raise PipelineError(f"EPUB generation/validation failed: {epub_errors}")
        if not pdf_ok:
            raise PipelineError(f"PDF generation/validation failed: {pdf_errors}")

        self.epub_path = epub_path
        self.pdf_path = pdf_path

        return {
            "epub_path": str(epub_path), "epub_warnings": epub_warnings,
            "pdf_path": str(pdf_path), "pdf_warnings": pdf_warnings,
        }

    def publish(self, platforms: Optional[list[str]] = None,
               credentials: Optional[dict[str, str]] = None, dry_run: bool = True) -> dict:
        """Publishes to specified platforms. Returns a dict mapping platform
        IDs to results. Runs in DRY_RUN by default (logs what would happen).

        Only calls a connector when the registry marks the platform
        DIRECT_API or AGGREGATOR_DISTRIBUTION AND is_configured() returns
        True for real credentials — anything else returns an honest
        `not_configured`/`unsupported` result rather than a fake
        "placeholder" success, which is what this method previously always
        returned regardless of whether any connector existed."""
        from storyforge2.publishing.connectors import manual_export
        from connector_core import ConnectorStatus

        platforms = platforms or ["manual_export"]
        registry = get_registry()
        results: dict[str, dict] = {}

        print(f"\n[PUBLISH] Platforms: {platforms}")
        print(f"[PUBLISH] Mode: {'DRY_RUN' if dry_run else 'REAL'}\n")

        connector_run_id = self.state.start_stage(
            self.project_id, "publish", inputs={"platforms": platforms, "dry_run": dry_run}).id

        for platform_id in platforms:
            # manual_export isn't an external platform with its own API
            # status — it's the always-available fallback connector that
            # produces an upload-ready package for ANY platform, so it's
            # handled before the registry lookup rather than requiring a
            # registry entry of its own.
            if platform_id == "manual_export":
                connector = manual_export.ManualExportConnector()
                cap_name = "Manual export package"
            else:
                cap = registry.get(platform_id)
                if not cap:
                    results[platform_id] = {"status": "unsupported", "message": "not in registry"}
                    continue
                cap_name = cap.name
                if cap.status != ConnectorStatus.DIRECT_API:
                    results[platform_id] = {
                        "status": "unsupported",
                        "message": f"{cap.name} is {cap.status.value} — no automated publish path exists",
                    }
                    print(f"    ⚠ {platform_id}: {results[platform_id]['message']}\n")
                    continue
                # DIRECT_API in the registry does not itself guarantee a real
                # connector module exists and is wired here — check the real
                # wiring table rather than assuming every DIRECT_API entry
                # has one (manual_export is handled above; everything else
                # not in this table has no connector yet).
                connector_cls = _load_wired_connectors().get(platform_id)
                if connector_cls is None:
                    results[platform_id] = {
                        "status": "not_implemented",
                        "message": f"{cap_name} registry entry has no real connector wired in yet",
                    }
                    print(f"    ⚠ {platform_id}: {results[platform_id]['message']}\n")
                    continue
                connector = connector_cls()

            print(f"  ▶ {cap_name}...")

            if not connector.is_configured(credentials):
                results[platform_id] = {"status": "not_configured",
                                        "message": f"{cap.name} credentials not set"}
                print(f"    ⚠ {platform_id}: credentials not configured\n")
                continue

            if not self.epub_path or not self.epub_path.exists():
                results[platform_id] = {"status": "failed",
                                        "message": "no EPUB available — export stage must run first"}
                print(f"    ✗ {platform_id}: export stage must run first\n")
                continue

            cover_path = (self.cover_dir / "cover_ebook.png") if self.cover_dir else Path("")
            result = connector.publish(
                manuscript_path=self.epub_path,
                cover_path=cover_path,
                metadata={"title": self.brief.title, "slug": self.slug},
                credentials=credentials, dry_run=dry_run,
            )
            results[platform_id] = {"status": "ok" if result.success else "failed",
                                    "message": result.message}
            print(f"    {'✓' if result.success else '✗'} {platform_id}: {result.message}\n")

        self.state.complete_stage(connector_run_id, results)
        return results
