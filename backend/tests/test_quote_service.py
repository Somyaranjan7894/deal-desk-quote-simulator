from decimal import Decimal
from pathlib import Path
import pytest

from app.core.exceptions import (
    InvalidQuoteStatusTransitionError,
    QuoteNotFoundError,
    QuoteStorageCorruptedError,
)
from app.repositories.catalog import CatalogRepository
from app.repositories.quotes import QuoteRepository
from app.schemas.quote import (
    QuoteLineItem,
    QuoteLineItemResponse,
    QuoteRequest,
    QuoteResponse,
    QuoteStatus,
)
from app.services.catalog import CatalogService
from app.services.quote import QuoteService
from app.services.quote_calculation import QuoteCalculationService


# ===========================================================================
# 1. QuoteRepository Unit Tests (Isolated via tmp_path)
# ===========================================================================

def test_missing_quotes_file_initializes_safely(tmp_path: Path):
    """1. Missing quotes file initializes safely as an empty array."""
    storage_file = tmp_path / "quotes.json"
    assert not storage_file.exists()

    repo = QuoteRepository(storage_path=storage_file)
    quotes = repo.list_all()

    assert quotes == []
    assert storage_file.exists()
    assert storage_file.read_text(encoding="utf-8") == "[]"


def test_empty_quotes_file_returns_empty_list(tmp_path: Path):
    """2. Empty quotes file/list returns []."""
    storage_file = tmp_path / "quotes.json"
    storage_file.write_text("[]", encoding="utf-8")

    repo = QuoteRepository(storage_path=storage_file)
    assert repo.list_all() == []


def test_create_save_quote_persists_data(tmp_path: Path):
    """3. Create/save quote persists data."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    quote = QuoteResponse(
        id="quote-1",
        customer_name="Test Corp",
        seats=10,
        line_items=[
            QuoteLineItemResponse(
                sku="AGENT-CORE",
                quantity=2,
                unit_price=Decimal("120.00"),
                line_total=Decimal("240.00"),
            )
        ],
        discount_pct=Decimal("0.00"),
        annual_commitment=False,
        tier="GROWTH",
        subtotal=Decimal("240.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("240.00"),
        approval_required=False,
        approval_reasons=[],
    )

    saved = repo.save(quote)
    assert saved.id == "quote-1"

    # Verify reload from disk
    loaded = repo.get_by_id("quote-1")
    assert loaded.id == "quote-1"
    assert loaded.customer_name == "Test Corp"
    assert loaded.total == Decimal("240.00")


def test_get_quote_by_id_works(tmp_path: Path):
    """4. Get quote by ID works."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    q1 = QuoteResponse(
        id="q-abc",
        customer_name="Customer ABC",
        seats=5,
        line_items=[QuoteLineItemResponse(sku="AGENT-CORE", quantity=1)],
        status=QuoteStatus.DRAFT,
    )
    repo.save(q1)

    result = repo.get_by_id("q-abc")
    assert result.customer_name == "Customer ABC"
    assert result.status == QuoteStatus.DRAFT


def test_missing_quote_id_raises_quote_not_found_error(tmp_path: Path):
    """5. Missing quote ID raises QuoteNotFoundError."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")

    with pytest.raises(QuoteNotFoundError) as exc_info:
        repo.get_by_id("non-existent-id")
    assert exc_info.value.quote_id == "non-existent-id"


def test_list_quotes_returns_saved_quotes(tmp_path: Path):
    """6. List quotes returns saved quotes."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    repo.save(
        QuoteResponse(
            id="q-1",
            customer_name="Co 1",
            seats=5,
            line_items=[QuoteLineItemResponse(sku="AGENT-CORE", quantity=1)],
        )
    )
    repo.save(
        QuoteResponse(
            id="q-2",
            customer_name="Co 2",
            seats=15,
            line_items=[QuoteLineItemResponse(sku="AGENT-ANALYTICS", quantity=2)],
        )
    )

    all_quotes = repo.list_all()
    assert len(all_quotes) == 2
    assert {q.id for q in all_quotes} == {"q-1", "q-2"}


