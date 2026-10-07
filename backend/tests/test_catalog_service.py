from decimal import Decimal
import json
from pathlib import Path
import pytest

from app.core.exceptions import (
    CatalogNotFoundError,
    CatalogParseError,
    DiscountTierNotFoundError,
    ProductNotFoundError,
)
from app.repositories.catalog import CatalogRepository
from app.services.catalog import CatalogService


# ---------------------------------------------------------------------------
# Catalog Loading Tests (1-3)
# ---------------------------------------------------------------------------

def test_catalog_loads_successfully():
    """1. Catalog loads successfully via repository and service."""
    service = CatalogService()
    catalog = service.get_catalog()

    assert catalog is not None
    assert catalog.currency == "USD"


def test_loaded_catalog_contains_expected_products():
    """2. Loaded catalog contains the expected products."""
    service = CatalogService()
    catalog = service.get_catalog()

    product_skus = [p.sku for p in catalog.products]
    assert "AGENT-CORE" in product_skus
    assert "AGENT-ANALYTICS" in product_skus
    assert "AGENT-AUTOMATE" in product_skus
    assert "ONBOARDING" in product_skus
    assert len(catalog.products) == 4


def test_loaded_catalog_contains_expected_discount_tiers():
    """3. Loaded catalog contains the expected discount tiers."""
    service = CatalogService()
    catalog = service.get_catalog()

    tier_codes = [t.code for t in catalog.discount_rules]
    assert tier_codes == ["STARTER", "GROWTH", "ENTERPRISE"]
    assert len(catalog.discount_rules) == 3


# ---------------------------------------------------------------------------
# Product Lookup Tests (4-5)
# ---------------------------------------------------------------------------

def test_existing_sku_returns_correct_product():
    """4. Existing SKU returns the correct product with exact attributes."""
    service = CatalogService()
    product = service.get_product_by_sku("AGENT-CORE")

    assert product.sku == "AGENT-CORE"
    assert product.name == "Agent Core"
    assert product.unit_price == Decimal("120")


def test_unknown_sku_raises_product_not_found_error():
    """5. Unknown SKU raises ProductNotFoundError with appropriate details."""
    service = CatalogService()

    with pytest.raises(ProductNotFoundError) as exc_info:
        service.get_product_by_sku("UNKNOWN-SKU-999")

    assert exc_info.value.sku == "UNKNOWN-SKU-999"
    assert "UNKNOWN-SKU-999" in str(exc_info.value)


def test_sku_lookup_trims_whitespace():
    """Whitespace-padded SKU is cleanly resolved to the matching product."""
    service = CatalogService()
    product = service.get_product_by_sku("  AGENT-AUTOMATE  ")

    assert product.sku == "AGENT-AUTOMATE"
    assert product.name == "Agent Automate"
    assert product.unit_price == Decimal("150")


# ---------------------------------------------------------------------------
# Seat Tier Lookup & Boundary Tests (6-10)
# ---------------------------------------------------------------------------

def test_seat_tier_boundary_1_seat_is_starter():
    """6. 1 seat resolves to STARTER tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(1)

    assert tier.code == "STARTER"
    assert tier.min_seats == 1
    assert tier.max_seats == 9
    assert tier.max_discount_pct == Decimal("10")


def test_seat_tier_boundary_9_seats_is_starter():
    """7. 9 seats (upper boundary of STARTER) resolves to STARTER tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(9)

    assert tier.code == "STARTER"
    assert tier.max_discount_pct == Decimal("10")


def test_seat_tier_boundary_10_seats_is_growth():
    """8. 10 seats (lower boundary of GROWTH) resolves to GROWTH tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(10)

    assert tier.code == "GROWTH"
    assert tier.min_seats == 10
    assert tier.max_seats == 49
    assert tier.max_discount_pct == Decimal("20")


def test_seat_tier_boundary_49_seats_is_growth():
    """9. 49 seats (upper boundary of GROWTH) resolves to GROWTH tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(49)

    assert tier.code == "GROWTH"
    assert tier.max_discount_pct == Decimal("20")


def test_seat_tier_boundary_50_seats_is_enterprise():
    """10. 50 seats (lower boundary of ENTERPRISE) resolves to ENTERPRISE tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(50)

    assert tier.code == "ENTERPRISE"
    assert tier.min_seats == 50
    assert tier.max_discount_pct == Decimal("30")


def test_large_seat_count_is_enterprise():
    """High seat counts within enterprise range resolve to ENTERPRISE tier."""
    service = CatalogService()
    tier = service.get_discount_tier_for_seats(500)

    assert tier.code == "ENTERPRISE"
    assert tier.max_discount_pct == Decimal("30")


def test_invalid_seat_counts_raise_discount_tier_not_found_error():
    """Zero, negative, or out-of-range seat counts raise DiscountTierNotFoundError."""
    service = CatalogService()

    with pytest.raises(DiscountTierNotFoundError) as exc_0:
        service.get_discount_tier_for_seats(0)
    assert exc_0.value.seats == 0

    with pytest.raises(DiscountTierNotFoundError) as exc_neg:
        service.get_discount_tier_for_seats(-10)
    assert exc_neg.value.seats == -10

    with pytest.raises(DiscountTierNotFoundError) as exc_overflow:
        service.get_discount_tier_for_seats(1000000)
    assert exc_overflow.value.seats == 1000000


# ---------------------------------------------------------------------------
# Source of Truth & Repository Error Handling Tests
# ---------------------------------------------------------------------------

def test_product_prices_correspond_to_source_catalog():
    """Product prices returned by the service correspond exactly to catalog.json."""
    service = CatalogService()
    catalog_path = Path(__file__).resolve().parents[2] / "data" / "catalog.json"

    with open(catalog_path, "r", encoding="utf-8") as f:
        raw_catalog = json.load(f)

    for raw_p in raw_catalog["products"]:
        resolved = service.get_product_by_sku(raw_p["sku"])
        assert resolved.unit_price == Decimal(str(raw_p["unit_price"]))
        assert resolved.name == raw_p["name"]


def test_missing_catalog_file_raises_catalog_not_found_error(tmp_path: Path):
    """CatalogRepository raises CatalogNotFoundError when file does not exist."""
    missing_file = tmp_path / "nonexistent_catalog.json"
    repo = CatalogRepository(catalog_path=missing_file)

    with pytest.raises(CatalogNotFoundError):
        repo.load_catalog()


def test_malformed_catalog_json_raises_catalog_parse_error(tmp_path: Path):
    """CatalogRepository raises CatalogParseError on corrupted JSON."""
    bad_json_file = tmp_path / "corrupted.json"
    bad_json_file.write_text("{ not valid json: ... }", encoding="utf-8")
    repo = CatalogRepository(catalog_path=bad_json_file)

    with pytest.raises(CatalogParseError):
        repo.load_catalog()
