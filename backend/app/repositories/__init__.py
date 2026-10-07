"""Data access and repository layer."""

from app.repositories.catalog import CatalogRepository
from app.repositories.quotes import QuoteRepository

__all__ = ["CatalogRepository", "QuoteRepository"]
