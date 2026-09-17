"""
merch.connectors -- POD vendor connectors.

Only Printful is implemented. Printify and Gooten have real APIs and are the
next candidates; Redbubble, Spring and Amazon Merch have no usable submission
API and will never get a connector here -- they get an upload package instead.
"""

from .base import (
    MerchConnector,
    MerchPublishRequest,
    MerchVariant,
    ConnectorResult,
)
from .printful import PrintfulConnector
from .printify import PrintifyConnector, to_minor_units

__all__ = [
    "MerchConnector",
    "MerchPublishRequest",
    "MerchVariant",
    "ConnectorResult",
    "PrintfulConnector",
    "PrintifyConnector",
    "to_minor_units",
]
