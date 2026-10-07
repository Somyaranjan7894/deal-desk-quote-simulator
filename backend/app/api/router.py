from fastapi import APIRouter

from app.api.routes import catalog, quotes
from app.schemas.health import HealthResponse

api_router = APIRouter()
api_router.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["Quotes"])


@api_router.get("/health", response_model=HealthResponse, tags=["Health"])
@api_router.get("/health/", response_model=HealthResponse, tags=["Health"], include_in_schema=False)
async def api_health() -> HealthResponse:
    """API router health endpoint mounted under /api/health."""
    return HealthResponse(status="ok")
