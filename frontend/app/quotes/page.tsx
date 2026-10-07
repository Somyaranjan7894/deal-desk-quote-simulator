"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QuoteResponse } from "@/types";
import { getQuotes, ApiError } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { StatusBadge } from "@/components/StatusBadge";

export default function SavedQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const loadQuotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuotes();
      setQuotes(data);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Unable to load saved quotes. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotes();
  }, []);

  const filteredQuotes = quotes.filter((q) => {
    const matchesSearch =
      q.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (q.id && q.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === "ALL" ||
      q.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deal Desk Quotes</h1>
          <p className="page-description">
            Manage, review, and track customer quotes throughout the approval lifecycle.
          </p>
        </div>
        <Link href="/" className="btn btn-primary">
          + Create New Quote
        </Link>
      </div>

      {/* Filter / Search Bar */}
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          padding: "1rem 1.25rem",
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            className="input-text"
            placeholder="Search by customer name or quote ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label
            htmlFor="status-filter-select"
            style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}
          >
            Status:
          </label>
          <select
            id="status-filter-select"
            className="select-input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div
            className="spinner spinner-primary"
            style={{ width: 28, height: 28, margin: "0 auto 1rem" }}
          />
          <h2>Loading Saved Quotes...</h2>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⚠️</div>
          <h2>Unable to Load Quotes</h2>
          <p style={{ color: "var(--danger)", margin: "0.5rem 0 1.5rem" }}>{error}</p>
          <button type="button" className="btn btn-primary" onClick={loadQuotes}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && quotes.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📄</div>
          <h2 style={{ marginBottom: "0.5rem" }}>No quotes have been created yet</h2>
          <p>
            Start by configuring your first customer quote in the Quote Builder.
          </p>
          <Link href="/" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            + Create Your First Quote
          </Link>
        </div>
      )}

      {/* Filtered Empty State */}
      {!loading && !error && quotes.length > 0 && filteredQuotes.length === 0 && (
        <div className="empty-state">
          <p>No quotes matched your search criteria.</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("ALL");
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && filteredQuotes.length > 0 && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Seats</th>
                <th>Tier</th>
                <th>Products</th>
                <th className="text-right">Total</th>
                <th>Approval</th>
                <th>Created</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((quote) => {
                const totalProducts = quote.line_items.reduce(
                  (acc, item) => acc + item.quantity,
                  0
                );

                return (
                  <tr key={quote.id}>
                    <td>
                      <strong>{quote.customer_name}</strong>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {quote.id ? quote.id.slice(0, 8) + "..." : "—"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={quote.status} />
                    </td>
                    <td>{quote.seats}</td>
                    <td>
                      <span className="badge badge-tier">
                        {quote.tier || "—"}
                      </span>
                    </td>
                    <td>
                      {quote.line_items.length} line{quote.line_items.length > 1 ? "s" : ""}{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        ({totalProducts} units)
                      </span>
                    </td>
                    <td className="text-right">
                      <strong style={{ fontSize: "1rem", color: "var(--primary)" }}>
                        {formatCurrency(quote.total)}
                      </strong>
                    </td>
                    <td>
                      {quote.approval_required ? (
                        <span
                          style={{
                            color: "var(--warning)",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          ⚠️ Approval Required
                        </span>
                      ) : (
                        <span
                          style={{
                            color: "var(--success)",
                            fontWeight: 600,
                            fontSize: "0.78rem",
                          }}
                        >
                          ✓ No Approval Required
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {formatDateTime(quote.created_at)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        View Quote
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
