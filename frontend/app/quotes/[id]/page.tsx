"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { QuoteResponse, QuoteStatus } from "@/types";
import { getQuote, updateQuoteStatus, ApiError } from "@/lib/api";
import { formatCurrency, formatDateTime, formatPercentage } from "@/lib/formatters";
import { StatusBadge } from "@/components/StatusBadge";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { ExplainPricingPanel } from "@/components/ExplainPricingPanel";
import { DealHealth } from "@/components/DealHealth";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { DealDeskCopilot } from "@/components/DealDeskCopilot";

export default function QuoteReviewPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<string | null>(
    null
  );

  const loadQuote = async () => {
    if (!quoteId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getQuote(quoteId);
      setQuote(data);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Unable to load quote details. The quote may not exist or the service is temporarily unavailable.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuote();
  }, [quoteId]);

  const handleStatusTransition = async (nextStatus: QuoteStatus) => {
    if (!quoteId) return;

    setIsUpdatingStatus(true);
    setStatusActionError(null);
    setStatusSuccessMessage(null);

    try {
      const updated = await updateQuoteStatus(quoteId, nextStatus);
      setQuote(updated);
      setStatusSuccessMessage(
        `Quote successfully transitioned to ${nextStatus.toUpperCase()}.`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Unable to update quote status. Please try again.";
      setStatusActionError(msg);
      // Refresh to ensure client is displaying current backend status
      loadQuote();
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading & Error States
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div
          className="spinner spinner-primary"
          style={{ width: 28, height: 28, margin: "0 auto 1rem" }}
        />
        <h2>Loading Quote Details...</h2>
        <p style={{ marginTop: "0.5rem" }}>Retrieving authoritative quote records from Deal Desk storage.</p>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🔍</div>
        <h2>Quote Not Found</h2>
        <p style={{ color: "var(--danger)", margin: "0.5rem 0 1.5rem" }}>
          {error || "The requested quote does not exist."}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={loadQuote}>
            Retry
          </button>
          <Link href="/quotes" className="btn btn-secondary">
            View All Quotes
          </Link>
        </div>
      </div>
    );
  }

  const normalizedStatus = quote.status.toLowerCase();

  return (
    <div>
      {/* Top Breadcrumb & Actions */}
      <div className="page-header">
        <div>
          <div style={{ marginBottom: "0.5rem" }}>
            <Link
              href="/quotes"
              style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
            >
              ← Back to Saved Quotes
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {quote.customer_name}
            </h1>
            <StatusBadge status={quote.status} />
            <span className="badge badge-tier">{quote.tier || "TIER"}</span>
          </div>
          <p className="page-description" style={{ marginTop: "0.35rem" }}>
            Quote ID: <span style={{ fontFamily: "monospace" }}>{quote.id}</span>
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href="/" className="btn btn-secondary btn-sm">
            + New Quote
          </Link>
        </div>
      </div>

      {/* Success / Error Messages */}
      {statusSuccessMessage && (
        <div className="alert alert-success">
          <span>✓ {statusSuccessMessage}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setStatusSuccessMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {statusActionError && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️ {statusActionError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setStatusActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Prominent Deal Desk Approval Banner */}
      <ApprovalBanner
        approvalRequired={quote.approval_required}
        approvalReasons={quote.approval_reasons}
      />

      <div className="quote-layout builder-grid">
        {/* Left Column: Commercial Details & Line Items */}
        <section className="form-section main-quote-builder" aria-label="Commercial Details & Line Items">
          {/* Metadata Grid */}
          <div className="card">
            <h2 className="card-title">Commercial Agreement</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1.25rem",
              }}
            >
              <div>
                <strong style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Seats
                </strong>
                <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {quote.seats} Seats
                </span>
              </div>

              <div>
                <strong style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Pricing Tier
                </strong>
                <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {quote.tier || "—"}
                </span>
              </div>

              <div>
                <strong style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Contract Term
                </strong>
                <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {quote.annual_commitment ? "Annual Commitment (12 mo)" : "Month-to-Month"}
                </span>
              </div>

              <div>
                <strong style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Discount Applied
                </strong>
                <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {formatPercentage(quote.discount_pct)}
                </span>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="card">
            <h2 className="card-title">Products &amp; Quantities</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="text-center">Quantity</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.line_items.map((item, index) => (
                    <tr key={`${item.sku}-${index}`}>
                      <td>
                        <strong>{item.name || item.product_name || item.sku}</strong>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {item.sku}
                      </td>
                      <td className="text-center font-bold">{item.quantity}</td>
                      <td className="text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right">
                        <strong>{formatCurrency(item.line_total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right Column: Financial Summary & State Machine Actions */}
        <aside className="deal-intelligence" aria-label="Deal Intelligence & Workflow">
          {/* Financial Summary Card */}
          <div className="card quote-summary-card">
            <h2 className="card-title">Financial Summary</h2>

            <div className="summary-breakdown" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>

              <div className="summary-row discount">
                <span>Discount ({formatPercentage(quote.discount_pct)})</span>
                <span>–{formatCurrency(quote.discount_amount)}</span>
              </div>

              <div className="summary-row total">
                <span>Final Total</span>
                <span className="summary-total-value">
                  {formatCurrency(quote.total)}
                </span>
              </div>
            </div>

            {/* Deterministic "How was this calculated?" explanation */}
            <ExplainPricingPanel
              lineItems={quote.line_items || []}
              subtotal={quote.subtotal ?? "0"}
              discountPct={quote.discount_pct ?? 0}
              discountAmount={quote.discount_amount ?? "0"}
              total={quote.total ?? "0"}
              tier={quote.tier}
              approvalRequired={quote.approval_required}
              approvalReasons={quote.approval_reasons}
            />

            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "1rem",
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <div>Created: {formatDateTime(quote.created_at)}</div>
              <div>Last Updated: {formatDateTime(quote.updated_at)}</div>
            </div>
          </div>

          {/* Workflow Action Panel (Strictly Enforces Authoritative State Machine) */}
          <div className="card">
            <h2 className="card-title">Deal Desk Workflow</h2>

            {/* DRAFT -> SUBMITTED */}
            {normalizedStatus === "draft" && (
              <div>
                <p style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
                  This quote is currently in <strong>DRAFT</strong> status. Submit it to Deal Desk to request review and approval.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={isUpdatingStatus}
                  onClick={() => handleStatusTransition("submitted")}
                >
                  {isUpdatingStatus ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit for Approval</span>
                  )}
                </button>
              </div>
            )}

            {/* SUBMITTED -> APPROVED / REJECTED */}
            {normalizedStatus === "submitted" && (
              <div>
                <p style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
                  This quote is awaiting Deal Desk review. You may approve or reject this proposal:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="btn btn-success btn-block"
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusTransition("approved")}
                  >
                    {isUpdatingStatus ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>✓ Approve Quote</span>
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    disabled={isUpdatingStatus}
                    onClick={() => handleStatusTransition("rejected")}
                  >
                    {isUpdatingStatus ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>✕ Reject Quote</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* APPROVED (Terminal) */}
            {normalizedStatus === "approved" && (
              <div
                style={{
                  background: "var(--success-bg)",
                  border: "1px solid var(--success-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1rem",
                  color: "var(--success-text)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>✓</div>
                <strong>Quote Approved</strong>
                <p style={{ fontSize: "0.82rem", margin: "0.5rem 0 0", color: "var(--success-text)" }}>
                  This deal has been officially approved by Deal Desk. This is a terminal state; no further status modifications are permitted.
                </p>
              </div>
            )}

            {/* REJECTED (Terminal) */}
            {normalizedStatus === "rejected" && (
              <div
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1rem",
                  color: "var(--danger-text)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>✕</div>
                <strong>Quote Rejected</strong>
                <p style={{ fontSize: "0.82rem", margin: "0.5rem 0 0", color: "var(--danger-text)" }}>
                  This deal was rejected by Deal Desk. This is a terminal state; no further status modifications are permitted.
                </p>
              </div>
            )}
          </div>

          {/* Deterministic Deal Health Metrics */}
          <DealHealth
            discountPct={quote.discount_pct}
            approvalRequired={quote.approval_required}
            approvalReasons={quote.approval_reasons}
            annualCommitment={quote.annual_commitment}
            hasProducts={quote.line_items.length > 0}
          />

          {/* Interactive What-If Quote Simulator (Strictly Uses /calculate, Never Persists) */}
          <WhatIfSimulator
            customerName={quote.customer_name}
            baseSeats={quote.seats}
            baseDiscountPct={
              typeof quote.discount_pct === "number"
                ? quote.discount_pct
                : parseFloat(String(quote.discount_pct)) || 0
            }
            baseAnnualCommitment={quote.annual_commitment}
            lineItems={quote.line_items.map((i) => ({
              sku: i.sku,
              quantity: i.quantity,
            }))}
          />

          {/* Deal Desk Copilot (Gemini-Powered Natural Language Explanation Layer) */}
          <DealDeskCopilot quoteId={quote.id} />
        </aside>
      </div>
    </div>
  );
}
