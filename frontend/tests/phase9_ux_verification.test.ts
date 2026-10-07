import test from "node:test";
import assert from "node:assert/strict";
import { validateQuoteForm } from "../lib/validation.ts";
import { formatCurrency, formatPercentage } from "../lib/formatters.ts";
import type { Catalog, QuoteFormState, QuoteRequest } from "../types/index.ts";

const API_BASE = "http://127.0.0.1:8000";

let backendOnline: boolean | null = null;
async function isBackendOnline(): Promise<boolean> {
  if (backendOnline !== null) return backendOnline;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    backendOnline = res.ok;
  } catch {
    backendOnline = false;
  }
  return backendOnline;
}

test("TEST 1 — Empty Form Validation & Save Draft state", () => {
  const emptyForm: QuoteFormState = {
    customer_name: "",
    seats: "",
    line_items: [],
    discount_pct: 0,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(emptyForm);
  assert.equal(validation.isValid, false);
  assert.equal(validation.error, "Customer name is required.");
});

test("TEST 2 — Valid Quote: Acme Corporation, 10 seats, Agent Core (1 qty), 0% discount", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 10,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 0,
    annual_commitment: false,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.tier, "GROWTH");
  assert.equal(data.subtotal, "120.00");
  assert.equal(data.discount_amount, "0.00");
  assert.equal(data.total, "120.00");
  assert.equal(data.approval_required, false);
  assert.deepEqual(data.approval_reasons, []);
});

test("TEST 3 — Approval by Discount: Discount 15.01%", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 50, // ENTERPRISE tier allows up to 30% discount
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 15.01,
    annual_commitment: false,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.approval_required, true);
  assert.ok(data.approval_reasons.includes("Discount exceeds 15%"));
});

test("TEST 4 — Approval by Total: Total exceeds $25,000", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 50,
    line_items: [{ sku: "AGENT-CORE", quantity: 250 }], // 250 * $120 = $30,000
    discount_pct: 0,
    annual_commitment: false,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.subtotal, "30000.00");
  assert.equal(data.total, "30000.00");
  assert.equal(data.approval_required, true);
  assert.ok(data.approval_reasons.includes("Total exceeds $25,000"));
});

test("TEST 5 — Annual Commitment with Discount > 10%", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 20, // GROWTH allows up to 20%
    line_items: [{ sku: "AGENT-CORE", quantity: 5 }],
    discount_pct: 11,
    annual_commitment: true,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.approval_required, true);
  assert.ok(
    data.approval_reasons.includes(
      "Annual commitment with discount above 10%"
    )
  );
});

test("TEST 6 — Explain Pricing Data Completeness", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 10,
    line_items: [
      { sku: "AGENT-CORE", quantity: 3 },
      { sku: "AGENT-ANALYTICS", quantity: 2 },
    ],
    discount_pct: 10,
    annual_commitment: false,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  // Verify line item calculations:
  // 3 * 120 = 360
  // 2 * 80 = 160
  // Subtotal = 520
  // Discount = 52
  // Total = 468
  assert.equal(data.line_items.length, 2);
  assert.equal(data.subtotal, "520.00");
  assert.equal(data.discount_amount, "52.00");
  assert.equal(data.total, "468.00");
  assert.equal(data.tier, "GROWTH");
  assert.equal(data.approval_required, false);

  // Check formatter outputs
  assert.equal(formatCurrency(data.subtotal), "$520.00");
  assert.equal(formatCurrency(data.discount_amount), "$52.00");
  assert.equal(formatCurrency(data.total), "$468.00");
  assert.equal(formatPercentage(data.discount_pct), "10%");
});

test("TEST 7 — Product Section: Multiple Products & SKU Deduplication", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  const payload: QuoteRequest = {
    customer_name: "Acme Corporation",
    seats: 15,
    line_items: [
      { sku: "AGENT-CORE", quantity: 2 },
      { sku: "AGENT-CORE", quantity: 3 }, // Duplicate SKU, will merge to 5
    ],
    discount_pct: 0,
    annual_commitment: false,
  };

  const res = await fetch(`${API_BASE}/api/quotes/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.line_items.length, 1);
  assert.equal(data.line_items[0].quantity, 5);
  assert.equal(data.subtotal, "600.00");
});

test("TEST 8 & 9 — Saved Quote Workflow: DRAFT -> SUBMITTED -> APPROVED", async (t) => {
  if (!(await isBackendOnline())) {
    t.skip("Deal Desk backend is not running at " + API_BASE);
    return;
  }
  // Step 1: Create Quote
  const createPayload: QuoteRequest = {
    customer_name: "Acme Workflow Corp",
    seats: 10,
    line_items: [{ sku: "AGENT-CORE", quantity: 2 }],
    discount_pct: 5,
    annual_commitment: false,
  };

  const createRes = await fetch(`${API_BASE}/api/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload),
  });

  assert.equal(createRes.status, 201);
  const quote = await createRes.json();
  assert.equal(quote.status, "draft");
  const quoteId = quote.id;

  // Step 2: Transition DRAFT -> SUBMITTED
  const submitRes = await fetch(`${API_BASE}/api/quotes/${quoteId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "submitted" }),
  });
  assert.equal(submitRes.status, 200);
  const submittedQuote = await submitRes.json();
  assert.equal(submittedQuote.status, "submitted");

  // Step 3: Transition SUBMITTED -> APPROVED
  const approveRes = await fetch(`${API_BASE}/api/quotes/${quoteId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(approveRes.status, 200);
  const approvedQuote = await approveRes.json();
  assert.equal(approvedQuote.status, "approved");

  // Step 4: Verify invalid transition from terminal state APPROVED is rejected
  const invalidRes = await fetch(`${API_BASE}/api/quotes/${quoteId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "submitted" }),
  });
  assert.equal(invalidRes.status, 400);
});
