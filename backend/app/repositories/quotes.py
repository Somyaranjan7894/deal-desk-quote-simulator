import json
from pathlib import Path
from typing import List, Optional
from pydantic import ValidationError

from app.core.exceptions import (
    QuoteNotFoundError,
    QuotePersistenceError,
    QuoteStorageCorruptedError,
)
from app.schemas.quote import QuoteResponse


class QuoteRepository:
    """
    Repository for persisting and retrieving quotes in JSON storage.
    Uses atomic writes to prevent file corruption and robust path resolution.
    """

    def __init__(self, storage_path: Optional[Path] = None) -> None:
        self._storage_path = self._resolve_path(storage_path)

    @classmethod
    def _resolve_path(cls, custom_path: Optional[Path]) -> Path:
        if custom_path is not None:
            return Path(custom_path).resolve()

        # Anchored relative to project root:
        # backend/app/repositories/quotes.py -> parents[3] is project root
        repo_root = Path(__file__).resolve().parents[3]
        return (repo_root / "backend" / "data" / "quotes.json").resolve()

    @property
    def storage_path(self) -> Path:
        """Returns the resolved storage path."""
        return self._storage_path

    def _ensure_storage_exists(self) -> None:
        """Ensures the storage directory and quotes.json file exist with a valid empty list."""
        if not self._storage_path.exists():
            try:
                self._storage_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self._storage_path, "w", encoding="utf-8") as f:
                    f.write("[]")
            except OSError as exc:
                raise QuotePersistenceError(
                    f"Failed to initialize quote storage at {self._storage_path}: {exc}"
                ) from exc

    def _read_all(self) -> List[QuoteResponse]:
        """Reads and validates all quotes from the storage file."""
        self._ensure_storage_exists()

        try:
            with open(self._storage_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
        except json.JSONDecodeError as exc:
            raise QuoteStorageCorruptedError(
                f"Quote storage file at {self._storage_path} contains malformed JSON: {exc}"
            ) from exc
        except OSError as exc:
            raise QuotePersistenceError(
                f"Failed to read quote storage file at {self._storage_path}: {exc}"
            ) from exc

        if not isinstance(raw_data, list):
            raise QuoteStorageCorruptedError(
                f"Quote storage root at {self._storage_path} must be a JSON array, got {type(raw_data).__name__}"
            )

        try:
            return [QuoteResponse.model_validate(item) for item in raw_data]
        except ValidationError as exc:
            raise QuoteStorageCorruptedError(
                f"Quote storage file at {self._storage_path} contains invalid schema data: {exc}"
            ) from exc

    def _write_all(self, quotes: List[QuoteResponse]) -> None:
        """Atomically writes all quotes to the storage file."""
        self._ensure_storage_exists()

        # Serialize quotes preserving exact Decimal string representation
        data = [q.model_dump(mode="json") for q in quotes]
        serialized_json = json.dumps(data, indent=2, ensure_ascii=False)

        temp_path = self._storage_path.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(serialized_json)
            # Atomic file replacement
            temp_path.replace(self._storage_path)
        except OSError as exc:
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
            raise QuotePersistenceError(
                f"Failed to write quotes to {self._storage_path}: {exc}"
            ) from exc

    def save(self, quote: QuoteResponse) -> QuoteResponse:
        """Persists a new quote to storage."""
        quotes = self._read_all()
        quotes.append(quote)
        self._write_all(quotes)
        return quote

    def get_by_id(self, quote_id: str) -> QuoteResponse:
        """Retrieves a quote by ID. Raises QuoteNotFoundError if absent."""
        quotes = self._read_all()
        for q in quotes:
            if q.id == quote_id:
                return q
        raise QuoteNotFoundError(quote_id)

    def list_all(self) -> List[QuoteResponse]:
        """Returns all persisted quotes."""
        return self._read_all()

    def update(self, quote: QuoteResponse) -> QuoteResponse:
        """Updates an existing persisted quote. Raises QuoteNotFoundError if absent."""
        if quote.id is None:
            raise QuoteNotFoundError("None")

        quotes = self._read_all()
        found_index = -1
        for idx, q in enumerate(quotes):
            if q.id == quote.id:
                found_index = idx
                break

        if found_index == -1:
            raise QuoteNotFoundError(quote.id)

        quotes[found_index] = quote
        self._write_all(quotes)
        return quote
