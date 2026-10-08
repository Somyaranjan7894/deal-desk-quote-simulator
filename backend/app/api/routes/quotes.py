from typing import List
from fastapi import APIRouter, Depends, Response, status

from app.api.deps import (
    get_copilot_service,
    get_gemini_service,
    get_quote_calculation_service,
    get_quote_service,
)
from app.schemas.copilot import (
    CopilotMessageRequest,
    CopilotResponse,
    UnsavedQuoteCopilotRequest,
)
from app.schemas.quote import (
    QuoteCalculationResult,
    QuoteRequest,
    QuoteResponse,
    QuoteStatusUpdateRequest,
)
from app.services.copilot import CopilotService
from app.services.gemini import GeminiService
from app.services.quote import QuoteService
from app.services.quote_calculation import QuoteCalculationService

router = APIRouter()


@router.post(
    "/calculate",
    response_model=QuoteCalculationResult,
    status_code=status.HTTP_200_OK,
    summary="Calculate quote pricing and approval rules without persistence",
    description="Authoritatively calculates line totals, subtotal, discount amount, final total, pricing tier, and deal desk approval reasons without persisting data.",
)
def calculate_quote(
    request: QuoteRequest,
    calc_service: QuoteCalculationService = Depends(get_quote_calculation_service),
) -> QuoteCalculationResult:
    """Calculates quote totals and approval requirements using QuoteCalculationService."""
    return calc_service.calculate(request)


@router.post(
    "",
    response_model=QuoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and persist a calculated quote",
    description="Calculates a quote authoritatively, assigns a unique UUID, initializes status to DRAFT, and saves it to JSON storage.",
)
def create_quote(
    request: QuoteRequest,
    quote_service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    """Creates and persists an authoritative quote in DRAFT status."""
    return quote_service.create_quote(request)


@router.get(
    "",
    response_model=List[QuoteResponse],
    status_code=status.HTTP_200_OK,
    summary="List all persisted quotes",
    description="Returns all persisted customer quotes.",
)
def list_quotes(
    response: Response,
    quote_service: QuoteService = Depends(get_quote_service),
) -> List[QuoteResponse]:
    """Lists all persisted quotes with explicit cache disabling headers."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return quote_service.list_quotes()


@router.post(
    "/copilot",
    response_model=CopilotResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask Deal Desk Copilot about an unsaved quote draft",
    description="Authoritatively calculates raw quote inputs via QuoteCalculationService, then provides verified context to Gemini for natural-language explanations.",
)
def ask_draft_copilot(
    request: UnsavedQuoteCopilotRequest,
    copilot_service: CopilotService = Depends(get_copilot_service),
) -> CopilotResponse:
    """Calculates quote draft authoritatively and generates Copilot explanation."""
    return copilot_service.explain_draft_quote(
        request=request.quote,
        message=request.message,
        action=request.action,
    )


@router.get(
    "/copilot/status",
    status_code=status.HTTP_200_OK,
    summary="Safe diagnostic status of Gemini Deal Desk Copilot",
    description="Returns operational status of Gemini Copilot integration without exposing credentials.",
)
def get_copilot_status(
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> dict:
    """Safe diagnostic endpoint for Copilot service configuration."""
    return {
        "configured": gemini_service.is_configured,
        "model": gemini_service.model,
    }


@router.get(
    "/{id}",
    response_model=QuoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve a saved quote by ID",
    description="Retrieves a persisted quote by its unique ID. Returns 404 if not found.",
)
def get_quote_by_id(
    id: str,
    response: Response,
    quote_service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    """Retrieves a persisted quote by ID with explicit cache disabling headers."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return quote_service.get_quote(id)


@router.patch(
    "/{id}/status",
    response_model=QuoteResponse,
    status_code=status.HTTP_200_OK,
    summary="Update quote lifecycle status",
    description="Transitions quote status according to allowed state transitions (DRAFT -> SUBMITTED -> APPROVED | REJECTED).",
)
def update_quote_status(
    id: str,
    status_update: QuoteStatusUpdateRequest,
    quote_service: QuoteService = Depends(get_quote_service),
) -> QuoteResponse:
    """Transitions quote status adhering to the authoritative state machine."""
    return quote_service.change_status(id, status_update.status)


@router.post(
    "/{id}/copilot",
    response_model=CopilotResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask Deal Desk Copilot about a persisted quote",
    description="Provides authoritative saved quote context to Gemini for natural-language explanations.",
)
def ask_saved_quote_copilot(
    id: str,
    request: CopilotMessageRequest,
    copilot_service: CopilotService = Depends(get_copilot_service),
) -> CopilotResponse:
    """Retrieves authoritative saved quote and generates Copilot explanation."""
    return copilot_service.explain_saved_quote(
        quote_id=id,
        message=request.message,
        action=request.action,
    )

