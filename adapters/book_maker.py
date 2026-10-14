import os
import sys
import uuid
import time
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from shared.logger import logger
from shared.approval_gate import approval_gate

import ebooklib
from ebooklib import epub
from reportlab.lib.pagesizes import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

class BookMakerAdapter:
    """
    Book Maker Job API Adapter
    Wraps storyforge2 manuscript -> EPUB/PDF pipeline behind a structured job API:
    submit_job -> generate_manuscript -> compile EPUB + PDF + Metadata -> return bundle
    """
    def __init__(self, output_dir: Optional[Path] = None):
        self.output_dir = output_dir or Path(__file__).resolve().parent.parent / "output" / "book_maker"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def submit_job(self, title: str, author: str, chapters: List[Dict[str, str]], joshua_approved: bool = False) -> Dict[str, Any]:
        job_id = f"job_book_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        # 1. Approval Gate Evaluation
        gate_decision = approval_gate.evaluate(
            action="generate_book",
            factory="BOOK_MAKER",
            payload={"title": title, "author": author, "chapter_count": len(chapters), "job_id": job_id},
            joshua_approved=joshua_approved
        )

        logger.info(
            message=f"Submitting Book Maker job {job_id} for '{title}' ({len(chapters)} chapters)",
            factory="BOOK_MAKER",
            data={"job_id": job_id, "title": title, "chapters": len(chapters), "gate_mode": gate_decision["mode"]}
        )

        return self.render_book(job_id=job_id, title=title, author=author, chapters=chapters, gate_mode=gate_decision["mode"])

    def render_book(self, job_id: str, title: str, author: str, chapters: List[Dict[str, str]], gate_mode: str) -> Dict[str, Any]:
        book_dir = self.output_dir / f"{job_id}_{title.lower().replace(' ', '_')[:30]}"
        book_dir.mkdir(parents=True, exist_ok=True)

        epub_path = book_dir / f"{title.lower().replace(' ', '_')}.epub"
        pdf_path = book_dir / f"{title.lower().replace(' ', '_')}.pdf"
        meta_path = book_dir / "metadata.json"

        try:
            # 1. Generate EPUB via ebooklib
            book = epub.EpubBook()
            book.set_identifier(f"empire-os-{job_id}")
            book.set_title(title)
            book.set_language("en")
            book.add_author(author)

            epub_chapters = []
            for idx, ch in enumerate(chapters, 1):
                ch_title = ch.get("title", f"Chapter {idx}")
                ch_content = ch.get("content", "")
                
                c = epub.EpubHtml(title=ch_title, file_name=f"chap_{idx:02d}.xhtml", lang="en")
                c.content = f"<h2>{ch_title}</h2>" + "".join(f"<p>{p.strip()}</p>" for p in ch_content.split("\n\n") if p.strip())
                book.add_item(c)
                epub_chapters.append(c)

            book.toc = tuple(epub_chapters)
            book.add_item(epub.EpubNcx())
            book.add_item(epub.EpubNav())

            # Basic styling
            style = "body { font-family: Georgia, serif; margin: 5%; } h2 { text-align: center; color: #333; }"
            nav_css = epub.EpubItem(uid="style_nav", file_name="style/nav.css", media_type="text/css", content=style)
            book.add_item(nav_css)

            book.spine = ["nav"] + epub_chapters
            epub.write_epub(str(epub_path), book, {})

            # 2. Generate 6x9 PDF via reportlab
            doc = SimpleDocTemplate(
                str(pdf_path),
                pagesize=(6 * inch, 9 * inch),
                leftMargin=0.75 * inch,
                rightMargin=0.75 * inch,
                topMargin=0.75 * inch,
                bottomMargin=0.75 * inch
            )
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle("BookTitle", parent=styles["Heading1"], alignment=1, fontSize=24, leading=28, spaceAfter=20)
            author_style = ParagraphStyle("BookAuthor", parent=styles["Normal"], alignment=1, fontSize=14, leading=18, spaceAfter=40)
            ch_heading_style = ParagraphStyle("ChapterHeading", parent=styles["Heading2"], alignment=0, fontSize=16, leading=20, spaceBefore=20, spaceAfter=12)
            body_style = ParagraphStyle("BookBody", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=8)

            story = [
                Spacer(1, 1 * inch),
                Paragraph(title, title_style),
                Paragraph(f"by {author}", author_style),
                Spacer(1, 2 * inch),
                Paragraph("Empire OS Book Maker Pipeline Test", styles["Italic"]),
                PageBreak()
            ]

            for idx, ch in enumerate(chapters, 1):
                ch_title = ch.get("title", f"Chapter {idx}")
                ch_content = ch.get("content", "")
                story.append(Paragraph(f"Chapter {idx}: {ch_title}", ch_heading_style))
                for paragraph in ch_content.split("\n\n"):
                    if paragraph.strip():
                        story.append(Paragraph(paragraph.strip(), body_style))
                story.append(PageBreak())

            doc.build(story)

            # 3. Generate Metadata Package
            placeholder_isbn = f"978-1-{job_id[-6:]}-0"
            metadata = {
                "job_id": job_id,
                "title": title,
                "author": author,
                "isbn_placeholder": placeholder_isbn,
                "chapter_count": len(chapters),
                "bisac": ["BUS000000", "TECH000000"],
                "price": "$0.00",  # Test fixture default price rule
                "description": f"Test manuscript '{title}' formatted end-to-end for publication via StoryForge 2.",
                "channels": ["Amazon KDP", "Apple Books", "Google Play", "Kobo", "Barnes & Noble", "IngramSpark"]
            }
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)

            result = {
                "job_id": job_id,
                "status": "COMPLETED",
                "title": title,
                "author": author,
                "chapter_count": len(chapters),
                "epub_path": str(epub_path),
                "pdf_path": str(pdf_path),
                "metadata_path": str(meta_path),
                "gate_mode": gate_mode,
                "error": None
            }

            logger.info(
                message=f"Book Maker job {job_id} completed successfully",
                factory="BOOK_MAKER",
                data=result
            )

            return result

        except Exception as e:
            logger.error(f"Book Maker job {job_id} failed: {str(e)}", factory="BOOK_MAKER")
            return {
                "job_id": job_id,
                "status": "FAILED",
                "title": title,
                "author": author,
                "chapter_count": len(chapters),
                "epub_path": None,
                "pdf_path": None,
                "metadata_path": None,
                "gate_mode": gate_mode,
                "error": str(e)
            }
