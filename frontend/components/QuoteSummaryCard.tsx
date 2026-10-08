import { QuoteCalculationResult } from "@/types";
import { formatCurrency, formatPercentage } from "@/lib/formatters";
import { ApprovalBanner } from "./ApprovalBanner";
import { ExplainPricingPanel } from "./ExplainPricingPanel";

interface QuoteSummaryCardProps {
  calculation: QuoteCalculationResult | null;
  isCalculating: boolean;
  isSaving: boolean;
  canSave: boolean;
  quoteStatus?: "idle" | "loading" | "valid" | "invalid" | "error";
  tierMaxDiscountPct?: number | string | null;
  validationError?: string | null;
  validationMessage?: string | null;
  onSaveDraft: () => void;
  onReset?: () => void;
}

export function QuoteSummaryCard({
  calculation,
  isCalculating,
  isSaving,
  canSave,
  quoteStatus,
  tierMaxDiscountPct,
  validationError,
  validationMessage,
  onSaveDraft,
  onReset,
}: QuoteSummaryCardProps) {
  const isInvalid = Boolean(validationError) || quoteStatus === "invalid";

  return (
    <div className="card quote-summary-card" aria-label="Quote Summary">
      <div className="card-title">
        <span>Quote Summary</span>
        <div className="calculation-status">
          {isCalculating && (
            <>
              <span className="spinner spinner-primary" aria-hidden="true" />
              <span>Updating quote...</span>
            </>
          )}
          {!isCalculating && isInvalid && (
            <span style={{ color: "var(--danger)", fontWeight: 600 }}>✕ Requires correction</span>
          )}
          {!isCalculating && !isInvalid && calculation && (
            <span style={{ color: "var(--success)" }}>✓ Up to date</span>
          )}
        </div>
      </div>

      {/* Approval Banner */}
      <ApprovalBanner
        status={isInvalid ? "invalid" : quoteStatus || (isCalculating ? "loading" : calculation ? "valid" : "idle")}
        approvalRequired={calculation?.approval_required}
        approvalReasons={calculation?.approval_reasons}
        errorMessage={validationError}
      />

      {/* Financial Breakdown */}
      <div className="summary-breakdown">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{calculation ? formatCurrency(calculation.subtotal ?? "0") : "—"}</span>
        </div>

        <div className="summary-row discount">
          <span>
            Discount (
            {calculation ? formatPercentage(calculation.discount_pct ?? 0) : "—"})
          </span>
          <span>
            {calculation ? `–${formatCurrency(calculation.discount_amount ?? "0")}` : "—"}
          </span>
        </div>

        <div className="summary-row total">
          <span>Final Total</span>
          <span className="summary-total-value">
            {calculation ? formatCurrency(calculation.total ?? "0") : "—"}
          </span>
        </div>
      </div>

      {/* Deterministic "How was this calculated?" explanation */}
      {calculation && (
        <ExplainPricingPanel
          lineItems={calculation.line_items || []}
          subtotal={calculation.subtotal}
          discountPct={calculation.discount_pct ?? 0}
          discountAmount={calculation.discount_amount}
          total={calculation.total}
          tier={calculation.tier}
          maxDiscountPct={tierMaxDiscountPct}
          approvalRequired={calculation.approval_required}
          approvalReasons={calculation.approval_reasons}
        />
      )}

      {/* Inline validation error hint if any from calculation */}
      {validationError && (
        <div className="alert alert-danger" style={{ fontSize: "0.82rem", padding: "0.6rem 0.85rem" }}>
          {validationError}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onSaveDraft}
          disabled={!canSave || isSaving || isCalculating}
        >
          {isSaving ? (
            <>
              <span className="spinner" aria-hidden="true" />
              <span>Saving draft...</span>
            </>
          ) : (
            <span>Save Draft</span>
          )}
        </button>

        {/* Validation guidance when Save Draft is disabled */}
        {!canSave && (
          <div
            className="save-draft-hint"
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" style={{ color: "var(--warning)", fontWeight: 700 }}>
              ℹ
            </span>
            <span>
              {validationMessage ||
                "Complete the required fields and add at least one product to save."}
            </span>
          </div>
        )}

        {onReset && (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={onReset}
            disabled={isSaving}
          >
            Reset Form
          </button>
        )}
      </div>
    </div>
  );
}
