from decimal import Decimal
from typing import List
from pydantic import BaseModel, ConfigDict, Field


class Product(BaseModel):
    """Catalog product representation."""
    sku: str = Field(..., min_length=1, description="Unique product SKU")
    name: str = Field(..., min_length=1, description="Product display name")
    unit_price: Decimal = Field(..., ge=Decimal("0"), description="Unit price per seat or package")

    model_config = ConfigDict(extra="forbid")


class DiscountTier(BaseModel):
    """Seat-bracket discount tier representation."""
    code: str = Field(..., min_length=1, description="Tier identifier code (e.g. STARTER, GROWTH, ENTERPRISE)")
    min_seats: int = Field(..., ge=1, description="Minimum seats to qualify for this tier")
    max_seats: int = Field(..., ge=1, description="Maximum seats for this tier range")
    max_discount_pct: Decimal = Field(..., ge=Decimal("0"), le=Decimal("100"), description="Maximum allowable discount percentage")

    model_config = ConfigDict(extra="forbid")


class Catalog(BaseModel):
    """Full catalog schema representing source catalog data."""
    currency: str = Field(default="USD", min_length=3, max_length=3, description="ISO Currency code")
    discount_rules: List[DiscountTier] = Field(default_factory=list, description="Seat-based discount tiers")
    products: List[Product] = Field(default_factory=list, description="Available catalog products")

    model_config = ConfigDict(extra="forbid")
