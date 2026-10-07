import { useState } from "react";
import { QuoteRequest } from "@/types";
import { askDraftQuoteCopilot, askSavedQuoteCopilot, ApiError } from "@/lib/api";

interface DealDeskCopilotProps {
  quoteId?: string;
  draftQuote?: QuoteRequest;
  canQuery?: boolean;
}

const QUICK_ACTIONS = [
  {
    id: "why_approval",
    label: "Why approval?",
    query: "Why does this quote require Deal Desk approval?",
  },
  {
    id: "explain_pricing",
    label: "Explain pricing",
    query: "Explain the pricing structure and discount calculations for this quote.",
  },
  {
    id: "what_can_i_change",
    label: "What can I change?",
    query: "What commercial parameters can I adjust to optimize this deal or avoid approval?",
  },
  {
    id: "summarize_deal",
    label: "Summarize deal",
    query: "Provide a concise executive summary of this quote for Deal Desk leadership.",
  },
];

const FALLBACK_ERROR_TEXT =
  "Copilot is temporarily unavailable. Your authoritative quote and approval information are still available above.";

/**
 * Enterprise Deal Desk Copilot Component.
 * Powered strictly by backend FastAPI Gemini integration; browser never accesses Gemini directly.
 * Operates purely as an explanation and advisory layer; never calculates pricing.
 */
export function DealDeskCopilot({
  quoteId,
  draftQuote,
  canQuery = true,
}: DealDeskCopilotProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const executeCopilotQuery = async (
    userMessage: string,
    actionId?: string
  ) => {
    const trimmed = userMessage.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setActiveAction(actionId || null);

    try {
      let response;
      if (quoteId) {
        response = await askSavedQuoteCopilot(quoteId, {
          message: trimmed,
          action: actionId,
        });
      } else if (draftQuote) {
        response = await askDraftQuoteCopilot({
          quote: draftQuote,
          message: trimmed,
          action: actionId,
        });
      } else {
        throw new Error("No quote context provided to Copilot.");
      }

      setAnswer(response.answer);
      setModelUsed(response.model);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError && err.detail
          ? err.detail
          : FALLBACK_ERROR_TEXT;
      setError(msg);
      setAnswer(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (actionId: string, queryText: string) => {
    executeCopilotQuery(queryText, actionId);
  };

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    executeCopilotQuery(question);
    setQuestion("");
  };

  return (
    <div className="card copilot-card" aria-label="Deal Desk Copilot">
      <div className="copilot-header">
        <div className="copilot-title-group">
          <span className="copilot-avatar" aria-hidden="true">
            🤖
          </span>
          <div>
            <h3 className="card-title" style={{ margin: 0, fontSize: "1rem" }}>
              Deal Desk Copilot
            </h3>
            <span className="copilot-subtitle">
              Intelligent Sales &amp; Approval Advisor
            </span>
          </div>
        </div>
        {modelUsed && (
          <span className="copilot-model-badge" title="AI Model Layer">
            {modelUsed}
          </span>
        )}
      </div>

      <div className="copilot-intro">
        <span>Ask about pricing rules, approval triggers, or commercial options:</span>
      </div>

      {/* Quick Action Buttons */}
      <div className="copilot-actions-grid" role="group" aria-label="Copilot Quick Actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`btn btn-secondary btn-sm copilot-action-btn ${
              activeAction === action.id && isLoading ? "is-active" : ""
            }`}
            disabled={isLoading || !canQuery}
            onClick={() => handleQuickAction(action.id, action.query)}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Free-Text Question Form */}
      <form onSubmit={handleSubmitQuestion} className="copilot-input-form">
        <input
          type="text"
          className="input-text copilot-input"
          placeholder="Ask a question about this deal..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={isLoading || !canQuery}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm copilot-submit-btn"
          disabled={isLoading || !canQuery || !question.trim()}
        >
          {isLoading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            "Ask"
          )}
        </button>
      </form>

      {/* Response Area */}
      <div className="copilot-output-container" aria-live="polite">
        {isLoading && (
          <div className="copilot-loading-state">
            <span className="spinner spinner-primary" aria-hidden="true" />
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Analyzing authoritative quote data...
            </span>
          </div>
        )}

        {!isLoading && error && (
          <div className="alert alert-danger copilot-error-box" role="alert">
            <span style={{ fontWeight: 600 }}>⚠ Copilot Notice:</span>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem" }}>{error}</p>
          </div>
        )}

        {!isLoading && answer && !error && (
          <div className="copilot-answer-box">
            <div className="copilot-answer-header">
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)" }}>
                COPILOT ADVISORY
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                FastAPI Authoritative Context
              </span>
            </div>
            <div className="copilot-answer-content">
              {answer.split("\n\n").map((para, idx) => (
                <p key={idx} style={{ marginBottom: "0.5rem" }}>
                  {para}
                </p>
              ))}
            </div>
          </div>
        )}

        {!isLoading && !answer && !error && (
          <div className="copilot-idle-state">
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Select a quick action above or enter a custom question to analyze this quote.
            </span>
          </div>
        )}
      </div>

      {/* Copilot Architectural Disclaimer */}
      <div className="copilot-footer-note">
        <span>
          Gemini provides contextual natural-language explanations. All pricing, discount boundaries, and approval decisions remain authoritative in FastAPI.
        </span>
      </div>
    </div>
  );
}
