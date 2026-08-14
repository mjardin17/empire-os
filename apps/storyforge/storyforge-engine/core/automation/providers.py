"""
StoryForge Empire Automation Studio -- Provider Abstraction
-----------------------------------------------------------------
Publishing, marketing, analytics, and storage are each behind one
swappable interface -- the exact seam pattern already established by
`core/ai/provider.py` (AIProvider) and `core/image/providers.py`
(ImageProvider): subclass, implement the contract, register in the
module-level registry, nothing else in the studio changes.

The default implementations are honest about what's real:
  - `StoryForgePublishingProvider` really calls Phase 4's
    `PlatformExporter` -- it packages platform-shaped listings to disk,
    it does not silently pretend to submit them to a marketplace (same
    "manual review required" contract as `platform_export.NullConnector`).
  - `StoryForgeMarketingProvider` really calls Phase 4's
    `MarketingGenerator` via the swappable `AIProvider` layer.
  - `ManualAnalyticsProvider` is an honest no-network default: analytics
    numbers come from wherever you actually collect them (a KDP/Etsy/
    Shopify dashboard export, Search Console, etc.) and are recorded via
    `AnalyticsEngine.record_metric`; this provider simply confirms it
    has no live connection and tells you to record metrics manually or
    register a real one.
  - `LocalStorageProvider` reads/writes the local filesystem, mirroring
    every other module in this repo (no cloud dependency required to
    run out of the box).
"""

from __future__ import annotations

import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.publishing.models import BookMetadata, PlatformPackage
from core.publishing.platform_export import PlatformExportError, PlatformExporter


class ProviderError(RuntimeError):
    pass


# =======================================================================
# Publishing providers
# =======================================================================

class PublishingProvider(ABC):
    name: str = "base"

    @abstractmethod
    def publish(
        self, metadata: BookMetadata, platform: str, source_assets: Optional[Dict[str, str]] = None,
    ) -> PlatformPackage:
        ...


class StoryForgePublishingProvider(PublishingProvider):
    """Wraps Phase 4's PlatformExporter. This is the default -- and,
    until a credentialed marketplace API is wired up via
    `core.publishing.platform_export.register_connector`, the only
    honest option: it prepares a real listing package on disk, it does
    not fabricate a live submission."""

    name = "storyforge"

    def __init__(self, output_root: str = "publishing_exports"):
        self._exporter = PlatformExporter(output_root=output_root)

    def publish(
        self, metadata: BookMetadata, platform: str, source_assets: Optional[Dict[str, str]] = None,
    ) -> PlatformPackage:
        try:
            return self._exporter.export(metadata, platform, source_assets)
        except PlatformExportError as e:
            raise ProviderError(str(e)) from e


_PUBLISHING_PROVIDERS: Dict[str, PublishingProvider] = {}


def get_publishing_provider(name: str = "storyforge") -> PublishingProvider:
    if name not in _PUBLISHING_PROVIDERS:
        if name == "storyforge":
            _PUBLISHING_PROVIDERS[name] = StoryForgePublishingProvider()
        else:
            raise ProviderError(
                f"Unknown publishing provider '{name}'. Register one with "
                f"register_publishing_provider() first."
            )
    return _PUBLISHING_PROVIDERS[name]


def register_publishing_provider(name: str, provider: PublishingProvider) -> None:
    _PUBLISHING_PROVIDERS[name] = provider


# =======================================================================
# Marketing providers
# =======================================================================

class MarketingProvider(ABC):
    name: str = "base"

    @abstractmethod
    def generate(
        self, project_id: str, book_summary: str, marketing_copy: str, channels: List[str],
    ) -> List[Dict[str, Any]]:
        """Returns a list of dicts shaped like `core.publishing.models.MarketingAsset`
        (channel, copy_text, status) -- callers persist them themselves so this
        provider stays free of any storage opinion."""
        ...


class StoryForgeMarketingProvider(MarketingProvider):
    """Wraps Phase 4's MarketingGenerator (same AIProvider seam as the
    Creative Council). Requires an AI provider/model exactly like the
    rest of Phase 4 does -- no separate credential story to maintain."""

    name = "storyforge"

    def __init__(self, provider_name: str = "openrouter", model: str = "anthropic/claude-sonnet-4"):
        self.provider_name = provider_name
        self.model = model

    def generate(
        self, project_id: str, book_summary: str, marketing_copy: str, channels: List[str],
    ) -> List[Dict[str, Any]]:
        from dataclasses import asdict as _asdict

        from core.publishing.marketing import MarketingGenerator, MarketingGeneratorError
        from core.ai.provider import ProviderError as AIProviderError

        try:
            generator = MarketingGenerator(provider_name=self.provider_name, model=self.model)
            assets = generator.generate_channel_set(
                project_id=project_id, book_summary=book_summary,
                marketing_copy=marketing_copy, channels=channels,
            )
        except MarketingGeneratorError as e:
            raise ProviderError(str(e)) from e
        except AIProviderError as e:
            raise ProviderError(str(e)) from e
        return [_asdict(a) for a in assets]


