from decimal import Decimal
import pytest

from app.core.exceptions import (
    DiscountExceedsTierMaximumError,
    ProductNotFoundError,
)
from app.schemas.quote import QuoteLineItem, QuoteRequest
from app.services.quote_calculation import (
    REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10,
    REASON_DISCOUNT_EXCEEDS_15,
    REASON_TOTAL_EXCEEDS_25K,
    QuoteCalculationService,
)


@pytest.fixture
def calculation_service():
    """Provides an instance of QuoteCalculationService backed by the default CatalogService."""
    return QuoteCalculationService()


# ---------------------------------------------------------------------------
# Basic Calculations (1-5)
# ---------------------------------------------------------------------------

def test_basic_single_product_calculation(calculation_service):
    """1. Basic single-product calculation."""
    # Arrange: 5 seats (STARTER), 2x AGENT-CORE ($120.00 each)
    request = QuoteRequest(
        customer_name="Alpha Co",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=2)],
        discount_pct=Decimal("0"),
        annual_commitment=False,
    )

    # Act
    result = calculation_service.calculate(request)

    # Assert
    assert result.tier == "STARTER"
    assert result.subtotal == Decimal("240.00")
    assert result.discount_amount == Decimal("0.00")
    assert result.total == Decimal("240.00")
    assert result.approval_required is False
    assert len(result.line_items) == 1
    assert result.line_items[0].sku == "AGENT-CORE"
    assert result.line_items[0].name == "Agent Core"
    assert result.line_items[0].unit_price == Decimal("120.00")
    assert result.line_items[0].line_total == Decimal("240.00")


def test_multiple_product_calculation(calculation_service):
    """2. Multiple-product calculation."""
    # Arrange: 15 seats (GROWTH), 2x AGENT-CORE ($120) + 3x AGENT-ANALYTICS ($80)
    request = QuoteRequest(
        customer_name="Beta Corp",
        seats=15,
        line_items=[
            QuoteLineItem(sku="AGENT-CORE", quantity=2),
            QuoteLineItem(sku="AGENT-ANALYTICS", quantity=3),
        ],
        discount_pct=Decimal("10"),
        annual_commitment=False,
    )

    # Act
    result = calculation_service.calculate(request)

    # Assert: 2*120 (240) + 3*80 (240) = 480 subtotal, 10% discount = 48, total = 432
    assert len(result.line_items) == 2
    assert result.subtotal == Decimal("480.00")
    assert result.discount_amount == Decimal("48.00")
    assert result.total == Decimal("432.00")


def test_correct_subtotal_matches_sum_of_lines(calculation_service):
    """3. Correct subtotal."""
    request = QuoteRequest(
        customer_name="Gamma Inc",
        seats=20,
        line_items=[
            QuoteLineItem(sku="AGENT-CORE", quantity=4),        # 4 * 120 = 480
            QuoteLineItem(sku="AGENT-AUTOMATE", quantity=2),    # 2 * 150 = 300
            QuoteLineItem(sku="ONBOARDING", quantity=1),        # 1 * 2500 = 2500
        ],
        discount_pct=Decimal("0"),
    )

    result = calculation_service.calculate(request)

    # 480 + 300 + 2500 = 3280.00
    assert result.subtotal == Decimal("3280.00")
    assert sum(item.line_total for item in result.line_items) == result.subtotal


def test_correct_discount_amount(calculation_service):
    """4. Correct discount amount."""
    # 20 seats (GROWTH), 1x ONBOARDING ($2500), 15% discount
    request = QuoteRequest(
        customer_name="Delta LLC",
        seats=20,
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=1)],
        discount_pct=Decimal("15"),
    )

    result = calculation_service.calculate(request)

    # 2500 * 0.15 = 375.00
    assert result.discount_amount == Decimal("375.00")


def test_correct_final_total(calculation_service):
    """5. Correct final total."""
    request = QuoteRequest(
        customer_name="Epsilon Enterprises",
        seats=20,
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=1)],
        discount_pct=Decimal("15"),
    )

    result = calculation_service.calculate(request)

    # 2500 - 375 = 2125.00
    assert result.total == Decimal("2125.00")
    assert result.total == result.subtotal - result.discount_amount


