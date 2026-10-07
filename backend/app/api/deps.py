from fastapi import Depends

from app.repositories.quotes import QuoteRepository
from app.services.catalog import CatalogService
from app.services.copilot import CopilotService
from app.services.gemini import GeminiService
from app.services.quote import QuoteService
from app.services.quote_calculation import QuoteCalculationService


def get_catalog_service() -> CatalogService:
    """Dependency provider for CatalogService."""
    return CatalogService()


def get_quote_calculation_service(
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> QuoteCalculationService:
    """
    Dependency provider for QuoteCalculationService.
    Preserves constructor dependency injection: CatalogService -> QuoteCalculationService.
    """
    return QuoteCalculationService(catalog_service=catalog_service)


def get_quote_repository() -> QuoteRepository:
    """Dependency provider for QuoteRepository."""
    return QuoteRepository()


def get_quote_service(
    calculation_service: QuoteCalculationService = Depends(get_quote_calculation_service),
    repository: QuoteRepository = Depends(get_quote_repository),
) -> QuoteService:
    """
    Dependency provider for QuoteService.
    Preserves constructor dependency injection: CalculationService + Repository -> QuoteService.
    """
    return QuoteService(
        calculation_service=calculation_service,
        repository=repository,
    )


def get_gemini_service() -> GeminiService:
    """Dependency provider for GeminiService."""
    return GeminiService()


def get_copilot_service(
    calculation_service: QuoteCalculationService = Depends(get_quote_calculation_service),
    quote_service: QuoteService = Depends(get_quote_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> CopilotService:
    """
    Dependency provider for CopilotService.
    Composes QuoteCalculationService, QuoteService, and GeminiService.
    """
    return CopilotService(
        calculation_service=calculation_service,
        quote_service=quote_service,
        gemini_service=gemini_service,
    )
