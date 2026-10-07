from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.quote import QuoteRequest


class CopilotMessageRequest(BaseModel):
    """Request payload for Copilot inquiries on persisted quotes."""
    message: str = Field(
        ...,
        min_length=1,
        description="User question or predefined action request for Deal Desk Copilot",
    )
    action: Optional[str] = Field(
        default=None,
        description="Optional action identifier: 'why_approval', 'explain_pricing', 'what_can_i_change', 'summarize_deal'",
    )

    model_config = ConfigDict(extra="forbid")


class UnsavedQuoteCopilotRequest(BaseModel):
    """
    Request payload for Copilot inquiries on unpersisted draft quotes.
    Requires raw quote inputs which the backend calculates authoritatively before passing to Gemini.
    """
    quote: QuoteRequest = Field(
        ...,
        description="Unpersisted quote inputs to calculate authoritatively before prompting Copilot",
    )
    message: str = Field(
        ...,
        min_length=1,
        description="User question or predefined action request for Deal Desk Copilot",
    )
    action: Optional[str] = Field(
        default=None,
        description="Optional action identifier: 'why_approval', 'explain_pricing', 'what_can_i_change', 'summarize_deal'",
    )

    model_config = ConfigDict(extra="forbid")


class CopilotResponse(BaseModel):
    """Authoritative response returned by Deal Desk Copilot service."""
    answer: str = Field(
        ...,
        description="Natural-language explanation from Deal Desk Copilot",
    )
    quote_id: Optional[str] = Field(
        default=None,
        description="Associated quote ID if persisted",
    )
    model: str = Field(
        ...,
        description="Gemini model utilized",
    )
    generated: bool = Field(
        default=True,
        description="Whether the response was generated via LLM (False on fallback)",
    )

    model_config = ConfigDict(extra="forbid")
