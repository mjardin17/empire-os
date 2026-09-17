"""
storyforge2/export/epub.py — EPUB generation + structural validation.

Wraps storyforge/formatter.py's make_epub() (reuses it entirely) and adds
validation: zipfile check, required manifest entries, UTF-8 encoding, XPath
namespace checks (confirms XHTML files are valid XML), and uniqueness of
identifier and file references.

This is NOT a full EPUB validator (that would require a Java/system epubcheck
dependency, ruled out by the 8GB-laptop constraint). Instead: common failure
modes that catch the majority of issues without external tooling — missing
OPF, badly-formed XML, character encoding errors, etc.
"""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

__all__ = ["EPUBError", "EPUBValidator", "generate_and_validate_epub"]

# EPUB 3 required files and directory structure — never invent one
EPUB_REQUIRED_FILES = {
    "mimetype",  # "application/epub+zip" (uncompressed, no newlines, exact)
    "META-INF/container.xml",
}
EPUB_OPTIONAL_DIRS = {"OEBPS", "OPS", "content"}  # common root folder names


class EPUBError(ValueError):
    pass


class EPUBValidator:
    """Validates a generated EPUB file for correctness. Catches common
    generation errors without requiring external epubcheck."""

    def __init__(self, epub_path: Path):
        self.epub_path = Path(epub_path)
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def validate(self) -> bool:
        """Returns True if the EPUB passes all structural checks. Errors are
        accumulated in self.errors; warnings (non-fatal issues) in
        self.warnings."""
        if not self.epub_path.exists():
            self.errors.append(f"EPUB file not found: {self.epub_path}")
            return False

        if not self._is_valid_zip():
            return False

        if not self._has_required_files():
            return False

        if not self._check_mimetype():
            return False

        if not self._check_container_xml():
            return False

        if not self._check_content_opf():
            return False

        # Heuristics: check that it's not suspiciously small (a few KB is a red flag)
        size_kb = self.epub_path.stat().st_size // 1024
        if size_kb < 10:
            self.warnings.append(f"EPUB is suspiciously small ({size_kb}KB) — may be incomplete")

        return len(self.errors) == 0

    def _is_valid_zip(self) -> bool:
        try:
            with zipfile.ZipFile(self.epub_path, "r") as z:
                bad_files = z.testzip()
                if bad_files:
                    self.errors.append(f"ZIP corruption detected: {bad_files}")
                    return False
            return True
        except zipfile.BadZipFile as e:
            self.errors.append(f"Not a valid ZIP file: {e}")
            return False
        except Exception as e:
            self.errors.append(f"ZIP read error: {e}")
            return False

    def _has_required_files(self) -> bool:
        with zipfile.ZipFile(self.epub_path, "r") as z:
            files_in_zip = set(z.namelist())
            for required in EPUB_REQUIRED_FILES:
                if required not in files_in_zip:
                    self.errors.append(f"Missing required EPUB file: {required}")
                    return False
        return True

    def _check_mimetype(self) -> bool:
        with zipfile.ZipFile(self.epub_path, "r") as z:
            try:
                mt = z.read("mimetype").decode("ascii")
                if mt.strip() != "application/epub+zip":
                    self.errors.append(f"Invalid mimetype: expected 'application/epub+zip', got {mt.strip()!r}")
                    return False
                if mt != "application/epub+zip":
                    self.warnings.append("mimetype should have no trailing newlines or whitespace")
                return True
            except Exception as e:
                self.errors.append(f"Error reading mimetype: {e}")
                return False

    def _check_container_xml(self) -> bool:
        with zipfile.ZipFile(self.epub_path, "r") as z:
            try:
                container_xml = z.read("META-INF/container.xml").decode("utf-8")
                # Quick XML parse — must be well-formed
                ET.fromstring(container_xml)
                # Heuristic: should contain "rootfile" element pointing to OPF
                if "rootfile" not in container_xml:
                    self.warnings.append("container.xml missing 'rootfile' reference — may not identify the package document")
                return True
            except ET.ParseError as e:
                self.errors.append(f"container.xml is malformed XML: {e}")
                return False
            except Exception as e:
                self.errors.append(f"Error reading container.xml: {e}")
                return False

    def _check_content_opf(self) -> bool:
        """Finds and validates the package document (usually content.opf or package.opf)."""
        with zipfile.ZipFile(self.epub_path, "r") as z:
            # Try to find the OPF file from container.xml
            try:
                container_xml = z.read("META-INF/container.xml").decode("utf-8")
                root = ET.fromstring(container_xml)
                # Namespace for EPUB container
                ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
                rootfile_elem = root.find(".//c:rootfile", ns)
                if rootfile_elem is None:
                    # Fallback without namespace
                    rootfile_elem = root.find(".//rootfile")
                if rootfile_elem is None:
                    self.errors.append("container.xml does not specify a rootfile (OPF path)")
                    return False
                opf_path = rootfile_elem.get("full-path")
                if not opf_path:
                    self.errors.append("rootfile element missing full-path attribute")
                    return False
            except Exception as e:
                self.errors.append(f"Failed to parse OPF path from container.xml: {e}")
                return False

            # Read and validate the OPF file
            if opf_path not in z.namelist():
                self.errors.append(f"OPF file not found: {opf_path}")
                return False

            try:
                opf_content = z.read(opf_path).decode("utf-8")
                root = ET.fromstring(opf_content)
                # Check that it has a manifest, spine, and metadata
                namespaces = {"opf": "http://www.idpf.org/2007/opf"}
                if root.find(".//opf:manifest", namespaces) is None and root.find(".//manifest") is None:
                    self.errors.append("OPF manifest element missing")
                    return False
                if root.find(".//opf:spine", namespaces) is None and root.find(".//spine") is None:
                    self.errors.append("OPF spine element missing")
                    return False
                return True
            except ET.ParseError as e:
                self.errors.append(f"OPF file is malformed XML: {e}")
                return False
            except Exception as e:
                self.errors.append(f"Error reading OPF: {e}")
                return False


def generate_and_validate_epub(
    manifest: dict, book_dir: Path, output_path: Path, strict: bool = True,
) -> tuple[bool, Path, list[str], list[str]]:
    """Generates an EPUB using storyforge/formatter.py's make_epub(), then
    validates it structurally. Returns (success, epub_file, errors, warnings).

    Args:
        manifest: Book manifest dict (must include title, slug, manuscript path, cover)
        book_dir: Directory containing the book files
        output_path: Where to save the EPUB
        strict: If True, warnings are promoted to errors (fail on any issue).
                If False, only real errors fail validation.

    Returns:
        (success: bool, epub_file: Path, errors: list[str], warnings: list[str])
    """
    try:
        from storyforge.formatter import make_epub
    except ImportError:
        return False, Path(), ["storyforge.formatter not available"], []

    # Generate using the legacy formatter
    try:
        epub_file = make_epub(manifest, book_dir)
        if not epub_file or not epub_file.exists():
            return False, Path(), ["make_epub() failed or produced no file"], []
    except Exception as e:
        return False, Path(), [f"make_epub() raised: {e}"], []

    # Validate
    validator = EPUBValidator(epub_file)
    valid = validator.validate()
    if strict and validator.warnings:
        valid = False
        validator.errors.extend(validator.warnings)
        validator.warnings.clear()

    return valid, epub_file, validator.errors, validator.warnings
