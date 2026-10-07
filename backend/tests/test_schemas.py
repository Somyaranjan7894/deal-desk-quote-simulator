import json
from decimal import Decimal
from pathlib import Path
import pytest
from pydantic import ValidationError

from app.schemas.catalog import Product, DiscountTier, Catalog
from app.schemas.quote import (
    QuoteStatus,
    QuoteLineItem,
    QuoteLineItemResponse,
    QuoteRequest,
    QuoteResponse,
)


# ---------------------------------------------------------------------------
# Quote Request Validation Tests (Required minimum tests)
# ---------------------------------------------------------------------------

def test_valid_quote_request_is_accepted():
    """1. Valid quote request is accepted."""
    req = QuoteRequest(
        customer_name="Acme Corporation",
        seats=15,
        line_items=[
            QuoteLineItem(sku="AGENT-CORE", quantity=10),
            QuoteLineItem(sku="AGENT-ANALYTICS", quantity=5),
        ],
        discount_pct=Decimal("12.5"),
        annual_commitment=True,
    )
    assert req.customer_name == "Acme Corporation"
    assert req.seats == 15
    assert len(req.line_items) == 2
    assert req.discount_pct == Decimal("12.5")
    assert req.annual_commitment is True


def test_blank_customer_name_is_rejected():
    """2. Blank customer name is rejected (empty and whitespace-only)."""
    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="",
            seats=10,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        )

    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="   ",
            seats=10,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        )


def test_zero_seats_are_rejected():
    """3. Zero seats are rejected."""
    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=0,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        )


def test_negative_seats_are_rejected():
    """4. Negative seats are rejected."""
    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=-5,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        )


def test_empty_line_items_are_rejected():
    """5. Empty line_items list is rejected."""
    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=10,
            line_items=[],
        )


def test_zero_quantity_is_rejected():
    """6. Zero quantity on a line item is rejected."""
    with pytest.raises(ValidationError):
        QuoteLineItem(sku="AGENT-CORE", quantity=0)

    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=10,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=0)],
        )


def test_negative_quantity_is_rejected():
    """7. Negative quantity on a line item is rejected."""
    with pytest.raises(ValidationError):
        QuoteLineItem(sku="AGENT-CORE", quantity=-3)

    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=10,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=-3)],
        )


def test_negative_discount_is_rejected():
    """8. Negative discount percentage is rejected."""
    with pytest.raises(ValidationError):
        QuoteRequest(
            customer_name="Acme Corp",
            seats=10,
            line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
            discount_pct=Decimal("-5.0"),
        )


def test_valid_annual_commitment_boolean_is_accepted():
    """9. Valid annual_commitment boolean values (True and False) are accepted."""
    req_true = QuoteRequest(
        customer_name="Acme Corp",
        seats=10,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        annual_commitment=True,
    )
    assert req_true.annual_commitment is True

    req_false = QuoteRequest(
        customer_name="Acme Corp",
        seats=10,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        annual_commitment=False,
    )
    assert req_false.annual_commitment is False


def test_quote_status_enum_rejects_unsupported_status():
    """10. Quote status enum rejects unsupported status values."""
    with pytest.raises(ValueError):
        QuoteStatus("unknown_status")

    with pytest.raises(ValueError):
        QuoteStatus("in_review")

    # Verify all supported statuses
    assert QuoteStatus("draft") == QuoteStatus.DRAFT
    assert QuoteStatus("submitted") == QuoteStatus.SUBMITTED
    assert QuoteStatus("approved") == QuoteStatus.APPROVED
    assert QuoteStatus("rejected") == QuoteStatus.REJECTED


# ---------------------------------------------------------------------------
# Additional Domain & Catalog Schema Tests
# ---------------------------------------------------------------------------

def test_blank_sku_is_rejected():
    """Blank or whitespace-only SKU is rejected."""
    with pytest.raises(ValidationError):
        QuoteLineItem(sku="", quantity=1)

    with pytest.raises(ValidationError):
        QuoteLineItem(sku="   ", quantity=1)


def test_decimal_discount_parsing():
    """Discount accepts string, int, and Decimal representations without precision loss."""
    req_from_str = QuoteRequest(
        customer_name="Acme Corp",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct="15.5",
    )
    assert req_from_str.discount_pct == Decimal("15.5")

    req_from_int = QuoteRequest(
        customer_name="Acme Corp",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=0,
    )
    assert req_from_int.discount_pct == Decimal("0")


def test_quote_response_structure():
    """QuoteResponse supports lifecycle status and optional calculation placeholders."""
    resp = QuoteResponse(
        id="quote-12345",
        status=QuoteStatus.DRAFT,
        customer_name="Beta LLC",
        seats=25,
        line_items=[
            QuoteLineItemResponse(
                sku="AGENT-CORE",
                quantity=10,
                name="Agent Core",
                unit_price=Decimal("120"),
                line_total=Decimal("1200"),
            )
        ],
        discount_pct=Decimal("10"),
        annual_commitment=False,
        tier="GROWTH",
        subtotal=Decimal("1200"),
        discount_amount=Decimal("120"),
        total=Decimal("1080"),
        approval_required=False,
        approval_reasons=[],
    )
    assert resp.id == "quote-12345"
    assert resp.status == QuoteStatus.DRAFT
    assert resp.tier == "GROWTH"
    assert resp.total == Decimal("1080")


def test_catalog_models_parse_source_data_file():
    """Verifies Catalog model can deserialize the authoritative data/catalog.json without errors."""
    catalog_path = Path(__file__).parent.parent.parent / "data" / "catalog.json"
    assert catalog_path.exists(), "Source catalog.json file must exist"

    with open(catalog_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    catalog = Catalog.model_validate(data)
    assert catalog.currency == "USD"
    assert len(catalog.discount_rules) == 3
    assert len(catalog.products) == 4

    # Verify Decimal conversion on products and tiers
    starter_tier = catalog.discount_rules[0]
    assert starter_tier.code == "STARTER"
    assert starter_tier.min_seats == 1
    assert starter_tier.max_seats == 9
    assert starter_tier.max_discount_pct == Decimal("10")

    core_product = next(p for p in catalog.products if p.sku == "AGENT-CORE")
    assert core_product.name == "Agent Core"
    assert core_product.unit_price == Decimal("120")
