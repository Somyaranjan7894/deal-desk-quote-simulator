import { useEffect, useState, useRef } from "react";
import { QuoteCalculationResult, QuoteLineItem } from "@/types";
import { calculateQuote, ApiError } from "@/lib/api";
import { formatCurrency, formatPercentage } from "@/lib/formatters";

interface WhatIfSimulatorProps {
  customerName: string;
  baseSeats: number;
  baseDiscountPct: number;
  baseAnnualCommitment: boolean;
  lineItems: QuoteLineItem[];
  onApplyScenario?: (scenario: {
    seats: number;
    discount_pct: number;
    annual_commitment: boolean;
  }) => void;
}

/**
 * What-If Quote Simulator.
 * Allows sales representatives and Deal Desk analysts to model pricing scenarios in real time.
 * Strictly uses POST /api/quotes/calculate directly; NEVER calls Gemini or persists scenarios.
 */
export function WhatIfSimulator({
  customerName,
  baseSeats,
  baseDiscountPct,
  baseAnnualCommitment,
  lineItems,
  onApplyScenario,
}: WhatIfSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Scenario inputs initialized from base quote values
  const [scenarioSeats, setScenarioSeats] = useState<number>(baseSeats || 10);
  const [scenarioDiscountPct, setScenarioDiscountPct] = useState<number>(
    baseDiscountPct || 0
  );
  const [scenarioAnnualCommitment, setScenarioAnnualCommitment] =
    useState<boolean>(baseAnnualCommitment || false);

  // Scenario calculation results
  const [result, setResult] = useState<QuoteCalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync scenario inputs if base quote changes when simulator is closed
  useEffect(() => {
    if (!isOpen) {
      setScenarioSeats(baseSeats || 10);
      setScenarioDiscountPct(baseDiscountPct || 0);
      setScenarioAnnualCommitment(baseAnnualCommitment || false);
    }
  }, [baseSeats, baseDiscountPct, baseAnnualCommitment, isOpen]);

  // Recalculate scenario when scenario inputs change and simulator is open
  useEffect(() => {
    if (!isOpen) return;
    if (!lineItems || lineItems.length === 0) {
      setResult(null);
      setError("Add at least one product to run scenario simulations.");
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCalculating(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const calc = await calculateQuote(
          {
            customer_name: customerName || "Scenario Prospect",
            seats: Math.max(1, scenarioSeats),
            line_items: lineItems.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
            })),
            discount_pct: Math.max(0, scenarioDiscountPct),
            annual_commitment: scenarioAnnualCommitment,
          },
          controller.signal
        );
        setResult(calc);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Unable to calculate scenario. Verify your scenario parameters.";
        setError(msg);
      } finally {
        setIsCalculating(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    isOpen,
    customerName,
    scenarioSeats,
    scenarioDiscountPct,
    scenarioAnnualCommitment,
    lineItems,
  ]);

  const handleResetToCurrentQuote = () => {
    setScenarioSeats(baseSeats || 10);
    setScenarioDiscountPct(baseDiscountPct || 0);
    setScenarioAnnualCommitment(baseAnnualCommitment || false);
    setError(null);
  };

  const handleApplyToQuote = () => {
    if (onApplyScenario) {
      onApplyScenario({
        seats: scenarioSeats,
        discount_pct: scenarioDiscountPct,
        annual_commitment: scenarioAnnualCommitment,
      });
      setIsOpen(false);
    }
  };

  return (
    <div className="card what-if-card" aria-label="What-If Quote Simulator">
      <div className="what-if-header">
        <div className="what-if-title-group">
          <span className="what-if-icon" aria-hidden="true">
            ↻
          </span>
          <div>
            <h3 className="card-title" style={{ margin: 0, fontSize: "0.98rem" }}>
              What-If Quote Simulator
            </h3>
            {!isOpen && (
              <span className="what-if-subtitle">
                Model alternative pricing scenarios without changing the quote.
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm what-if-toggle-btn"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {isOpen ? "Close" : "Simulate Changes"}
        </button>
      </div>

      {isOpen && (
        <div className="what-if-body">
          {/* Prominent Scenario Preview Badge */}
          <div className="scenario-badge-banner">
            <span className="scenario-preview-tag">SCENARIO PREVIEW</span>
            <span className="scenario-unsaved-tag">NOT SAVED</span>
          </div>

          {/* Simulation Controls in clean compact 2-column grid */}
          <div className="what-if-controls-grid">
            {/* Seats Input */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="what-if-seats" className="form-label compact-label">
                <span>Seats</span>
                <span className="form-label-hint">Cur: {baseSeats}</span>
              </label>
              <input
                id="what-if-seats"
                type="number"
                min={1}
                max={500}
                className="input-text input-compact"
                value={scenarioSeats}
                onChange={(e) =>
                  setScenarioSeats(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>

            {/* Discount Input */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="what-if-discount" className="form-label compact-label">
                <span>Discount (%)</span>
                <span className="form-label-hint">Cur: {formatPercentage(baseDiscountPct)}</span>
              </label>
              <input
                id="what-if-discount"
                type="number"
                min={0}
                max={50}
                step={0.5}
                className="input-text input-compact"
                value={scenarioDiscountPct}
                onChange={(e) =>
                  setScenarioDiscountPct(
                    Math.max(0, parseFloat(e.target.value) || 0)
                  )
                }
              />
            </div>

            {/* Annual Commitment Toggle */}
            <div className="what-if-checkbox-row">
              <label className="form-checkbox-label" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={scenarioAnnualCommitment}
                  onChange={(e) => setScenarioAnnualCommitment(e.target.checked)}
                />
                <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Annual Commitment (12-Month)
                </span>
              </label>
            </div>
          </div>

          {/* Scenario Calculation Preview Box */}
          <div className="scenario-preview-box">
            <div className="scenario-preview-header">
              <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Simulated Outcome
              </span>
              {isCalculating ? (
                <span className="spinner spinner-primary" aria-label="Calculating scenario" />
              ) : (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Tier: <strong>{result?.tier || "—"}</strong>
                </span>
              )}
            </div>

            {error ? (
              <div
                className="alert alert-danger"
                style={{ fontSize: "0.8rem", margin: "0.35rem 0", padding: "6px 10px" }}
              >
                {error}
              </div>
            ) : result ? (
              <div className="scenario-financials-grid">
                <div className="scenario-stat">
                  <span className="scenario-stat-label">Subtotal</span>
                  <span className="scenario-stat-value">
                    {formatCurrency(result.subtotal)}
                  </span>
                </div>

                <div className="scenario-stat">
                  <span className="scenario-stat-label">
                    Discount ({formatPercentage(result.discount_pct || scenarioDiscountPct)})
                  </span>
                  <span className="scenario-stat-value discount-color">
                    –{formatCurrency(result.discount_amount)}
                  </span>
                </div>

                <div className="scenario-stat">
                  <span className="scenario-stat-label">Simulated Total</span>
                  <span className="scenario-stat-value font-bold" style={{ color: "var(--primary)" }}>
                    {formatCurrency(result.total)}
                  </span>
                </div>

                <div className="scenario-stat">
                  <span className="scenario-stat-label">Approval</span>
                  <span
                    className={`scenario-approval-tag ${
                      result.approval_required ? "tag-warning" : "tag-success"
                    }`}
                  >
                    {result.approval_required ? "⚠ Required" : "✓ Standard"}
                  </span>
                </div>

                {result.approval_required && result.approval_reasons.length > 0 && (
                  <div className="scenario-reasons-box">
                    <strong style={{ fontSize: "0.72rem", color: "var(--warning-text)" }}>
                      Approval Triggers:
                    </strong>
                    <ul style={{ margin: "0.2rem 0 0 1rem", fontSize: "0.74rem" }}>
                      {result.approval_reasons.map((reason, idx) => (
                        <li key={idx} style={{ color: "var(--warning-text)" }}>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Simulator Actions */}
          <div className="what-if-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetToCurrentQuote}
            >
              Reset
            </button>
            {onApplyScenario && result && !error && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleApplyToQuote}
              >
                Apply to Form
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