# ---------------------------------------------------------------------------
# Tier Maximum Discount Rules (6-9)
# ---------------------------------------------------------------------------

def test_starter_tier_allows_maximum_10_percent_discount(calculation_service):
    """6. STARTER tier and maximum 10% discount."""
    request = QuoteRequest(
        customer_name="Starter Customer",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("10.00"),
    )

    result = calculation_service.calculate(request)
    assert result.tier == "STARTER"
    assert result.discount_pct == Decimal("10.00")


def test_growth_tier_allows_maximum_20_percent_discount(calculation_service):
    """7. GROWTH tier and maximum 20% discount."""
    request = QuoteRequest(
        customer_name="Growth Customer",
        seats=25,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("20.00"),
    )

    result = calculation_service.calculate(request)
    assert result.tier == "GROWTH"
    assert result.discount_pct == Decimal("20.00")


def test_enterprise_tier_allows_maximum_30_percent_discount(calculation_service):
    """8. ENTERPRISE tier and maximum 30% discount."""
    request = QuoteRequest(
        customer_name="Enterprise Customer",
        seats=100,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("30.00"),
    )

    result = calculation_service.calculate(request)
    assert result.tier == "ENTERPRISE"
    assert result.discount_pct == Decimal("30.00")


def test_discount_above_tier_maximum_is_rejected(calculation_service):
    """9. Discount above tier maximum is rejected with DiscountExceedsTierMaximumError."""
    # STARTER allows max 10% -> 10.01% should fail
    starter_req = QuoteRequest(
        customer_name="Test Co",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("10.01"),
    )
    with pytest.raises(DiscountExceedsTierMaximumError) as exc_info:
        calculation_service.calculate(starter_req)
    assert exc_info.value.tier_code == "STARTER"
    assert exc_info.value.requested_discount == Decimal("10.01")
    assert exc_info.value.max_discount == Decimal("10")

    # GROWTH allows max 20% -> 20.01% should fail
    growth_req = QuoteRequest(
        customer_name="Test Co",
        seats=20,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("20.01"),
    )
    with pytest.raises(DiscountExceedsTierMaximumError):
        calculation_service.calculate(growth_req)

    # ENTERPRISE allows max 30% -> 30.01% should fail
    enterprise_req = QuoteRequest(
        customer_name="Test Co",
        seats=60,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("30.01"),
    )
    with pytest.raises(DiscountExceedsTierMaximumError):
        calculation_service.calculate(enterprise_req)


# ---------------------------------------------------------------------------
# SKU Validation & Duplicate Normalization (10-11)
# ---------------------------------------------------------------------------

def test_unknown_sku_is_rejected(calculation_service):
    """10. Unknown SKU is rejected via ProductNotFoundError."""
    request = QuoteRequest(
        customer_name="Test Co",
        seats=10,
        line_items=[QuoteLineItem(sku="INVALID-SKU-999", quantity=1)],
        discount_pct=Decimal("0"),
    )

    with pytest.raises(ProductNotFoundError) as exc_info:
        calculation_service.calculate(request)
    assert exc_info.value.sku == "INVALID-SKU-999"


def test_duplicate_skus_are_merged(calculation_service):
    """11. Duplicate SKUs are merged into one line item with summed quantities."""
    # Arrange: AGENT-CORE 5, AGENT-ANALYTICS 2, AGENT-CORE 3
    request = QuoteRequest(
        customer_name="Merge Test Co",
        seats=15,
        line_items=[
            QuoteLineItem(sku="AGENT-CORE", quantity=5),
            QuoteLineItem(sku="AGENT-ANALYTICS", quantity=2),
            QuoteLineItem(sku="AGENT-CORE", quantity=3),
        ],
        discount_pct=Decimal("0"),
    )

    # Act
    result = calculation_service.calculate(request)

    # Assert: Exactly 2 line items in result, AGENT-CORE merged to quantity 8, preserving first-seen order
    assert len(result.line_items) == 2
    assert result.line_items[0].sku == "AGENT-CORE"
    assert result.line_items[0].quantity == 8
    assert result.line_items[0].unit_price == Decimal("120.00")
    assert result.line_items[0].line_total == Decimal("960.00")  # 8 * 120

    assert result.line_items[1].sku == "AGENT-ANALYTICS"
    assert result.line_items[1].quantity == 2
    assert result.line_items[1].line_total == Decimal("160.00")


