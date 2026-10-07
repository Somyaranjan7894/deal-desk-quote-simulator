from decimal import Decimal
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_quote_repository
from app.main import app
from app.repositories.quotes import QuoteRepository

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_quote_repository(tmp_path: Path):
    """
    Overrides the QuoteRepository dependency in FastAPI to use an isolated temporary storage file.
    Ensures unit tests never mutate production backend/data/quotes.json.
    """
    test_repo = QuoteRepository(storage_path=tmp_path / "test_api_quotes.json")
    app.dependency_overrides[get_quote_repository] = lambda: test_repo
    yield test_repo
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Catalog API Tests
# ---------------------------------------------------------------------------

def test_get_catalog_returns_200():
    """GET /api/catalog returns 200."""
    response = client.get("/api/catalog")
    assert response.status_code == 200


def test_get_catalog_returns_expected_products_and_tiers():
    """GET /api/catalog returns the expected products and discount tiers."""
    response = client.get("/api/catalog")
    assert response.status_code == 200
    data = response.json()

    assert data["currency"] == "USD"
    assert "products" in data
    assert "discount_rules" in data

    skus = [p["sku"] for p in data["products"]]
    assert "AGENT-CORE" in skus
    assert "AGENT-ANALYTICS" in skus
    assert "AGENT-AUTOMATE" in skus
    assert "ONBOARDING" in skus

    tier_codes = [t["code"] for t in data["discount_rules"]]
    assert tier_codes == ["STARTER", "GROWTH", "ENTERPRISE"]


# ---------------------------------------------------------------------------
# Calculate API Tests
# ---------------------------------------------------------------------------

def test_post_quotes_calculate_valid_returns_200():
    """POST /api/quotes/calculate with a valid quote returns 200."""
    payload = {
        "customer_name": "Acme Corp",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 5}],
        "discount_pct": 10.0,
        "annual_commitment": False,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 200


def test_calculate_returns_authoritative_totals_and_approval():
    """Calculate endpoint returns backend-calculated subtotal, discount, total, tier, and approval."""
    payload = {
        "customer_name": "Acme Corp",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 5}],
        "discount_pct": 10.0,
        "annual_commitment": False,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["tier"] == "GROWTH"
    assert data["subtotal"] == "600.00"
    assert data["discount_amount"] == "60.00"
    assert data["total"] == "540.00"
    assert data["approval_required"] is False
    assert data["approval_reasons"] == []
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["sku"] == "AGENT-CORE"
    assert data["line_items"][0]["name"] == "Agent Core"
    assert data["line_items"][0]["unit_price"] == "120.00"
    assert data["line_items"][0]["line_total"] == "600.00"


def test_invalid_structural_input_rejected_with_422():
    """Invalid structural input is rejected by FastAPI/Pydantic with 422."""
    # Missing customer_name
    bad_missing = {"seats": 10, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]}
    assert client.post("/api/quotes/calculate", json=bad_missing).status_code == 422

    # Zero seats
    bad_zero = {"customer_name": "Test", "seats": 0, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]}
    assert client.post("/api/quotes/calculate", json=bad_zero).status_code == 422

    # Empty line items
    bad_empty = {"customer_name": "Test", "seats": 5, "line_items": []}
    assert client.post("/api/quotes/calculate", json=bad_empty).status_code == 422

    # Negative quantity
    bad_neg_qty = {"customer_name": "Test", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": -1}]}
    assert client.post("/api/quotes/calculate", json=bad_neg_qty).status_code == 422


def test_unknown_sku_produces_404():
    """Unknown SKU produces HTTP 404 with error detail."""
    payload = {
        "customer_name": "Unknown SKU Co",
        "seats": 10,
        "line_items": [{"sku": "NONEXISTENT-SKU", "quantity": 1}],
        "discount_pct": 0,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 404
    assert "NONEXISTENT-SKU" in response.json()["detail"]


def test_discount_exceeding_tier_maximum_produces_400():
    """Discount exceeding tier maximum produces HTTP 400."""
    payload = {
        "customer_name": "Greedy Co",
        "seats": 5,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": 15.0,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 400
    assert "exceeds maximum allowable discount" in response.json()["detail"]


@pytest.mark.parametrize(
    "seats,expected_tier,max_discount",
    [
        (9, "STARTER", 10.0),
        (10, "GROWTH", 20.0),
        (49, "GROWTH", 20.0),
        (50, "ENTERPRISE", 30.0),
    ],
)
def test_tier_boundary_behavior_through_api(seats, expected_tier, max_discount):
    """Boundary behavior is preserved through the API."""
    payload = {
        "customer_name": "Boundary Co",
        "seats": seats,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": max_discount,
    }
    response = client.post("/api/quotes/calculate", json=payload)
    assert response.status_code == 200
    assert response.json()["tier"] == expected_tier


def test_calculate_endpoint_does_not_trust_client_provided_totals():
    """Calculate endpoint rejects client attempts to fabricate totals via extra='forbid'."""
    payload = {
        "customer_name": "Tamper Co",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 10}],
        "discount_pct": 0,
        "subtotal": 1.00,
        "total": 1.00,
        "approval_required": False,
    }
    assert client.post("/api/quotes/calculate", json=payload).status_code == 422


def test_create_endpoint_does_not_trust_client_provided_totals():
    """POST /api/quotes endpoint rejects client attempts to fabricate totals via extra='forbid'."""
    payload = {
        "customer_name": "Tamper Co",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 10}],
        "discount_pct": 0,
        "subtotal": 1.00,
        "total": 1.00,
        "approval_required": False,
    }
    assert client.post("/api/quotes", json=payload).status_code == 422


