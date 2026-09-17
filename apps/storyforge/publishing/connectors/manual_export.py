"""
storyforge2/publishing/connectors/manual_export.py — generate upload-ready
folders for platforms with no public submission APIs.

Platforms covered:
- Apple Books (via Apple Books for Authors)
- Google Play Books
- Kobo Writing Life
- B&N Press (Barnes & Noble)
- IngramSpark (print-on-demand)

Each gets a folder with:
- The book file (EPUB for ebook, PDF for IngramSpark print)
- A README with platform-specific upload instructions
- A checklist of what to do on the web UI
- Metadata file (JSON) with structured book info for reference

No "success" or "failure" here — dry_run and real publish both generate the
folder. The human completes the upload manually. This is honest: no APIs to
automate these, so we provide the highest-quality export we can.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from storyforge2.publishing.connectors.base import PublishingConnector, PublishingConnectorResult

__all__ = ["ManualExportConnector"]


class ManualExportConnector(PublishingConnector):
    """Generates upload-ready export folders for draft-export platforms."""

    platform_id = "manual_export"
    name = "Manual Export (Apple Books / Google Play / Kobo / B&N / IngramSpark)"

    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        # Manual export needs no credentials — just a destination folder and files
        return True

    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        """Generates upload-ready export folders. Both dry_run and real modes
        produce the same output (the folder) — there's nothing "real" to do
        since these platforms don't have APIs."""

        if not manuscript_path.exists():
            return PublishingConnectorResult(
                success=False,
                message=f"Manuscript not found: {manuscript_path}",
                platform_id=self.platform_id,
                error_code="file_not_found",
            )

        # Create export directory structure
        export_dir = Path(".") / "storyforge2_exports" / metadata.get("title", "book").replace(" ", "_")
        export_dir.mkdir(parents=True, exist_ok=True)

        # Copy manuscript and cover
        import shutil
        dest_ms = export_dir / manuscript_path.name
        dest_cover = export_dir / cover_path.name if cover_path.exists() else None

        shutil.copy2(manuscript_path, dest_ms)
        if dest_cover and cover_path.exists():
            shutil.copy2(cover_path, dest_cover)

        # Write metadata
        import json
        metadata_file = export_dir / "metadata.json"
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        # Write platform-specific README
        readme_content = _generate_readme(metadata, metadata.get("platforms", []))
        readme_file = export_dir / "README.txt"
        with open(readme_file, "w", encoding="utf-8") as f:
            f.write(readme_content)

        # Write upload checklist
        checklist = _generate_checklist(metadata.get("platforms", []))
        checklist_file = export_dir / "UPLOAD_CHECKLIST.txt"
        with open(checklist_file, "w", encoding="utf-8") as f:
            f.write(checklist)

        return PublishingConnectorResult(
            success=True,
            message=f"Export folder ready: {export_dir}. Open README.txt for platform-specific upload instructions.",
            platform_id=self.platform_id,
            metadata={"export_dir": str(export_dir)},
        )