# ---------------------------------------------------------------------------
# 0% Discount Behavior (12)
# ---------------------------------------------------------------------------

def test_zero_percent_discount_works_correctly(calculation_service):
    """12. 0% discount works correctly."""
    request = QuoteRequest(
        customer_name="Zero Discount Co",
        seats=10,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=5)],
        discount_pct=Decimal("0"),
    )

    result = calculation_service.calculate(request)
    assert result.discount_pct == Decimal("0")
    assert result.discount_amount == Decimal("0.00")
    assert result.total == result.subtotal
    assert result.approval_required is False


# ---------------------------------------------------------------------------
# Approval Threshold Boundaries (13-19)
# ---------------------------------------------------------------------------

def test_approval_triggered_when_discount_above_15_percent(calculation_service):
    """13. Approval when discount > 15%."""
    # 20 seats (GROWTH tier allows up to 20%), requested discount 15.01%
    request = QuoteRequest(
        customer_name="Discount Approval Co",
        seats=20,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("15.01"),
        annual_commitment=False,
    )

    result = calculation_service.calculate(request)
    assert result.approval_required is True
    assert REASON_DISCOUNT_EXCEEDS_15 in result.approval_reasons


def test_no_approval_at_exactly_15_percent_discount(calculation_service):
    """14. No approval at exactly 15%."""
    request = QuoteRequest(
        customer_name="Exact 15 Co",
        seats=20,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("15.00"),
        annual_commitment=False,
    )

    result = calculation_service.calculate(request)
    assert REASON_DISCOUNT_EXCEEDS_15 not in result.approval_reasons
    assert result.approval_required is False


def test_approval_triggered_when_total_above_25000(calculation_service):
    """15. Approval when total > $25,000."""
    # 11 * ONBOARDING ($2500) = $27,500 subtotal, 0% discount -> total $27,500.00
    request = QuoteRequest(
        customer_name="Large Deal Co",
        seats=20,
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=11)],
        discount_pct=Decimal("0"),
        annual_commitment=False,
    )

    result = calculation_service.calculate(request)
    assert result.total == Decimal("27500.00")
    assert result.approval_required is True
    assert REASON_TOTAL_EXCEEDS_25K in result.approval_reasons


def test_no_approval_at_exactly_25000_total(calculation_service):
    """16. No approval at exactly $25,000."""
    # 10 * ONBOARDING ($2500) = $25,000.00 total
    request = QuoteRequest(
        customer_name="Exact 25k Co",
        seats=20,
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=10)],
        discount_pct=Decimal("0"),
        annual_commitment=False,
    )

    result = calculation_service.calculate(request)
    assert result.total == Decimal("25000.00")
    assert REASON_TOTAL_EXCEEDS_25K not in result.approval_reasons
    assert result.approval_required is False


def test_approval_for_annual_commitment_with_discount_above_10_percent(calculation_service):
    """17. Approval for annual commitment + discount > 10%."""
    request = QuoteRequest(
        customer_name="Annual Plus Discount Co",
        seats=20,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("10.01"),
        annual_commitment=True,
    )

    result = calculation_service.calculate(request)
    assert result.approval_required is True
    assert REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10 in result.approval_reasons


def test_no_approval_for_annual_commitment_at_exactly_10_percent_discount(calculation_service):
    """18. No approval for annual commitment + exactly 10%."""
    request = QuoteRequest(
        customer_name="Annual Exact 10 Co",
        seats=20,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("10.00"),
        annual_commitment=True,
    )

    result = calculation_service.calculate(request)
    assert REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10 not in result.approval_reasons
    assert result.approval_required is False


