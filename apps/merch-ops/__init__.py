"""
merch -- merch (print-on-demand) side of the pipeline.

Ingests MerchPulse exports, validates their economics independently, and
reconciles their channel list against the honest connector registry.

The hard rule inherited from the book side applies here unchanged: never
claim a platform capability that does not exist, and never let seeded demo
data reach a publish path.
"""

from .export_ingest import (
    MerchPulseExport,
    MerchExportError,
    CampaignChain,
    load_export,
)
from .economics import ProductEconomics, verify_product_economics
from .channels import MERCH_CHANNELS, merch_registry, reconcile_export_channels

__all__ = [
    "MerchPulseExport",
    "MerchExportError",
    "CampaignChain",
    "load_export",
    "ProductEconomics",
    "verify_product_economics",
    "MERCH_CHANNELS",
    "merch_registry",
    "reconcile_export_channels",
]
