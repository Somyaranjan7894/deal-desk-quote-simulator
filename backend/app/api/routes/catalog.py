from fastapi import APIRouter, Depends

from app.api.deps import get_catalog_service
from app.schemas.catalog import Catalog
from app.services.catalog import CatalogService

router = APIRouter()


@router.get(
    "",
    response_model=Catalog,
    summary="Get authoritative product catalog",
    description="Returns the products and seat-based discount rules from the authoritative catalog source.",
)
def get_catalog(
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> Catalog:
    """Returns the complete typed catalog loaded through CatalogService."""
    return catalog_service.get_catalog()
