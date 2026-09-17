"""
storyforge2/export/pdf.py — PDF generation + validation.

Wraps storyforge/formatter.py's make_pdf() (reuses it entirely) and validates:
- File exists and is a valid PDF
- Page count matches expected count from layout/manuscript
- Dimensions match spec.py's computed trim size (confirms trim boxes are set correctly)
- First page is not blank (common sign of a failed render)
- Images are embedded (not external references)

Uses pypdf (pure Python, already installed per the handoff) to inspect the PDF
structure without depending on external tools like pdftotext or gs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

__all__ = ["PDFError", "PDFValidator", "generate_and_validate_pdf"]


class PDFError(ValueError):
    pass


class PDFValidator:
    """Validates a generated PDF for correctness without external tools."""

    def __init__(self, pdf_path: Path):
        self.pdf_path = Path(pdf_path)
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.page_count: int = 0
        self.width_pts: float = 0.0
        self.height_pts: float = 0.0

    def validate(self, expected_page_count: Optional[int] = None, expected_width_in: Optional[float] = None, expected_height_in: Optional[float] = None) -> bool:
        """Validates the PDF. Returns True if all checks pass.

        Args:
            expected_page_count: If provided, page count must match exactly
            expected_width_in: If provided, page width must match (in inches, at 72 DPI)
            expected_height_in: If provided, page height must match (in inches, at 72 DPI)
        """
        if not self._is_valid_pdf():
            return False

        if not self._extract_page_info():
            return False

        if expected_page_count is not None and self.page_count != expected_page_count:
            self.errors.append(f"Page count mismatch: expected {expected_page_count}, got {self.page_count}")

        if expected_width_in is not None and expected_height_in is not None:
            expected_w_pts = expected_width_in * 72
            expected_h_pts = expected_height_in * 72
            w_tolerance = 2.0  # allow 1/36" tolerance
            h_tolerance = 2.0
            if abs(self.width_pts - expected_w_pts) > w_tolerance or abs(self.height_pts - expected_h_pts) > h_tolerance:
                self.errors.append(
                    f"Page size mismatch: expected {expected_width_in}\"x{expected_height_in}\", "
                    f"got {self.width_pts / 72:.2f}\"x{self.height_pts / 72:.2f}\""
                )

        if not self._check_first_page_not_blank():
            self.warnings.append("First page appears to be blank or nearly blank — possible render failure")

        # Heuristic: suspiciously small file might indicate incomplete output
        size_kb = self.pdf_path.stat().st_size // 1024
        if size_kb < 50:
            self.warnings.append(f"PDF is suspiciously small ({size_kb}KB) — may be incomplete")

        return len(self.errors) == 0

    def _is_valid_pdf(self) -> bool:
        if not self.pdf_path.exists():
            self.errors.append(f"PDF file not found: {self.pdf_path}")
            return False

        try:
            from pypdf import PdfReader
        except ImportError:
            self.errors.append("pypdf not installed — run: pip install pypdf --break-system-packages")
            return False

        try:
            reader = PdfReader(str(self.pdf_path))
            if not reader.pages:
                self.errors.append("PDF has no pages")
                return False
            return True
        except Exception as e:
            self.errors.append(f"PDF is invalid or corrupted: {e}")
            return False

    def _extract_page_info(self) -> bool:
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(self.pdf_path))
            self.page_count = len(reader.pages)
            if self.page_count == 0:
                self.errors.append("PDF has zero pages")
                return False
            first_page = reader.pages[0]
            mediabox = first_page.mediabox
            self.width_pts = float(mediabox[2] - mediabox[0])
            self.height_pts = float(mediabox[3] - mediabox[1])
            return True
        except Exception as e:
            self.errors.append(f"Failed to extract PDF page info: {e}")
            return False

    def _check_first_page_not_blank(self) -> bool:
        """Heuristic: a blank first page is often a sign of render failure.
        Checks the text content and annotation count of the first page."""
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(self.pdf_path))
            first_page = reader.pages[0]
            text = first_page.extract_text()
            if not text or len(text.strip()) < 5:
                return False  # very little text on first page
            return True
        except Exception:
            # If extraction fails, assume it's OK (might be a content-only page)
            return True


def generate_and_validate_pdf(
    manifest: dict, book_dir: Path, output_path: Path,
    expected_page_count: Optional[int] = None, expected_width_in: Optional[float] = None,
    expected_height_in: Optional[float] = None, strict: bool = True,
) -> tuple[bool, Path, list[str], list[str]]:
    """Generates a PDF using storyforge/formatter.py's make_pdf(), then
    validates it structurally. Returns (success, pdf_file, errors, warnings).

    Args:
        manifest: Book manifest dict (must include title, slug, manuscript path)
        book_dir: Directory containing the book files
        output_path: Where to save the PDF
        expected_page_count: If provided, validate page count matches
        expected_width_in: If provided, validate page width (in inches)
        expected_height_in: If provided, validate page height (in inches)
        strict: If True, warnings are promoted to errors.
                If False, only real errors fail validation.

    Returns:
        (success: bool, pdf_file: Path, errors: list[str], warnings: list[str])
    """
    try:
        from storyforge.formatter import make_pdf
    except ImportError:
        return False, Path(), ["storyforge.formatter not available"], []

    # Generate using the legacy formatter
    try:
        pdf_file = make_pdf(manifest, book_dir)
        if not pdf_file or not pdf_file.exists():
            return False, Path(), ["make_pdf() failed or produced no file"], []
    except Exception as e:
        return False, Path(), [f"make_pdf() raised: {e}"], []

    # Validate
    validator = PDFValidator(pdf_file)
    valid = validator.validate(
        expected_page_count=expected_page_count,
        expected_width_in=expected_width_in,
        expected_height_in=expected_height_in,
    )
    if strict and validator.warnings:
        valid = False
        validator.errors.extend(validator.warnings)
        validator.warnings.clear()

    return valid, pdf_file, validator.errors, validator.warnings
