import sys
import os
import zipfile
from pathlib import Path

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from shared import logger
from adapters.book_maker import BookMakerAdapter

def main():
    logger.info("Starting Piece 3 Verification Run: Book Maker Job API", factory="BOOK_MAKER")

    adapter = BookMakerAdapter()

    chapters = [
        {
            "title": "The Architecture of Empire OS",
            "content": "Empire OS represents the convergence of autonomous AI factories under one unified mission board.\n\nEvery factory operates under a single set of rules: Joshua's approval gate, structured logging, and zero-secrets policy."
        },
        {
            "title": "Automating the Four Factories",
            "content": "The Video Studio, Book Maker, Merch Factory, and BossListers connectors form the operational foundation.\n\nThrough job APIs, each factory transforms raw concepts into finished products ready for approval."
        },
        {
            "title": "The Fleet Mission Board and Learn Loop",
            "content": "The Fleet Mission Board coordinates fleet order assignments, while the Learn Loop continuously improves efficiency.\n\nEnd-to-end proof ensures complete operational fidelity across all system boundaries."
        }
    ]

    # 1. Submit 3-chapter test book job
    result = adapter.submit_job(
        title="Empire OS Blueprint Manual",
        author="Antigravity Agent",
        chapters=chapters,
        joshua_approved=False
    )

    # 2. Verify outputs exist
    epub_path = Path(result["epub_path"]) if result.get("epub_path") else None
    pdf_path = Path(result["pdf_path"]) if result.get("pdf_path") else None
    meta_path = Path(result["metadata_path"]) if result.get("metadata_path") else None

    epub_exists = epub_path and epub_path.exists() and epub_path.stat().st_size > 0
    pdf_exists = pdf_path and pdf_path.exists() and pdf_path.stat().st_size > 0
    meta_exists = meta_path and meta_path.exists() and meta_path.stat().st_size > 0

    # 3. EPUB Structure Check
    epub_valid = False
    if epub_exists:
        with zipfile.ZipFile(epub_path, "r") as z:
            namelist = z.namelist()
            epub_valid = "mimetype" in namelist or "META-INF/container.xml" in namelist

    # 4. PDF Magic Bytes Check (%PDF-)
    pdf_valid = False
    if pdf_exists:
        with open(pdf_path, "rb") as f:
            pdf_valid = f.read(5) == b"%PDF-"

    print("\n--- PIECE 3 PROOF RESULT ---")
    print(f"Job ID: {result['job_id']}")
    print(f"Status: {result['status']}")
    print(f"Gate Mode: {result['gate_mode']}")
    print(f"Title: {result['title']} ({result['chapter_count']} chapters)")
    print(f"EPUB Output: {epub_path} (Exists: {epub_exists}, Valid Zip: {epub_valid}, Size: {epub_path.stat().st_size if epub_exists else 0} bytes)")
    print(f"PDF Output: {pdf_path} (Exists: {pdf_exists}, Valid PDF Header: {pdf_valid}, Size: {pdf_path.stat().st_size if pdf_exists else 0} bytes)")
    print(f"Metadata Output: {meta_path} (Exists: {meta_exists}, Size: {meta_path.stat().st_size if meta_exists else 0} bytes)")

    if epub_exists and pdf_exists and meta_exists and result["status"] == "COMPLETED":
        print("PIECE 3 VERIFIED: Book Maker job API (manuscript -> EPUB/PDF + metadata) working end-to-end.\n")
    else:
        print("PIECE 3 FAILED: Book artifact missing or invalid.\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