def test_update_quote_persists_changes(tmp_path: Path):
    """7. Update quote persists changes."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    quote = QuoteResponse(
        id="q-update",
        customer_name="Mutable Co",
        seats=10,
        line_items=[QuoteLineItemResponse(sku="AGENT-CORE", quantity=1)],
        status=QuoteStatus.DRAFT,
    )
    repo.save(quote)

    quote.status = QuoteStatus.SUBMITTED
    repo.update(quote)

    reloaded = repo.get_by_id("q-update")
    assert reloaded.status == QuoteStatus.SUBMITTED


def test_malformed_quotes_json_produces_clear_persistence_error(tmp_path: Path):
    """8. Malformed quotes.json produces QuoteStorageCorruptedError."""
    storage_file = tmp_path / "quotes.json"
    storage_file.write_text("{ not valid json array ... }", encoding="utf-8")

    repo = QuoteRepository(storage_path=storage_file)
    with pytest.raises(QuoteStorageCorruptedError):
        repo.list_all()


def test_decimal_values_survive_save_load_without_losing_precision(tmp_path: Path):
    """9. Decimal values survive save/load without losing precision."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    quote = QuoteResponse(
        id="q-precision",
        customer_name="Precision Co",
        seats=10,
        line_items=[
            QuoteLineItemResponse(
                sku="AGENT-CORE",
                quantity=1,
                unit_price=Decimal("120.00"),
                line_total=Decimal("120.00"),
            )
        ],
        discount_pct=Decimal("12.55"),
        subtotal=Decimal("120.00"),
        discount_amount=Decimal("15.06"),
        total=Decimal("104.94"),
    )

    repo.save(quote)
    loaded = repo.get_by_id("q-precision")

    assert isinstance(loaded.total, Decimal)
    assert loaded.total == Decimal("104.94")
    assert loaded.discount_amount == Decimal("15.06")
    assert loaded.discount_pct == Decimal("12.55")


# ===========================================================================
# 2. QuoteService Domain & Lifecycle Tests
# ===========================================================================

@pytest.fixture
def quote_service(tmp_path: Path):
    """Provides a QuoteService wired to an isolated temporary repository."""
    repo = QuoteRepository(storage_path=tmp_path / "quotes.json")
    calc_service = QuoteCalculationService()
    return QuoteService(calculation_service=calc_service, repository=repo)


def test_create_quote_invokes_authoritative_calculation(quote_service):
    """10. Creating a quote invokes authoritative calculation."""
    request = QuoteRequest(
        customer_name="Acme Corp",
        seats=10,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=2)],
        discount_pct=Decimal("10.00"),
        annual_commitment=False,
    )

    quote = quote_service.create_quote(request)

    # Authoritative calculation: 2 * 120 = 240, 10% discount = 24, total = 216
    assert quote.tier == "GROWTH"
    assert quote.subtotal == Decimal("240.00")
    assert quote.discount_amount == Decimal("24.00")
    assert quote.total == Decimal("216.00")


def test_new_quote_starts_in_draft_status(quote_service):
    """11. New quote starts in DRAFT status."""
    request = QuoteRequest(
        customer_name="Draft Co",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
    )

    quote = quote_service.create_quote(request)
    assert quote.status == QuoteStatus.DRAFT


def test_quote_receives_unique_id(quote_service):
    """12. Quote receives a unique UUID-based ID."""
    request = QuoteRequest(
        customer_name="UUID Co",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
    )

    quote = quote_service.create_quote(request)
    assert quote.id is not None
    assert len(quote.id) >= 16


def test_historical_calculated_pricing_is_stored(quote_service):
    """13. Historical calculated pricing is stored in the quote."""
    request = QuoteRequest(
        customer_name="Historical Co",
        seats=20,
        line_items=[QuoteLineItem(sku="ONBOARDING", quantity=1)],
        discount_pct=Decimal("5"),
    )

    quote = quote_service.create_quote(request)

    assert len(quote.line_items) == 1
    assert quote.line_items[0].sku == "ONBOARDING"
    assert quote.line_items[0].name == "Implementation"
    assert quote.line_items[0].unit_price == Decimal("2500.00")
    assert quote.line_items[0].line_total == Decimal("2500.00")
    assert quote.subtotal == Decimal("2500.00")
    assert quote.discount_amount == Decimal("125.00")
    assert quote.total == Decimal("2375.00")


def test_draft_to_submitted_succeeds(quote_service):
    """14. DRAFT -> SUBMITTED succeeds."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C1", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    assert quote.status == QuoteStatus.DRAFT

    updated = quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)
    assert updated.status == QuoteStatus.SUBMITTED


def test_submitted_to_approved_succeeds(quote_service):
    """15. SUBMITTED -> APPROVED succeeds."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C2", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)

    approved = quote_service.change_status(quote.id, QuoteStatus.APPROVED)
    assert approved.status == QuoteStatus.APPROVED


def test_submitted_to_rejected_succeeds(quote_service):
    """16. SUBMITTED -> REJECTED succeeds."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C3", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)

    rejected = quote_service.change_status(quote.id, QuoteStatus.REJECTED)
    assert rejected.status == QuoteStatus.REJECTED


def test_draft_to_approved_is_rejected(quote_service):
    """17. DRAFT -> APPROVED is rejected."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C4", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )

    with pytest.raises(InvalidQuoteStatusTransitionError) as exc_info:
        quote_service.change_status(quote.id, QuoteStatus.APPROVED)
    assert exc_info.value.current_status == "draft"
    assert exc_info.value.target_status == "approved"


