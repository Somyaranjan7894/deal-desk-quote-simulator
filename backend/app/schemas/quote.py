from decimal import Decimal
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuoteStatus(str, Enum):
    """Supported quote lifecycle states."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"


class QuoteStatusUpdateRequest(BaseModel):
    """Request schema for updating quote lifecycle status."""
    status: QuoteStatus = Field(..., description="Target quote lifecycle status")

    model_config = ConfigDict(extra="forbid")


class QuoteLineItem(BaseModel):
    """Input line item representation."""
    sku: str = Field(..., min_length=1, description="Catalog product SKU")
    quantity: int = Field(..., gt=0, description="Product quantity, must be greater than zero")

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("sku cannot be blank or whitespace only")
        return trimmed

    model_config = ConfigDict(extra="forbid")


class QuoteLineItemResponse(QuoteLineItem):
    """Extended line item representation for calculated and persisted responses."""
    name: Optional[str] = Field(default=None, description="Product display name")
    product_name: Optional[str] = Field(default=None, description="Product display name alias")
    unit_price: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Catalog unit price")
    line_total: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Calculated line total before discount")


class QuoteBase(BaseModel):
    """Shared fields for quote requests and responses."""
    customer_name: str = Field(..., description="Customer or company name")
    seats: int = Field(..., ge=1, description="Number of user seats (minimum 1)")
    line_items: List[QuoteLineItem] = Field(..., min_length=1, description="Line items (minimum 1 required)")
    discount_pct: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), description="Requested discount percentage (>= 0)")
    annual_commitment: bool = Field(default=False, description="Whether an annual commitment is agreed")

    @field_validator("customer_name")
    @classmethod
    def validate_customer_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("customer_name cannot be blank or whitespace only")
        return trimmed

    model_config = ConfigDict(extra="forbid")


class QuoteRequest(QuoteBase):
    """Request schema for quote calculation and creation."""
    pass


# Convenient alias for API conventions
QuoteCreate = QuoteRequest


class QuoteCalculationResult(BaseModel):
    """Authoritative calculation result output structure."""
    customer_name: Optional[str] = Field(default=None, description="Customer or company name")
    seats: Optional[int] = Field(default=None, ge=1, description="Number of user seats")
    tier: str = Field(..., description="Applicable pricing tier code")
    discount_pct: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Requested discount percentage")
    annual_commitment: Optional[bool] = Field(default=None, description="Whether annual commitment was selected")
    subtotal: Decimal = Field(..., ge=Decimal("0"), description="Sum of line totals before discount")
    discount_amount: Decimal = Field(..., ge=Decimal("0"), description="Calculated discount amount")
    total: Decimal = Field(..., ge=Decimal("0"), description="Final quote total after discount")
    approval_required: bool = Field(..., description="Whether deal desk approval is triggered")
    approval_reasons: List[str] = Field(default_factory=list, description="Reasons triggering deal desk approval")
    line_items: List[QuoteLineItemResponse] = Field(default_factory=list, description="Calculated line items")

    model_config = ConfigDict(extra="forbid")


class QuoteResponse(QuoteBase):
    """
    Response schema for saved or calculated quotes.
    Includes base quote details, status, room for calculated output values, and timestamps.
    """
    id: Optional[str] = Field(default=None, description="Unique identifier for persisted quotes")
    status: QuoteStatus = Field(default=QuoteStatus.DRAFT, description="Current quote lifecycle status")
    line_items: List[QuoteLineItemResponse] = Field(..., min_length=1, description="Quote line items with optional calculated details")

    # Calculated fields populated by the domain calculation engine
    tier: Optional[str] = Field(default=None, description="Applicable pricing tier code")
    subtotal: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Subtotal before discount")
    discount_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Calculated discount amount")
    total: Optional[Decimal] = Field(default=None, ge=Decimal("0"), description="Final total after discount")
    approval_required: Optional[bool] = Field(default=None, description="Whether deal desk approval is required")
    approval_reasons: Optional[List[str]] = Field(default=None, description="Reasons requiring approval")

    # ISO-8601 UTC timestamps
    created_at: Optional[str] = Field(default=None, description="ISO-8601 UTC creation timestamp")
    updated_at: Optional[str] = Field(default=None, description="ISO-8601 UTC update timestamp")

    model_config = ConfigDict(extra="forbid")
