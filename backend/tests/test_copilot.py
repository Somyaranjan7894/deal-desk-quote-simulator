from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.gemini import FALLBACK_NO_KEY_MESSAGE, FALLBACK_UNAVAILABLE_MESSAGE, GeminiService


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_quote_payload():
    return {
        "customer_name": "Acme Corp",
        "seats": 15,
        "line_items": [
            {"sku": "AGENT-CORE", "quantity": 10},
            {"sku": "AGENT-ANALYTICS", "quantity": 5},
        ],
        "discount_pct": 12.0,
        "annual_commitment": True,
    }


def test_copilot_request_validation_empty_message(client, sample_quote_payload):
    # Test draft copilot with empty message
    response = client.post(
        "/api/quotes/copilot",
        json={"quote": sample_quote_payload, "message": ""},
    )
    assert response.status_code == 422

    # Create a quote first for saved quote endpoint
    create_resp = client.post("/api/quotes", json=sample_quote_payload)
    assert create_resp.status_code == 201
    quote_id = create_resp.json()["id"]

    # Test saved quote copilot with empty message
    saved_resp = client.post(
        f"/api/quotes/{quote_id}/copilot",
        json={"message": ""},
    )
    assert saved_resp.status_code == 422


def test_copilot_request_validation_extra_fields(client):
    response = client.post(
        "/api/quotes/copilot",
        json={
            "quote": {
                "customer_name": "Test",
                "seats": 5,
                "line_items": [{"sku": "AGENT-CORE", "quantity": 1}],
            },
            "message": "Explain",
            "forbidden_extra": "hack",
        },
    )
    assert response.status_code == 422


def test_saved_quote_copilot_success_mocked(client, sample_quote_payload):
    # 1. Create a quote
    create_resp = client.post("/api/quotes", json=sample_quote_payload)
    assert create_resp.status_code == 201
    quote = create_resp.json()
    quote_id = quote["id"]

    # 2. Mock GeminiService
    mock_explanation = "This quote is for Acme Corp with 15 seats in the GROWTH tier. Approval is required due to annual commitment with discount above 10%."
    with patch.object(
        GeminiService,
        "generate_explanation",
        return_value=(mock_explanation, "gemini-2.5-flash", True),
    ) as mock_gemini:
        response = client.post(
            f"/api/quotes/{quote_id}/copilot",
            json={"message": "Why does this need approval?", "action": "why_approval"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == mock_explanation
        assert data["quote_id"] == quote_id
        assert data["model"] == "gemini-2.5-flash"
        assert data["generated"] is True

        # Verify context passed to Gemini was built from authoritative quote data
        mock_gemini.assert_called_once()
        context = mock_gemini.call_args.kwargs["context"]
        assert context["customer_name"] == "Acme Corp"
        assert context["seats"] == 15
        assert context["tier"] == "GROWTH"
        assert context["approval_required"] is True
        assert len(context["approval_reasons"]) > 0

    # 3. Verify quote was NOT mutated
    get_resp = client.get(f"/api/quotes/{quote_id}")
    assert get_resp.status_code == 200
    unchanged_quote = get_resp.json()
    assert unchanged_quote["status"] == quote["status"]
    assert unchanged_quote["total"] == quote["total"]


def test_unsaved_draft_copilot_success_mocked(client, sample_quote_payload):
    mock_explanation = "The draft total is calculated as $3,960.00 after a 12% discount."
    with patch.object(
        GeminiService,
        "generate_explanation",
        return_value=(mock_explanation, "gemini-2.5-flash", True),
    ) as mock_gemini:
        response = client.post(
            "/api/quotes/copilot",
            json={
                "quote": sample_quote_payload,
                "message": "Explain pricing for this quote",
                "action": "explain_pricing",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == mock_explanation
        assert data["quote_id"] is None
        assert data["model"] == "gemini-2.5-flash"
        assert data["generated"] is True

        mock_gemini.assert_called_once()
        context = mock_gemini.call_args.kwargs["context"]
        # Authoritative calculation ran before Gemini call
        assert context["customer_name"] == "Acme Corp"
        assert context["subtotal"] == "1600.00"
        assert context["total"] == "1408.00"
        assert context["approval_required"] is True


def test_copilot_fallback_when_gemini_unavailable(client, sample_quote_payload):
    # Mock GeminiService throwing an exception or returning fallback
    with patch.object(
        GeminiService,
        "generate_explanation",
        return_value=(FALLBACK_UNAVAILABLE_MESSAGE, "gemini-2.5-flash", False),
    ):
        response = client.post(
            "/api/quotes/copilot",
            json={"quote": sample_quote_payload, "message": "Summarize deal"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "temporarily unavailable" in data["answer"]
        assert data["generated"] is False


def test_copilot_fallback_when_no_api_key(client, sample_quote_payload):
    # When api_key is None or empty
    service = GeminiService(api_key=None, model="gemini-2.5-flash")
    answer, model, generated = service.generate_explanation(
        context={"customer_name": "Test"},
        user_message="Hello",
    )
    assert answer == FALLBACK_NO_KEY_MESSAGE
    assert generated is False


def test_saved_quote_copilot_not_found(client):
    response = client.post(
        "/api/quotes/non-existent-id-9999/copilot",
        json={"message": "Why approval?"},
    )
    assert response.status_code == 404


def test_copilot_does_not_persist_or_create_draft_quotes(client, sample_quote_payload):
    initial_quotes = client.get("/api/quotes").json()
    initial_count = len(initial_quotes)

    with patch.object(
        GeminiService,
        "generate_explanation",
        return_value=("Draft explanation", "gemini-2.5-flash", True),
    ):
        response = client.post(
            "/api/quotes/copilot",
            json={"quote": sample_quote_payload, "message": "What can I change?"},
        )
        assert response.status_code == 200

    after_quotes = client.get("/api/quotes").json()
    assert len(after_quotes) == initial_count
