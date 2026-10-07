from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from app.core.exceptions import DiscountExceedsTierMaximumError
from app.schemas.quote import (
    QuoteCalculationResult,
    QuoteLineItemResponse,
    QuoteRequest,
)
from app.services.catalog import CatalogService

# Deterministic approval reason constants
REASON_DISCOUNT_EXCEEDS_15 = "Discount exceeds 15%"
REASON_TOTAL_EXCEEDS_25K = "Total exceeds $25,000"
REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10 = "Annual commitment with discount above 10%"

# Approval threshold constants
APPROVAL_DISCOUNT_THRESHOLD = Decimal("15.00")
APPROVAL_TOTAL_THRESHOLD = Decimal("25000.00")
APPROVAL_ANNUAL_DISCOUNT_THRESHOLD = Decimal("10.00")

# Monetary rounding constants
CENT_PRECISION = Decimal("0.01")
PERCENT_DIVISOR = Decimal("100")


def quantize_money(amount: Decimal) -> Decimal:
    """Rounds monetary amount to two decimal places using ROUND_HALF_UP."""
    return amount.quantize(CENT_PRECISION, rounding=ROUND_HALF_UP)


class QuoteCalculationService:
    """
    Authoritative domain service for quote calculations.
    Validates seat tiers and products against the catalog, enforces tier discount limits,
    merges duplicate SKUs, calculates monetary totals, and evaluates deal desk approval policies.
    """

    def __init__(self, catalog_service: Optional[CatalogService] = None) -> None:
        self._catalog_service = catalog_service or CatalogService()

    def calculate(self, request: QuoteRequest) -> QuoteCalculationResult:
        """
        Calculates quote totals and approval requirements from a validated quote request.
        """
        # 1. Resolve seat discount tier from catalog
        tier = self._catalog_service.get_discount_tier_for_seats(request.seats)

        # 2. Validate requested discount against tier maximum
        if request.discount_pct > tier.max_discount_pct:
            raise DiscountExceedsTierMaximumError(
                requested_discount=request.discount_pct,
                tier_code=tier.code,
                max_discount=tier.max_discount_pct,
            )

        # 3. Normalize duplicate line items (preserving first-seen SKU order)
        merged_quantities: dict[str, int] = {}
        for item in request.line_items:
            clean_sku = item.sku.strip()
            merged_quantities[clean_sku] = (
                merged_quantities.get(clean_sku, 0) + item.quantity
            )

        # 4. Look up products from catalog and calculate line totals
        calculated_lines: List[QuoteLineItemResponse] = []
        for sku, quantity in merged_quantities.items():
            product = self._catalog_service.get_product_by_sku(sku)
            unit_price = quantize_money(product.unit_price)
            line_total = quantize_money(Decimal(quantity) * product.unit_price)

            calculated_lines.append(
                QuoteLineItemResponse(
                    sku=product.sku,
                    name=product.name,
                    product_name=product.name,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )

        # 5. Calculate Subtotal, Discount Amount, and Final Total
        subtotal = quantize_money(
            sum((item.line_total for item in calculated_lines), Decimal("0.00"))
        )
        discount_amount = quantize_money(
            (subtotal * request.discount_pct) / PERCENT_DIVISOR
        )
        total = quantize_money(subtotal - discount_amount)

        # 6. Evaluate approval rules in deterministic order
        approval_reasons: List[str] = []

        # Rule 1: discount > 15%
        if request.discount_pct > APPROVAL_DISCOUNT_THRESHOLD:
            approval_reasons.append(REASON_DISCOUNT_EXCEEDS_15)

        # Rule 2: total > $25,000.00
        if total > APPROVAL_TOTAL_THRESHOLD:
            approval_reasons.append(REASON_TOTAL_EXCEEDS_25K)

        # Rule 3: annual commitment == True AND discount > 10%
        if request.annual_commitment and (
            request.discount_pct > APPROVAL_ANNUAL_DISCOUNT_THRESHOLD
        ):
            approval_reasons.append(REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10)

        approval_required = len(approval_reasons) > 0

        return QuoteCalculationResult(
            customer_name=request.customer_name,
            seats=request.seats,
            tier=tier.code,
            discount_pct=request.discount_pct,
            annual_commitment=request.annual_commitment,
            subtotal=subtotal,
            discount_amount=discount_amount,
            total=total,
            approval_required=approval_required,
            approval_reasons=approval_reasons,
            line_items=calculated_lines,
        )
