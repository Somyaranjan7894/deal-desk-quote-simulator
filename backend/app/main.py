from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    DiscountExceedsTierMaximumError,
    DiscountTierNotFoundError,
    InvalidQuoteStatusTransitionError,
    ProductNotFoundError,
    QuoteCalculationError,
    QuoteNotFoundError,
    QuotePersistenceError,
    QuoteStorageCorruptedError,
)
from app.schemas.health import HealthResponse

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Backend API for Deal Desk Quote Simulator",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Enable CORS for frontend client communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Domain Exception to HTTP Exception Handlers
# ---------------------------------------------------------------------------

@app.exception_handler(ProductNotFoundError)
async def handle_product_not_found(_: Request, exc: ProductNotFoundError) -> JSONResponse:
    """Maps domain ProductNotFoundError to HTTP 404."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": str(exc)},
    )


@app.exception_handler(QuoteNotFoundError)
async def handle_quote_not_found(_: Request, exc: QuoteNotFoundError) -> JSONResponse:
    """Maps domain QuoteNotFoundError to HTTP 404."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": str(exc)},
    )


@app.exception_handler(InvalidQuoteStatusTransitionError)
async def handle_invalid_status_transition(_: Request, exc: InvalidQuoteStatusTransitionError) -> JSONResponse:
    """Maps domain InvalidQuoteStatusTransitionError to HTTP 400."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(DiscountExceedsTierMaximumError)
async def handle_discount_exceeds_tier(_: Request, exc: DiscountExceedsTierMaximumError) -> JSONResponse:
    """Maps domain DiscountExceedsTierMaximumError to HTTP 400."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(DiscountTierNotFoundError)
async def handle_discount_tier_not_found(_: Request, exc: DiscountTierNotFoundError) -> JSONResponse:
    """Maps domain DiscountTierNotFoundError to HTTP 400."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(QuoteCalculationError)
async def handle_quote_calculation_error(_: Request, exc: QuoteCalculationError) -> JSONResponse:
    """Maps domain QuoteCalculationError to HTTP 400."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(QuoteStorageCorruptedError)
async def handle_storage_corrupted(_: Request, exc: QuoteStorageCorruptedError) -> JSONResponse:
    """Maps QuoteStorageCorruptedError to HTTP 500 without leaking file paths."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Quote persistence storage is corrupted or unreadable."},
    )


@app.exception_handler(QuotePersistenceError)
async def handle_persistence_error(_: Request, exc: QuotePersistenceError) -> JSONResponse:
    """Maps QuotePersistenceError to HTTP 500 without leaking file paths."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal persistence storage failure occurred."},
    )


@app.exception_handler(CatalogError)
async def handle_catalog_error(_: Request, exc: CatalogError) -> JSONResponse:
    """Maps domain CatalogError to HTTP 400."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Endpoints Registration
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """
    Development and orchestration health check endpoint.
    Returns status: ok when the backend is responsive.
    """
    return HealthResponse(status="ok")


# Mount API routers under /api
app.include_router(api_router, prefix="/api")