_MARKETING_PROVIDERS: Dict[str, MarketingProvider] = {}


def get_marketing_provider(name: str = "storyforge") -> MarketingProvider:
    if name not in _MARKETING_PROVIDERS:
        if name == "storyforge":
            _MARKETING_PROVIDERS[name] = StoryForgeMarketingProvider()
        else:
            raise ProviderError(
                f"Unknown marketing provider '{name}'. Register one with "
                f"register_marketing_provider() first."
            )
    return _MARKETING_PROVIDERS[name]


def register_marketing_provider(name: str, provider: MarketingProvider) -> None:
    _MARKETING_PROVIDERS[name] = provider


# =======================================================================
# Analytics providers
# =======================================================================

class AnalyticsProvider(ABC):
    name: str = "base"

    @abstractmethod
    def fetch_metrics(self, project_id: str, platform: str = "") -> List[Dict[str, Any]]:
        """Pull fresh metrics from wherever this provider talks to. Returns
        a list of dicts shaped like `core.automation.models.AnalyticsMetric`
        fields (metric_type, platform, value, keyword, meta)."""
        ...


class ManualAnalyticsProvider(AnalyticsProvider):
    """The honest default: StoryForge does not hold API credentials for
    Amazon/Etsy/Shopify/YouTube/TikTok analytics, so this provider pulls
    nothing on its own. Record real numbers via
    `AnalyticsEngine.record_metric(...)` (e.g. from a CSV export, a
    scheduled scraper you control, or a real connector registered with
    `register_analytics_provider`)."""

    name = "manual"

    def fetch_metrics(self, project_id: str, platform: str = "") -> List[Dict[str, Any]]:
        return []


_ANALYTICS_PROVIDERS: Dict[str, AnalyticsProvider] = {"manual": ManualAnalyticsProvider()}


def get_analytics_provider(name: str = "manual") -> AnalyticsProvider:
    if name not in _ANALYTICS_PROVIDERS:
        raise ProviderError(
            f"Unknown analytics provider '{name}'. Register one with "
            f"register_analytics_provider() first."
        )
    return _ANALYTICS_PROVIDERS[name]


def register_analytics_provider(name: str, provider: AnalyticsProvider) -> None:
    _ANALYTICS_PROVIDERS[name] = provider


# =======================================================================
# Storage providers
# =======================================================================

class StorageProvider(ABC):
    name: str = "base"

    @abstractmethod
    def save(self, relative_path: str, source_path: str) -> str:
        """Copy/move the file at source_path into this storage backend
        under relative_path, returning the final addressable location
        (a local path, or a URL for a real cloud backend)."""
        ...

    @abstractmethod
    def exists(self, relative_path: str) -> bool:
        ...


class LocalStorageProvider(StorageProvider):
    """Default: the local filesystem, same as every other module in
    this repo. Swap for an S3/GCS-backed StorageProvider later without
    touching any caller -- they only ever see `save()` / `exists()`."""

    name = "local"

    def __init__(self, root: str = "automation_storage"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, relative_path: str, source_path: str) -> str:
        dest = self.root / relative_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        src = Path(source_path)
        if src.exists() and src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        return str(dest)

    def exists(self, relative_path: str) -> bool:
        return (self.root / relative_path).exists()


_STORAGE_PROVIDERS: Dict[str, StorageProvider] = {}


def get_storage_provider(name: str = "local") -> StorageProvider:
    if name not in _STORAGE_PROVIDERS:
        if name == "local":
            _STORAGE_PROVIDERS[name] = LocalStorageProvider()
        else:
            raise ProviderError(
                f"Unknown storage provider '{name}'. Register one with "
                f"register_storage_provider() first."
            )
    return _STORAGE_PROVIDERS[name]


def register_storage_provider(name: str, provider: StorageProvider) -> None:
    _STORAGE_PROVIDERS[name] = provider


def list_providers() -> Dict[str, List[str]]:
    """What Empire Assistant (or any caller) can introspect right now."""
    return {
        "publishing": sorted(set(_PUBLISHING_PROVIDERS.keys()) | {"storyforge"}),
        "marketing": sorted(set(_MARKETING_PROVIDERS.keys()) | {"storyforge"}),
        "analytics": sorted(_ANALYTICS_PROVIDERS.keys()),
        "storage": sorted(set(_STORAGE_PROVIDERS.keys()) | {"local"}),
    }