def _generate_readme(metadata: dict, platforms: list[str]) -> str:
    """Generates platform-specific upload instructions."""
    title = metadata.get("title", "Your Book")
    author = metadata.get("author", "Author")

    readme = f"""
MANUAL EXPORT UPLOAD GUIDE
==========================

Book: {title}
Author: {author}

This folder contains your book files and instructions for uploading to platforms
that do not have public submission APIs. You must complete the upload manually
on each platform's website.

FILES IN THIS FOLDER:
- metadata.json — structured book metadata (reference only)
- {metadata.get('_manuscript_name', 'manuscript.epub')} — your book file
- {metadata.get('_cover_name', 'cover.png')} — your book cover (if present)
- UPLOAD_CHECKLIST.txt — step-by-step checklist for each platform

PLATFORM INSTRUCTIONS:
"""

    instructions = {
        "apple_books": """
APPLE BOOKS FOR AUTHORS
-----------------------
1. Go to https://booksauthor.apple.com/
2. Log in or create an account
3. Click "Add Book" → "Publish a new book"
4. Upload the EPUB file from this folder
5. Fill in title, description, keywords, price (from metadata.json)
6. Upload the cover image
7. Select distribution channels (Apple Books is default)
8. Review and publish
""",
        "google_play_books": """
GOOGLE PLAY BOOKS
-----------------
1. Go to https://play.google.com/books/publish/
2. Log in or create a Google account
3. Click "Create new book"
4. Upload the EPUB or PDF file from this folder
5. Fill in title, description, keywords, price (from metadata.json)
6. Upload the cover image
7. Set your book as for sale
8. Submit for review and publishing
""",
        "kobo_writing_life": """
KOBO WRITING LIFE
-----------------
1. Go to https://writinglife.kobo.com/
2. Log in or create a Kobo account
3. Click "Upload a book"
4. Upload the EPUB file from this folder
5. Fill in title, description, keywords, price (from metadata.json)
6. Upload the cover image
7. Select your book categories
8. Publish to Kobo store (automatically distributes to other retailers)
""",
        "bn_press": """
B&N PRESS
---------
1. Go to https://www.barnesandnoblepress.com/
2. Log in or create an account
3. Click "Publish a Book"
4. Upload the EPUB file from this folder
5. Fill in title, description, keywords, price (from metadata.json)
6. Upload the cover image
7. Review and publish
8. Note: B&N also sells through other platforms via expanded distribution
""",
        "ingramspark": """
INGRAMSPARK (PRINT-ON-DEMAND)
-----------------------------
1. Go to https://www.ingramspark.com/
2. Log in or create an account (requires ISBN — get one from Bowker or use IngramSpark's)
3. Click "Publish a title"
4. Upload the PDF file from this folder (for print, not EPUB)
5. Choose paper color and trim size
6. Upload the cover PDF (must match IngramSpark's specifications)
7. Fill in title, description, keywords, price (from metadata.json)
8. Review and publish
9. Your book will be available through IngramSpark's global distribution network
""",
    }

    for platform in platforms:
        if platform in instructions:
            readme += instructions[platform]

    readme += """
NEED HELP?
---------
- Metadata questions: see metadata.json for structured data
- Format issues: ensure your EPUB/PDF is valid (use an EPUB validator)
- Cover specs: each platform has specific cover dimension requirements (check their help)
- Questions: visit each platform's help center

This folder was generated by Story Forge 2.
"""

    return readme


def _generate_checklist(platforms: list[str]) -> str:
    """Generates a step-by-step checklist for each platform."""
    checklist = """
UPLOAD CHECKLIST
================

Complete these steps for each platform where you want to publish:

APPLE BOOKS
-----------
[ ] Create Apple Books for Authors account
[ ] Click "Add Book" / "Publish a new book"
[ ] Upload EPUB file
[ ] Enter: title, subtitle, description, keywords, price
[ ] Upload cover image
[ ] Select distribution regions (at least United States)
[ ] Accept terms and publish
[ ] Book appears on Apple Books within 24 hours

GOOGLE PLAY BOOKS
-----------------
[ ] Create Google Play Books account
[ ] Click "Create new book"
[ ] Upload EPUB or PDF file
[ ] Enter: title, description, keywords, price
[ ] Upload cover image
[ ] Set as "For sale" with pricing
[ ] Accept content policies
[ ] Submit for review
[ ] Book appears after review (typically 1-5 days)

KOBO WRITING LIFE
-----------------
[ ] Create Kobo Writing Life account
[ ] Click "Upload a book"
[ ] Upload EPUB file
[ ] Enter: title, series (if applicable), description, keywords, price
[ ] Upload cover image (must be 1400x2100 or similar)
[ ] Select primary category
[ ] Accept terms and publish
[ ] Book appears immediately on Kobo + distribution partners

B&N PRESS
---------
[ ] Create B&N Press account
[ ] Click "Publish a Book"
[ ] Upload EPUB file
[ ] Enter: title, subtitle, description, keywords, price
[ ] Upload cover image
[ ] Select price and select "Expanded Distribution" if desired
[ ] Accept terms and publish
[ ] Book appears within 1-2 weeks

INGRAMSPARK (PRINT)
-------------------
[ ] Create IngramSpark account
[ ] Get ISBN (Bowker or IngramSpark's free ISBN)
[ ] Click "Publish a title" (Print Book)
[ ] Choose trim size and paper quality
[ ] Upload PDF file (not EPUB — must be press-ready PDF)
[ ] Upload cover PDF (must match IngramSpark specs exactly)
[ ] Enter: title, author, description, keywords, retail price
[ ] Set up distribution channels
[ ] Proof your book (IngramSpark will send a proof copy for review)
[ ] Approve and publish
[ ] Book available through IngramSpark distribution network

AFTER PUBLISHING
----------------
[ ] Verify book appears on each platform (24-48 hours)
[ ] Check metadata is correct (title, author, description, price)
[ ] Share your book link on social media
[ ] Update your author website with links to each platform
[ ] Monitor sales and reviews

Note: Each platform operates independently. Changes on one platform don't
automatically sync to others. Update each platform if you change pricing,
description, or cover.
"""

    return checklist
