"""
storyforge2/publishing/connectors/base.py — base interface for all publishing
connectors.

A connector submits a book to one platform. It can validate configuration (are
credentials present?), perform a dry-run (log what would happen without posting),
and execute a real publish.

Result format is standardized so state.py can record it consistently across all
platforms.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from connector_core import ConnectorResult

__all__ = ["PublishingConnectorResult", "PublishingConnector"]


# Alias, not a redefinition: books and merch record outcomes into the same
# ledger, so they must share one result shape. Kept under the old name so
# existing book connectors need no edit.
PublishingConnectorResult = ConnectorResult


class PublishingConnector(ABC):
    """Base class for all publishing connectors. Subclasses implement the
    actual publish logic for one platform."""

    platform_id: str = "base"
    name: str = "Base Connector"

    @abstractmethod
    def is_configured(self, credentials: Optional[dict[str, str]] = None) -> bool:
        """Returns True if credentials are available (env vars or passed dict)."""
        ...

    @abstractmethod
    def publish(
        self, manuscript_path: Path, cover_path: Path, metadata: dict,
        credentials: Optional[dict[str, str]] = None, dry_run: bool = True,
    ) -> PublishingConnectorResult:
        """Publishes the book. Returns a standardized result.

        Args:
            manuscript_path: Path to the EPUB or PDF manuscript file
            cover_path: Path to the cover image
            metadata: Book metadata (title, author, description, etc.)
            credentials: Auth credentials (email/password, API key, etc.)
            dry_run: If True, log what would happen without posting for real.
                     If False, actually post to the platform.
        """
        ...
