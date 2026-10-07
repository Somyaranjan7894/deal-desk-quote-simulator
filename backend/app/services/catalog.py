from typing import Optional

from app.core.exceptions import DiscountTierNotFoundError, ProductNotFoundError
from app.repositories.catalog import CatalogRepository
from app.schemas.catalog import Catalog, DiscountTier, Product


class CatalogService:
    """
    Domain service for catalog operations.
    Authoritative source for products, unit prices, and seat-bracket discount tiers.
    """

    def __init__(self, repository: Optional[CatalogRepository] = None) -> None:
        self._repository = repository or CatalogRepository()

    def get_catalog(self) -> Catalog:
        """Returns the full typed catalog from the repository."""
        return self._repository.load_catalog()

    def get_product_by_sku(self, sku: str) -> Product:
        """
        Finds a product by SKU from the authoritative catalog.
        Trims surrounding whitespace before exact matching.
        Raises ProductNotFoundError if the SKU does not exist.
        """
        clean_sku = sku.strip()
        catalog = self.get_catalog()

        for product in catalog.products:
            if product.sku == clean_sku:
                return product

        raise ProductNotFoundError(clean_sku)

    def get_discount_tier_for_seats(self, seats: int) -> DiscountTier:
        """
        Resolves the applicable discount tier for a given seat count based on the catalog rules.
        A tier matches when min_seats <= seats <= max_seats.
        Raises DiscountTierNotFoundError if no tier covers the seat count.
        """
        if seats < 1:
            raise DiscountTierNotFoundError(seats)

        catalog = self.get_catalog()

        for tier in catalog.discount_rules:
            if tier.min_seats <= seats <= tier.max_seats:
                return tier

        raise DiscountTierNotFoundError(seats)