def test_draft_to_rejected_is_rejected(quote_service):
    """18. DRAFT -> REJECTED is rejected."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C5", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )

    with pytest.raises(InvalidQuoteStatusTransitionError) as exc_info:
        quote_service.change_status(quote.id, QuoteStatus.REJECTED)
    assert exc_info.value.current_status == "draft"
    assert exc_info.value.target_status == "rejected"


def test_approved_cannot_transition_elsewhere(quote_service):
    """19. APPROVED cannot transition elsewhere."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C6", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)
    quote_service.change_status(quote.id, QuoteStatus.APPROVED)

    for target in [QuoteStatus.DRAFT, QuoteStatus.SUBMITTED, QuoteStatus.REJECTED]:
        with pytest.raises(InvalidQuoteStatusTransitionError):
            quote_service.change_status(quote.id, target)


def test_rejected_cannot_transition_elsewhere(quote_service):
    """20. REJECTED cannot transition elsewhere."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C7", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)
    quote_service.change_status(quote.id, QuoteStatus.REJECTED)

    for target in [QuoteStatus.DRAFT, QuoteStatus.SUBMITTED, QuoteStatus.APPROVED]:
        with pytest.raises(InvalidQuoteStatusTransitionError):
            quote_service.change_status(quote.id, target)


def test_submitted_to_submitted_is_rejected(quote_service):
    """21. SUBMITTED -> SUBMITTED is rejected (cannot re-submit already submitted quote)."""
    quote = quote_service.create_quote(
        QuoteRequest(customer_name="C8", seats=5, line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)])
    )
    quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)

    with pytest.raises(InvalidQuoteStatusTransitionError) as exc_info:
        quote_service.change_status(quote.id, QuoteStatus.SUBMITTED)
    assert exc_info.value.current_status == "submitted"
    assert exc_info.value.target_status == "submitted"


def test_historical_pricing_persists_across_catalog_changes(tmp_path: Path):
    """
    22. Part 6 Scenario:
    1. Create quote using a product with current catalog price ($120.00).
    2. Save quote to isolated storage.
    3. Change catalog price to $500.00 in a temporary test fixture.
    4. Retrieve saved quote.
    5. Confirm saved quote still contains original product name, unit price, line total, and total ($120.00).
    """
    import json
    catalog_file = tmp_path / "temp_catalog.json"
    quotes_file = tmp_path / "temp_quotes.json"

    initial_catalog_data = {
        "currency": "USD",
        "discount_rules": [
            {"code": "STARTER", "min_seats": 1, "max_seats": 9, "max_discount_pct": "10"}
        ],
        "products": [
            {"sku": "AGENT-CORE", "name": "Agent Core", "unit_price": "120"}
        ]
    }
    catalog_file.write_text(json.dumps(initial_catalog_data), encoding="utf-8")

    cat_repo = CatalogRepository(catalog_path=catalog_file)
    cat_service = CatalogService(repository=cat_repo)
    calc_service = QuoteCalculationService(catalog_service=cat_service)
    quote_repo = QuoteRepository(storage_path=quotes_file)
    quote_svc = QuoteService(calculation_service=calc_service, repository=quote_repo)

    # 1. Create quote using current catalog price ($120.00)
    req = QuoteRequest(
        customer_name="Frozen Price Corp",
        seats=5,
        line_items=[QuoteLineItem(sku="AGENT-CORE", quantity=1)],
        discount_pct=Decimal("0"),
        annual_commitment=False,
    )
    # 2. Save quote
    saved_quote = quote_svc.create_quote(req)
    assert saved_quote.line_items[0].unit_price == Decimal("120.00")
    assert saved_quote.total == Decimal("120.00")

    # 3. Change catalog price in temporary test fixture ($500.00)
    mutated_catalog_data = {
        "currency": "USD",
        "discount_rules": [
            {"code": "STARTER", "min_seats": 1, "max_seats": 9, "max_discount_pct": "10"}
        ],
        "products": [
            {"sku": "AGENT-CORE", "name": "Agent Core (Updated)", "unit_price": "500"}
        ]
    }
    catalog_file.write_text(json.dumps(mutated_catalog_data), encoding="utf-8")
    cat_repo.load_catalog()

    # 4. Retrieve saved quote
    retrieved_quote = quote_svc.get_quote(saved_quote.id)

    # 5. Confirm saved quote still contains original product name/unit price/line total/total
    assert retrieved_quote.line_items[0].name == "Agent Core"
    assert retrieved_quote.line_items[0].unit_price == Decimal("120.00")
    assert retrieved_quote.line_items[0].line_total == Decimal("120.00")
    assert retrieved_quote.subtotal == Decimal("120.00")
    assert retrieved_quote.total == Decimal("120.00")

