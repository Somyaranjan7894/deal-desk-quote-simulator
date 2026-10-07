"""Domain-specific exceptions for business logic, persistence, and data access layers."""

from decimal import Decimal


class CatalogError(Exception):
    """Base exception for all catalog domain errors."""
    pass


class CatalogNotFoundError(CatalogError):
    """Raised when the catalog source file cannot be located."""
    pass


class CatalogParseError(CatalogError):
    """Raised when the catalog source file is malformed or invalid."""
    pass


class ProductNotFoundError(CatalogError):
    """Raised when a product SKU is not found in the authoritative catalog."""

    def __init__(self, sku: str) -> None:
        super().__init__(f"Product with SKU '{sku}' not found in catalog.")
        self.sku = sku


class DiscountTierNotFoundError(CatalogError):
    """Raised when no discount tier covers the requested seat count."""

    def __init__(self, seats: int) -> None:
        super().__init__(f"No discount tier found for seat count: {seats}.")
        self.seats = seats


class QuoteCalculationError(Exception):
    """Base exception for quote calculation domain errors."""
    pass


class DiscountExceedsTierMaximumError(QuoteCalculationError):
    """Raised when the requested discount percentage exceeds the tier's maximum allowable discount."""

    def __init__(
        self,
        requested_discount: Decimal,
        tier_code: str,
        max_discount: Decimal,
    ) -> None:
        super().__init__(
            f"Requested discount {requested_discount}% exceeds maximum allowable discount {max_discount}% for tier '{tier_code}'."
        )
        self.requested_discount = requested_discount
        self.tier_code = tier_code
        self.max_discount = max_discount


class QuoteNotFoundError(QuoteCalculationError):
    """Raised when a quote cannot be found by its unique identifier."""

    def __init__(self, quote_id: str) -> None:
        super().__init__(f"Quote with ID '{quote_id}' not found.")
        self.quote_id = quote_id


class InvalidQuoteStatusTransitionError(QuoteCalculationError):
    """Raised when an unauthorized quote lifecycle status transition is attempted."""

    def __init__(self, current_status: str, target_status: str) -> None:
        super().__init__(
            f"Cannot transition quote from '{current_status}' to '{target_status}'."
        )
        self.current_status = current_status
        self.target_status = target_status


class QuotePersistenceError(Exception):
    """Raised when an I/O or storage operation fails during quote persistence."""
    pass


class QuoteStorageCorruptedError(QuotePersistenceError):
    """Raised when the quote persistence file contains corrupted or malformed data."""
    pass
