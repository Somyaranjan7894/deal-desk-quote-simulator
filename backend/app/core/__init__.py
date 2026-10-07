"""Core configuration and settings."""

from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    CatalogNotFoundError,
    CatalogParseError,
    ProductNotFoundError,
    DiscountTierNotFoundError,
    QuoteCalculationError,
    DiscountExceedsTierMaximumError,
    QuoteNotFoundError,
    InvalidQuoteStatusTransitionError,
    QuotePersistenceError,
    QuoteStorageCorruptedError,
)

__all__ = [
    "settings",
    "CatalogError",
    "CatalogNotFoundError",
    "CatalogParseError",
    "ProductNotFoundError",
    "DiscountTierNotFoundError",
    "QuoteCalculationError",
    "DiscountExceedsTierMaximumError",
    "QuoteNotFoundError",
    "InvalidQuoteStatusTransitionError",
    "QuotePersistenceError",
    "QuoteStorageCorruptedError",
]