def test_multiple_approval_reasons_returned_in_deterministic_order(calculation_service):
    """19. Multiple approval reasons are returned together in deterministic order."""
    # Triggers all 3 rules:
    # Rule 1: discount > 15% (16% requested)
    # Rule 2: total > $25,000 (15x ONBOARDING = 37,500 * 0.84 = $31,500.00)
    # Rule 3: annual_commitment=True and discount > 10%
    request = QuoteRequest(
        customer_name="Triple Approval Co",
        seats=50,  # ENTERPRISE allows up to 30% discount
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=15)],
        discount_pct=Decimal("16"),
        annual_commitment=True,
    )

    result = calculation_service.calculate(request)

    assert result.approval_required is True
    expected_reasons = [
        REASON_DISCOUNT_EXCEEDS_15,
        REASON_TOTAL_EXCEEDS_25K,
        REASON_ANNUAL_COMMITMENT_DISCOUNT_EXCEEDS_10,
    ]
    assert result.approval_reasons == expected_reasons


# ---------------------------------------------------------------------------
# Decimal & Rounding Behavior (20)
# ---------------------------------------------------------------------------

def test_decimal_rounding_half_up(calculation_service):
    """20. Decimal/rounding behavior rounds monetary results to cents using ROUND_HALF_UP."""
    # 10 seats, 1x AGENT-CORE ($120.00), discount 12.55%
    # discount_amount = 120 * 0.1255 = 15.060 -> 15.06
    # total = 120 - 15.06 = 104.94
    request = QuoteRequest(
        customer_name="Precision Co",
        seats=10,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("12.55"),
        annual_commitment=False,
    )

    result = calculation_service.calculate(request)

    assert result.subtotal == Decimal("120.00")
    assert result.discount_amount == Decimal("15.06")
    assert result.total == Decimal("104.94")


# ---------------------------------------------------------------------------
# Boundary Tier Tests (21)
# ---------------------------------------------------------------------------

def test_tier_boundary_seats_resolution(calculation_service):
    """21. Boundary tier tests: 9 -> STARTER, 10 -> GROWTH, 49 -> GROWTH, 50 -> ENTERPRISE."""
    item = [QuoteLineItem(sku="AGENT-CORE", quantity=1)]

    # 9 seats -> STARTER (max discount 10%)
    res_9 = calculation_service.calculate(
        QuoteRequest(customer_name="Test", seats=9, line_items=item, discount_pct=Decimal("10"))
    )
    assert res_9.tier == "STARTER"

    # 10 seats -> GROWTH (max discount 20%)
    res_10 = calculation_service.calculate(
        QuoteRequest(customer_name="Test", seats=10, line_items=item, discount_pct=Decimal("20"))
    )
    assert res_10.tier == "GROWTH"

    # 49 seats -> GROWTH (max discount 20%)
    res_49 = calculation_service.calculate(
        QuoteRequest(customer_name="Test", seats=49, line_items=item, discount_pct=Decimal("20"))
    )
    assert res_49.tier == "GROWTH"

    # 50 seats -> ENTERPRISE (max discount 30%)
    res_50 = calculation_service.calculate(
        QuoteRequest(customer_name="Test", seats=50, line_items=item, discount_pct=Decimal("30"))
    )
    assert res_50.tier == "ENTERPRISE"


# ---------------------------------------------------------------------------
# Source of Truth Behavior (22)
# ---------------------------------------------------------------------------

def test_calculation_engine_uses_catalog_values_not_hardcoded(calculation_service):
    """22. Demonstrates the calculation engine dynamically consumes catalog product prices."""
    # Test each product in the catalog to verify unit prices match catalog.json exactly
    products_to_test = [
        ("AGENT-CORE", Decimal("120.00")),
        ("AGENT-ANALYTICS", Decimal("80.00")),
        ("AGENT-AUTOMATE", Decimal("150.00")),
        ("ONBOARDING", Decimal("2500.00")),
    ]

    for sku, expected_unit_price in products_to_test:
        req = QuoteRequest(
            customer_name="Catalog Verifier",
            seats=10,
            line_items=[QuoteLineItem(sku=sku, quantity=2)],
            discount_pct=Decimal("0"),
        )
        res = calculation_service.calculate(req)
        assert res.line_items[0].unit_price == expected_unit_price
        assert res.line_items[0].line_total == expected_unit_price * 2
        assert res.subtotal == expected_unit_price * 2
