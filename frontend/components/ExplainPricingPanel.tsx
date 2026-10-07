"use client";

import { useState } from "react";
import { QuoteLineItemResponse } from "@/types";
import { formatCurrency, formatPercentage } from "@/lib/formatters";

export interface ExplainPricingPanelProps {
  lineItems: QuoteLineItemResponse[];
  subtotal: string | number;
  discountPct: string | number;
  discountAmount: string | number;
  total: string | number;
  tier?: string | null;
  maxDiscountPct?: string | number | null;
  approvalRequired?: boolean | null;
  approvalReasons?: string[] | null;
}

/**
 * Deterministic "How was this calculated?" explanation panel.
 * Displays authoritative calculation breakdown from backend calculation response.
 */
export function ExplainPricingPanel({
  lineItems,
  subtotal,
  discountPct,
  discountAmount,
  total,
  tier,
  maxDiscountPct,
  approvalRequired,
  approvalReasons,
}: ExplainPricingPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="explain-pricing-container">
      <button
        type="button"
        className="explain-pricing-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="pricing-explanation-panel"
      >
        <span className="explain-toggle-icon" aria-hidden="true">
          {isOpen ? "▾" : "▸"}
        </span>
        <span className="explain-toggle-text">How was this calculated?</span>
      </button>

      {isOpen && (
        <div
          id="pricing-explanation-panel"
          className="explain-pricing-content"
          role="region"
          aria-label="Pricing Explanation Breakdown"
        >
          {/* Section 1: Line Items Breakdown */}
          <div className="explain-section">
            <div className="explain-section-title">Product Line Items</div>
            {lineItems.length === 0 ? (
              <div className="explain-muted-text">No products added.</div>
            ) : (
              <div className="explain-line-items-list">
                {lineItems.map((item, idx) => {
                  const displayName =
                    item.name || item.product_name || item.sku;
                  return (
                    <div key={`${item.sku}-${idx}`} className="explain-item-row">
                      <div className="explain-item-name">{displayName}</div>
                      <div className="explain-item-calc">
                        {item.quantity} × {formatCurrency(item.unit_price ?? "0")} ={" "}
                        <strong>{formatCurrency(item.line_total ?? "0")}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Financial Calculation Breakdown */}
          <div className="explain-divider" />
          <div className="explain-section">
            <div className="explain-section-title">Pricing Breakdown</div>
            <div className="explain-calc-table">
              <div className="explain-calc-row">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="explain-calc-row explain-discount-row">
                <span>Discount ({formatPercentage(discountPct)})</span>
                <span>–{formatCurrency(discountAmount)}</span>
              </div>
              <div className="explain-calc-row explain-total-row">
                <span>Final Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Governance, Tier & Approval Details */}
          <div className="explain-divider" />
          <div className="explain-section">
            <div className="explain-section-title">Tier &amp; Policy Authority</div>
            <div className="explain-meta-grid">
              <div>
                <span className="explain-meta-label">Applicable Tier</span>
                <span className="explain-meta-value">{tier || "—"}</span>
              </div>
              <div>
                <span className="explain-meta-label">Max Discount for Tier</span>
                <span className="explain-meta-value">
                  {maxDiscountPct !== undefined && maxDiscountPct !== null
                    ? formatPercentage(maxDiscountPct)
                    : "—"}
                </span>
              </div>
              <div>
                <span className="explain-meta-label">Approval Status</span>
                <span className="explain-meta-value">
                  {approvalRequired
                    ? "Approval Required"
                    : "No approval required"}
                </span>
              </div>
            </div>

            {/* Approval Reasons if triggered */}
            {approvalRequired && approvalReasons && approvalReasons.length > 0 && (
              <div className="explain-reasons-block">
                <span className="explain-meta-label">Approval Reasons:</span>
                <ul className="explain-reasons-list">
                  {approvalReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
