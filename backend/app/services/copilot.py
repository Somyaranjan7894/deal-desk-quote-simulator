from typing import Any, Dict, Optional

from app.schemas.copilot import CopilotResponse
from app.schemas.quote import QuoteRequest, QuoteResponse
from app.services.gemini import GeminiService
from app.services.quote import QuoteService
from app.services.quote_calculation import QuoteCalculationService


class CopilotService:
    """
    Coordinates authoritative calculation and the Gemini explanation service.
    Ensures Gemini receives strictly verified, authoritative domain calculation data.
    """

    def __init__(
        self,
        calculation_service: QuoteCalculationService,
        quote_service: QuoteService,
        gemini_service: GeminiService,
    ):
        self._calculation_service = calculation_service
        self._quote_service = quote_service
        self._gemini_service = gemini_service

    def explain_saved_quote(
        self,
        quote_id: str,
        message: str,
        action: Optional[str] = None,
    ) -> CopilotResponse:
        """
        Retrieves a persisted quote, constructs authoritative context, and prompts Copilot.
        """
        quote: QuoteResponse = self._quote_service.get_quote(quote_id)

        context = self._build_context_from_quote(quote)
        answer, model, generated = self._gemini_service.generate_explanation(
            context=context,
            user_message=message,
            action=action,
        )

        return CopilotResponse(
            answer=answer,
            quote_id=quote.id,
            model=model,
            generated=generated,
        )

    def explain_draft_quote(
        self,
        request: QuoteRequest,
        message: str,
        action: Optional[str] = None,
    ) -> CopilotResponse:
        """
        Calculates quote inputs authoritatively through QuoteCalculationService first,
        then provides the verified calculation result to Copilot.
        """
        calc_result = self._calculation_service.calculate(request)

        context: Dict[str, Any] = {
            "customer_name": request.customer_name,
            "seats": request.seats,
            "tier": calc_result.tier,
            "tier_max_discount_pct": calc_result.tier_max_discount_pct if hasattr(calc_result, "tier_max_discount_pct") else None,
            "discount_pct": str(request.discount_pct),
            "annual_commitment": request.annual_commitment,
            "subtotal": str(calc_result.subtotal),
            "discount_amount": str(calc_result.discount_amount),
            "total": str(calc_result.total),
            "approval_required": calc_result.approval_required,
            "approval_reasons": calc_result.approval_reasons,
            "line_items": [
                {
                    "sku": item.sku,
                    "name": item.name or item.product_name or item.sku,
                    "quantity": item.quantity,
                    "unit_price": str(item.unit_price) if item.unit_price is not None else "0.00",
                    "line_total": str(item.line_total) if item.line_total is not None else "0.00",
                }
                for item in calc_result.line_items
            ],
            "status": "draft",
        }

        answer, model, generated = self._gemini_service.generate_explanation(
            context=context,
            user_message=message,
            action=action,
        )

        return CopilotResponse(
            answer=answer,
            quote_id=None,
            model=model,
            generated=generated,
        )

    def _build_context_from_quote(self, quote: QuoteResponse) -> Dict[str, Any]:
        """Formats a saved quote into structured context for the copilot."""
        return {
            "quote_id": quote.id,
            "customer_name": quote.customer_name,
            "seats": quote.seats,
            "tier": quote.tier,
            "discount_pct": str(quote.discount_pct),
            "annual_commitment": quote.annual_commitment,
            "subtotal": str(quote.subtotal) if quote.subtotal is not None else "0.00",
            "discount_amount": str(quote.discount_amount) if quote.discount_amount is not None else "0.00",
            "total": str(quote.total) if quote.total is not None else "0.00",
            "approval_required": quote.approval_required,
            "approval_reasons": quote.approval_reasons or [],
            "line_items": [
                {
                    "sku": item.sku,
                    "name": item.name or item.product_name or item.sku,
                    "quantity": item.quantity,
                    "unit_price": str(item.unit_price) if item.unit_price is not None else "0.00",
                    "line_total": str(item.line_total) if item.line_total is not None else "0.00",
                }
                for item in quote.line_items
            ],
            "status": str(quote.status),
        }
