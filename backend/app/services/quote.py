from datetime import datetime, timezone
from typing import List, Optional, Set
import uuid

from app.core.exceptions import InvalidQuoteStatusTransitionError
from app.repositories.quotes import QuoteRepository
from app.schemas.quote import QuoteRequest, QuoteResponse, QuoteStatus
from app.services.quote_calculation import QuoteCalculationService

# Authoritative Quote Status State Machine
ALLOWED_TRANSITIONS: dict[QuoteStatus, Set[QuoteStatus]] = {
    QuoteStatus.DRAFT: {QuoteStatus.SUBMITTED},
    QuoteStatus.SUBMITTED: {QuoteStatus.APPROVED, QuoteStatus.REJECTED},
    QuoteStatus.APPROVED: set(),
    QuoteStatus.REJECTED: set(),
}


class QuoteService:
    """
    Application domain service for quote management.
    Coordinates calculation, file persistence, retrieval, and status lifecycle transitions.
    """

    def __init__(
        self,
        calculation_service: Optional[QuoteCalculationService] = None,
        repository: Optional[QuoteRepository] = None,
    ) -> None:
        self._calculation_service = calculation_service or QuoteCalculationService()
        self._repository = repository or QuoteRepository()

    def create_quote(self, request: QuoteRequest) -> QuoteResponse:
        """
        Calculates an authoritative quote, assigns a UUID, sets initial status to DRAFT,
        and saves it to persistent storage.
        """
        # 1. Authoritative calculation via domain calculation engine
        calc_result = self._calculation_service.calculate(request)

        # 2. Generate unique UUID and UTC timestamps
        quote_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).isoformat()

        # 3. Assemble complete historical QuoteResponse
        quote = QuoteResponse(
            id=quote_id,
            status=QuoteStatus.DRAFT,
            customer_name=request.customer_name,
            seats=request.seats,
            line_items=calc_result.line_items,
            discount_pct=calc_result.discount_pct if calc_result.discount_pct is not None else request.discount_pct,
            annual_commitment=request.annual_commitment,
            tier=calc_result.tier,
            subtotal=calc_result.subtotal,
            discount_amount=calc_result.discount_amount,
            total=calc_result.total,
            approval_required=calc_result.approval_required,
            approval_reasons=calc_result.approval_reasons,
            created_at=now_utc,
            updated_at=now_utc,
        )

        # 4. Save to persistent storage
        return self._repository.save(quote)

    def get_quote(self, quote_id: str) -> QuoteResponse:
        """Retrieves a quote by ID from persistent storage."""
        return self._repository.get_by_id(quote_id)

    def list_quotes(self) -> List[QuoteResponse]:
        """Lists all persisted quotes."""
        return self._repository.list_all()

    def change_status(self, quote_id: str, new_status: QuoteStatus) -> QuoteResponse:
        """
        Transitions the lifecycle status of a persisted quote.
        Enforces allowed state machine transitions:
          DRAFT -> SUBMITTED
          SUBMITTED -> APPROVED | REJECTED
        Raises InvalidQuoteStatusTransitionError on invalid transition attempts.
        """
        quote = self._repository.get_by_id(quote_id)

        allowed_next_states = ALLOWED_TRANSITIONS.get(quote.status, set())
        if new_status not in allowed_next_states:
            raise InvalidQuoteStatusTransitionError(
                current_status=quote.status.value,
                target_status=new_status.value,
            )

        quote.status = new_status
        quote.updated_at = datetime.now(timezone.utc).isoformat()

        return self._repository.update(quote)
