import json
from pathlib import Path
from typing import Optional
from pydantic import ValidationError

from app.core.config import settings
from app.core.exceptions import (
    CatalogError,
    CatalogNotFoundError,
    CatalogParseError,
)
from app.schemas.catalog import Catalog


class CatalogRepository:
    """Repository responsible for loading and validating the authoritative catalog source data."""

    def __init__(self, catalog_path: Optional[Path] = None) -> None:
        self._catalog_path = self._resolve_path(catalog_path)

    @classmethod
    def _resolve_path(cls, custom_path: Optional[Path]) -> Path:
        if custom_path is not None:
            return Path(custom_path).resolve()

        # Try configured CATALOG_PATH from settings if valid
        configured_path = Path(settings.CATALOG_PATH)
        if configured_path.is_file():
            return configured_path.resolve()

        # Derive path based on repository project root:
        # backend/app/repositories/catalog.py -> parents[3] is project root
        repo_root = Path(__file__).resolve().parents[3]
        candidate_root_path = repo_root / "data" / "catalog.json"
        if candidate_root_path.is_file():
            return candidate_root_path.resolve()

        # Fallback to configured path relative to repo root
        return (repo_root / settings.CATALOG_PATH).resolve()

    @property
    def catalog_path(self) -> Path:
        """Returns the resolved catalog file path."""
        return self._catalog_path

    def load_catalog(self) -> Catalog:
        """
        Reads, parses, and validates the catalog source file.
        Returns a typed Catalog object or raises a domain error.
        """
        if not self._catalog_path.is_file():
            raise CatalogNotFoundError(
                f"Authoritative catalog file not found at: {self._catalog_path}"
            )

        try:
            with open(self._catalog_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
        except json.JSONDecodeError as exc:
            raise CatalogParseError(
                f"Failed to parse catalog JSON from {self._catalog_path}: {exc}"
            ) from exc
        except OSError as exc:
            raise CatalogError(
                f"I/O error reading catalog from {self._catalog_path}: {exc}"
            ) from exc

        try:
            return Catalog.model_validate(raw_data)
        except ValidationError as exc:
            raise CatalogParseError(
                f"Catalog data failed schema validation: {exc}"
            ) from exc
