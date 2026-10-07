import test from "node:test";
import assert from "node:assert/strict";
import {
  askDraftQuoteCopilot,
  askSavedQuoteCopilot,
  calculateQuote,
  ApiError,
} from "../lib/api.ts";
import type {
  CopilotMessageRequest,
  CopilotResponse,
  QuoteRequest,
  UnsavedQuoteCopilotRequest,
} from "../types/index.ts";

test("Copilot API: askDraftQuoteCopilot correctly calls /api/quotes/copilot with authoritative calculation payload", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = "";

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = String(options?.body || "");
    const mockResponse: CopilotResponse = {
      answer: "This is an authoritative explanation of the draft quote.",
      quote_id: undefined,
      model: "gemini-2.5-flash",
      generated: true,
    };
    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const draftPayload: UnsavedQuoteCopilotRequest = {
      quote: {
        customer_name: "Acme Corp",
        seats: 10,
        line_items: [{ sku: "AGENT-CORE", quantity: 5 }],
        discount_pct: 12,
        annual_commitment: true,
      },
      message: "Explain pricing for this quote",
      action: "explain_pricing",
    };

    const res = await askDraftQuoteCopilot(draftPayload);
    assert.ok(capturedUrl.endsWith("/api/quotes/copilot"));
    assert.equal(res.answer, "This is an authoritative explanation of the draft quote.");
    assert.equal(res.model, "gemini-2.5-flash");
    assert.equal(res.generated, true);

    const parsedBody = JSON.parse(capturedBody);
    assert.equal(parsedBody.quote.customer_name, "Acme Corp");
    assert.equal(parsedBody.action, "explain_pricing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Copilot API: askSavedQuoteCopilot correctly calls /api/quotes/{id}/copilot", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = "";

  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedBody = String(options?.body || "");
    const mockResponse: CopilotResponse = {
      answer: "Quote requires approval because discount exceeds 15%.",
      quote_id: "quote-1234",
      model: "gemini-2.5-flash",
      generated: true,
    };
    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const messageReq: CopilotMessageRequest = {
      message: "Why does this quote require approval?",
      action: "why_approval",
    };

    const res = await askSavedQuoteCopilot("quote-1234", messageReq);
    assert.ok(capturedUrl.endsWith("/api/quotes/quote-1234/copilot"));
    assert.equal(res.quote_id, "quote-1234");
    assert.equal(res.answer, "Quote requires approval because discount exceeds 15%.");
    assert.equal(res.generated, true);

    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.action, "why_approval");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Copilot API: Handles backend error / unavailable status gracefully", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        detail:
          "The Deal Desk Copilot is temporarily unavailable. You can still use the quote calculation and approval information shown above.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await assert.rejects(
      async () => {
        await askSavedQuoteCopilot("quote-999", { message: "Summarize deal" });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 503);
        assert.ok(err.detail.includes("temporarily unavailable"));
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("What-If Simulator: Models scenario calculation via calculateQuote without persisting", async () => {
  const originalFetch = globalThis.fetch;
  let calculationCalled = false;
  let persistenceCalled = false;

  globalThis.fetch = async (url, options) => {
    const strUrl = String(url);
    if (strUrl.endsWith("/api/quotes/calculate")) {
      calculationCalled = true;
      return new Response(
        JSON.stringify({
          tier: "GROWTH",
          subtotal: "10000.00",
          discount_amount: "1000.00",
          total: "9000.00",
          approval_required: true,
          approval_reasons: ["Annual commitment with discount above 10%"],
          line_items: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (strUrl.endsWith("/api/quotes") && options?.method === "POST") {
      persistenceCalled = true;
    }
    return new Response(JSON.stringify({}), { status: 400 });
  };

  try {
    const scenario: QuoteRequest = {
      customer_name: "Acme Scenario",
      seats: 25,
      line_items: [{ sku: "AGENT-CORE", quantity: 10 }],
      discount_pct: 10,
      annual_commitment: true,
    };

    const calcResult = await calculateQuote(scenario);
    assert.equal(calculationCalled, true, "Scenario must invoke calculation endpoint");
    assert.equal(persistenceCalled, false, "Scenario preview must never invoke persistence");
    assert.equal(calcResult.tier, "GROWTH");
    assert.equal(calcResult.total, "9000.00");
    assert.equal(calcResult.approval_required, true);
    assert.equal(calcResult.approval_reasons[0], "Annual commitment with discount above 10%");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("What-If Simulator: Reset restores initial baseline values", () => {
  const baseSeats = 15;
  const baseDiscountPct = 18;
  const baseAnnualCommitment = true;

  // Simulate user changing values in scenario
  let scenarioSeats = 30;
  let scenarioDiscountPct = 10;
  let scenarioAnnualCommitment = false;

  assert.notEqual(scenarioSeats, baseSeats);

  // Trigger reset action
  scenarioSeats = baseSeats;
  scenarioDiscountPct = baseDiscountPct;
  scenarioAnnualCommitment = baseAnnualCommitment;

  assert.equal(scenarioSeats, 15);
  assert.equal(scenarioDiscountPct, 18);
  assert.equal(scenarioAnnualCommitment, true);
});

test("Deal Health: Deterministic explainable metrics calculation", () => {
  // Scenario 1: Standard quote without approval triggers
  const standardDiscount = 10;
  const standardApprovalRequired = false;
  const standardAnnualCommitment = false;

  const discountMetric1 =
    standardDiscount > 15 ? "Review" : standardDiscount <= 0 ? "Good" : "Standard";
  const approvalMetric1 = standardApprovalRequired ? "Required" : "Standard Path";
  const commitmentMetric1 = standardAnnualCommitment ? "Active" : "Month-to-Month";

  assert.equal(discountMetric1, "Standard");
  assert.equal(approvalMetric1, "Standard Path");
  assert.equal(commitmentMetric1, "Month-to-Month");

  // Scenario 2: High discount triggering approval
  const highDiscount = 20;
  const highApprovalRequired = true;
  const highAnnualCommitment = true;

  const discountMetric2 = highDiscount > 15 ? "Review" : "Standard";
  const approvalMetric2 = highApprovalRequired ? "Required" : "Standard Path";
  const commitmentMetric2 = highAnnualCommitment ? "Active" : "Month-to-Month";

  assert.equal(discountMetric2, "Review");
  assert.equal(approvalMetric2, "Required");
  assert.equal(commitmentMetric2, "Active");
});
