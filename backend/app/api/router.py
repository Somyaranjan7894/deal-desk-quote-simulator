from fastapi import APIRouter

from app.api.routes import catalog, quotes

api_router = APIRouter()
api_router.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["Quotes"])
