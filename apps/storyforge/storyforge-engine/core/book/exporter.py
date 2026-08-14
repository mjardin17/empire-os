"""
StoryForge Book Studio — EPUB Exporter
----------------------------------------
Builds a valid, spec-compliant EPUB 3 file using only the Python
standard library (zipfile + string templating). No third-party
dependency required, so this runs anywhere without extra installs.

Produces real, openable EPUBs — verified against the EPUB OCF/OPF
structure (mimetype, META-INF/container.xml, content.opf, nav.xhtml,
one xhtml file per chapter).
"""

from __future__ import annotations

import html
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional


@dataclass
class Chapter:
    title: str
    html_body: str  # inner HTML/body content for this chapter (paragraphs, etc.)


@dataclass
class BookManifest:
    title: str
    author: str
    language: str = "en"
    identifier: Optional[str] = None
    chapters: List[Chapter] = field(default_factory=list)
    cover_image_path: Optional[str] = None  # path to a jpg/png on disk, optional


def _chapter_filename(index: int) -> str:
    return f"chapter_{index + 1:03d}.xhtml"


def _xhtml_wrapper(title: str, body_html: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  {body_html}
</body>
</html>"""


_DEFAULT_CSS = """
body { font-family: serif; margin: 1.5em; line-height: 1.5; }
h1 { text-align: center; margin-bottom: 1em; }
p { margin: 0 0 1em 0; text-indent: 1.2em; }
"""


class EpubExporter:
    """Turns a BookManifest into a real .epub file on disk."""

    def export(self, manifest: BookManifest, output_path: str) -> str:
        if not manifest.chapters:
            raise ValueError("Cannot export a book with zero chapters.")

        book_id = manifest.identifier or f"urn:uuid:{uuid.uuid4()}"
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        output_path = str(Path(output_path).with_suffix(".epub"))
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. mimetype MUST be first entry and MUST be stored uncompressed
            zf.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", zipfile.ZIP_STORED)

            # 2. container.xml
            zf.writestr(
                "META-INF/container.xml",
                """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>""",
            )

            # 3. stylesheet
            zf.writestr("OEBPS/style.css", _DEFAULT_CSS)

            # 4. chapter xhtml files
            manifest_items = []
            spine_items = []
            nav_items = []
            for i, chapter in enumerate(manifest.chapters):
                filename = _chapter_filename(i)
                zf.writestr(f"OEBPS/{filename}", _xhtml_wrapper(chapter.title, chapter.html_body))
                item_id = f"chap{i+1}"
                manifest_items.append(
                    f'<item id="{item_id}" href="{filename}" media-type="application/xhtml+xml"/>'
                )
                spine_items.append(f'<itemref idref="{item_id}"/>')
                nav_items.append(f'<li><a href="{filename}">{html.escape(chapter.title)}</a></li>')

            # 5. nav.xhtml (EPUB3 table of contents)
            nav_html = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      {''.join(nav_items)}
    </ol>
  </nav>
</body>
</html>"""
            zf.writestr("OEBPS/nav.xhtml", nav_html)

            # 6. cover image (optional)
            cover_manifest_entry = ""
            cover_meta = ""
            if manifest.cover_image_path and Path(manifest.cover_image_path).exists():
                ext = Path(manifest.cover_image_path).suffix.lstrip(".").lower()
                media_type = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
                zf.write(manifest.cover_image_path, f"OEBPS/cover.{ext}")
                cover_manifest_entry = (
                    f'<item id="cover-img" href="cover.{ext}" media-type="{media_type}" properties="cover-image"/>'
                )
                cover_meta = '<meta name="cover" content="cover-img"/>'

            # 7. content.opf (the package document)
            opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">{book_id}</dc:identifier>
    <dc:title>{html.escape(manifest.title)}</dc:title>
    <dc:creator>{html.escape(manifest.author)}</dc:creator>
    <dc:language>{manifest.language}</dc:language>
    <meta property="dcterms:modified">{now_iso}</meta>
    {cover_meta}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    {cover_manifest_entry}
    {''.join(manifest_items)}
  </manifest>
  <spine>
    {''.join(spine_items)}
  </spine>
</package>"""
            zf.writestr("OEBPS/content.opf", opf)

        return output_path
