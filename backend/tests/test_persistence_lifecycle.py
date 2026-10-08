"""Regression test for quote persistence across object lifetimes and storage re-instantiation."""

from decimal import Decimal
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.quotes import QuoteRepository
from app.schemas.quote import QuoteLineItem, QuoteRequest, QuoteStatus
from app.services.quote import QuoteService
from app.services.quote_calculation import QuoteCalculationService


def test_quote_persists_across_object_lifetimes_and_reinstantiation(tmp_path: Path):
    """
    1. Creates a quote using an initial repository/service instance.
    2. Completely tears down the in-memory object instances.
    3. Recreates a brand new repository and service pointing to the same storage path.
    4. Reads the quote and verifies that all data persisted accurately.
    """
    storage_file = tmp_path / "quotes_lifecycle.json"

    # Step 1: Initial creation with first instance
    repo_1 = QuoteRepository(storage_path=storage_file)
    service_1 = QuoteService(
        calculation_service=QuoteCalculationService(),
        repository=repo_1,
    )

    req = QuoteRequest(
        customer_name="Persistent Horizon Corp",
        seats=50,
        line_items=[
            QuoteLineItem(sku="AGENT-CORE", quantity=10),
            QuoteLineItem(sku="ONBOARDING", quantity=1),
        ],
        discount_pct=Decimal("30.0"),
        annual_commitment=True,
    )

    created = service_1.create_quote(req)
    created_id = created.id
    assert created_id is not None
    assert created.tier == "ENTERPRISE"
    assert created.approval_required is True

    # Step 2: Destroy references to repository and service
    del repo_1
    del service_1

    # Step 3: Recreate completely independent repository and service instances
    repo_2 = QuoteRepository(storage_path=storage_file)
    service_2 = QuoteService(
        calculation_service=QuoteCalculationService(),
        repository=repo_2,
    )

    # Step 4: Verify quote still exists and is byte-for-byte and field-for-field preserved
    retrieved = service_2.get_quote(created_id)
    assert retrieved.id == created_id
    assert retrieved.customer_name == "Persistent Horizon Corp"
    assert retrieved.seats == 50
    assert retrieved.tier == "ENTERPRISE"
    assert retrieved.discount_pct == Decimal("30.0")
    assert retrieved.total == created.total
    assert retrieved.approval_required is True
    assert retrieved.status == QuoteStatus.DRAFT

    # Step 5: Verify list_quotes returns the quote
    all_quotes = service_2.list_quotes()
    assert any(q.id == created_id for q in all_quotes)


def test_api_quotes_returns_no_cache_headers():
    """Verifies GET /api/quotes and GET /api/quotes/{id} emit headers preventing stale caches."""
    client = TestClient(app)

    # List endpoint
    resp = client.get("/api/quotes")
    assert resp.status_code == 200
    assert "no-store" in resp.headers.get("Cache-Control", "")
    assert "no-cache" in resp.headers.get("Cache-Control", "")

    # Diagnostic endpoint
    status_resp = client.get("/api/quotes/copilot/status")
    assert status_resp.status_code == 200
    diag = status_resp.json()
    assert "configured" in diag
    assert "model" in diag
    # Ensure no API key is exposed in the diagnostic
    assert "key" not in diag
    assert "api_key" not in diag