def test_cors_preflight_headers():
    """Verify CORS response headers for allowed origins."""
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
    }
    response = client.options("/api/quotes/calculate", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


# ---------------------------------------------------------------------------
# Phase 6 Persistence & Lifecycle API Tests (21-32)
# ---------------------------------------------------------------------------

def test_post_quotes_returns_201():
    """21. POST /api/quotes creates quote and returns 201."""
    payload = {
        "customer_name": "New Client",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 2}],
        "discount_pct": 5.0,
        "annual_commitment": False,
    }
    response = client.post("/api/quotes", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["id"] is not None
    assert data["status"] == "draft"
    assert data["subtotal"] == "240.00"
    assert data["total"] == "228.00"


def test_created_quote_can_be_retrieved_by_id():
    """22. Created quote can be retrieved with GET /api/quotes/{id}."""
    payload = {
        "customer_name": "Fetch Client",
        "seats": 15,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": 0,
    }
    create_res = client.post("/api/quotes", json=payload)
    quote_id = create_res.json()["id"]

    get_res = client.get(f"/api/quotes/{quote_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == quote_id
    assert get_res.json()["customer_name"] == "Fetch Client"


def test_created_quote_appears_in_quotes_list():
    """23. Created quote appears in GET /api/quotes."""
    payload = {
        "customer_name": "List Client",
        "seats": 15,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
        "discount_pct": 0,
    }
    create_res = client.post("/api/quotes", json=payload)
    quote_id = create_res.json()["id"]

    list_res = client.get("/api/quotes")
    assert list_res.status_code == 200
    all_quotes = list_res.json()
    assert any(q["id"] == quote_id for q in all_quotes)


def test_unknown_quote_id_returns_404():
    """24. Unknown quote ID returns 404."""
    response = client.get("/api/quotes/nonexistent-id-000")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_patch_status_draft_to_submitted_returns_200():
    """25. PATCH status DRAFT -> SUBMITTED returns 200."""
    create_res = client.post(
        "/api/quotes",
        json={"customer_name": "C1", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]},
    )
    quote_id = create_res.json()["id"]

    patch_res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "submitted"


def test_patch_status_submitted_to_approved_returns_200():
    """26. PATCH SUBMITTED -> APPROVED returns 200."""
    create_res = client.post(
        "/api/quotes",
        json={"customer_name": "C2", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]},
    )
    quote_id = create_res.json()["id"]
    client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})

    approve_res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "approved"})
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"


def test_patch_status_submitted_to_rejected_returns_200():
    """27. PATCH SUBMITTED -> REJECTED returns 200."""
    create_res = client.post(
        "/api/quotes",
        json={"customer_name": "C3", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]},
    )
    quote_id = create_res.json()["id"]
    client.patch(f"/api/quotes/{quote_id}/status", json={"status": "submitted"})

    reject_res = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "rejected"})
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"


def test_invalid_status_transition_returns_400():
    """28. Invalid status transition returns 400."""
    # DRAFT -> APPROVED is invalid
    create_res = client.post(
        "/api/quotes",
        json={"customer_name": "C4", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]},
    )
    quote_id = create_res.json()["id"]

    bad_patch = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "approved"})
    assert bad_patch.status_code == 400
    assert "cannot transition quote from 'draft' to 'approved'" in bad_patch.json()["detail"].lower()


def test_invalid_status_value_returns_422():
    """29. Invalid status value returns 422."""
    create_res = client.post(
        "/api/quotes",
        json={"customer_name": "C5", "seats": 5, "line_items": [{"sku": "AGENT-CORE", "quantity": 1}]},
    )
    quote_id = create_res.json()["id"]

    bad_val = client.patch(f"/api/quotes/{quote_id}/status", json={"status": "invalid_status"})
    assert bad_val.status_code == 422


def test_backend_calculated_totals_remain_authoritative_on_create():
    """30. Backend-calculated totals remain authoritative when quote is created."""
    # Client passes 10 seats, 10x AGENT-CORE ($1200), 10% discount ($120), total = $1080
    payload = {
        "customer_name": "Authoritative Co",
        "seats": 10,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 10}],
        "discount_pct": 10.0,
    }
    response = client.post("/api/quotes", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert data["subtotal"] == "1200.00"
    assert data["discount_amount"] == "120.00"
    assert data["total"] == "1080.00"
    assert data["tier"] == "GROWTH"


def test_saved_quote_preserves_historical_unit_price_and_product_info():
    """31. Saved quote preserves historical unit price and product info."""
    payload = {
        "customer_name": "Historical Audit Co",
        "seats": 20,
        "line_items": [{"sku": "ONBOARDING", "quantity": 1}],
        "discount_pct": 0,
    }
    create_res = client.post("/api/quotes", json=payload)
    quote_id = create_res.json()["id"]

    saved = client.get(f"/api/quotes/{quote_id}").json()
    line_item = saved["line_items"][0]

    assert line_item["sku"] == "ONBOARDING"
    assert line_item["name"] == "Implementation"
    assert line_item["unit_price"] == "2500.00"
    assert line_item["line_total"] == "2500.00"


def test_multiple_quotes_receive_different_ids():
    """32. Multiple quotes receive different unique IDs."""
    payload = {
        "customer_name": "Multi Co",
        "seats": 5,
        "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
    }
    q1 = client.post("/api/quotes", json=payload).json()["id"]
    q2 = client.post("/api/quotes", json=payload).json()["id"]

    assert q1 != q2
