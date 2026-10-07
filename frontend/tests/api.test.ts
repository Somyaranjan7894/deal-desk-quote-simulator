import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  calculateQuote,
  createQuote,
  getCatalog,
  getQuote,
  getQuotes,
  updateQuoteStatus,
  fetchHealth,
  cleanBaseUrl,
  buildApiUrl,
} from "../lib/api.ts";
import type { QuoteRequest } from "../types/index.ts";

test("ApiError captures HTTP status and detail correctly", () => {
  const err = new ApiError(400, "Requested discount exceeds maximum allowable discount 10%");
  assert.equal(err.status, 400);
  assert.equal(err.detail, "Requested discount exceeds maximum allowable discount 10%");
  assert.equal(err.message, "Requested discount exceeds maximum allowable discount 10%");
  assert.equal(err.name, "ApiError");
});

test("ApiError formats 404 not found cleanly", () => {
  const err = new ApiError(404, "Product with SKU 'UNKNOWN' not found in catalog.");
  assert.equal(err.status, 404);
  assert.ok(err.detail.includes("UNKNOWN"));
});

test("ApiError formats network unavailable status 0", () => {
  const err = new ApiError(0, "Unable to connect to the Deal Desk backend.");
  assert.equal(err.status, 0);
  assert.ok(err.detail.includes("backend"));
});

test("getCatalog successfully parses 200 OK response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        currency: "USD",
        discount_rules: [],
        products: [{ sku: "AGENT-CORE", name: "Agent Core", unit_price: "120" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  try {
    const catalog = await getCatalog();
    assert.equal(catalog.currency, "USD");
    assert.equal(catalog.products.length, 1);
    assert.equal(catalog.products[0].sku, "AGENT-CORE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calculateQuote successfully posts and parses 200 OK calculation", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = "";
  globalThis.fetch = async (_url, options) => {
    capturedBody = options?.body as string;
    return new Response(
      JSON.stringify({
        tier: "GROWTH",
        subtotal: "1200.00",
        discount_amount: "120.00",
        total: "1080.00",
        approval_required: false,
        approval_reasons: [],
        line_items: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const req: QuoteRequest = {
    customer_name: "Test Client",
    seats: 10,
    line_items: [{ sku: "AGENT-CORE", quantity: 10 }],
    discount_pct: 10,
    annual_commitment: false,
  };

  try {
    const result = await calculateQuote(req);
    assert.equal(result.tier, "GROWTH");
    assert.equal(result.total, "1080.00");
    const sent = JSON.parse(capturedBody);
    assert.equal(sent.customer_name, "Test Client");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createQuote successfully posts and receives 201 Created QuoteResponse", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "mock-uuid-123",
        status: "draft",
        customer_name: "Persist Co",
        seats: 5,
        total: "500.00",
        line_items: [],
        discount_pct: 0,
        annual_commitment: false,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

  try {
    const res = await createQuote({
      customer_name: "Persist Co",
      seats: 5,
      line_items: [],
      discount_pct: 0,
      annual_commitment: false,
    });
    assert.equal(res.id, "mock-uuid-123");
    assert.equal(res.status, "draft");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateQuoteStatus successfully sends PATCH and returns updated status", async () => {
  const originalFetch = globalThis.fetch;
  let capturedMethod = "";
  globalThis.fetch = async (_url, options) => {
    capturedMethod = options?.method ?? "";
    return new Response(
      JSON.stringify({
        id: "mock-uuid-123",
        status: "submitted",
        customer_name: "Persist Co",
        seats: 5,
        line_items: [],
        discount_pct: 0,
        annual_commitment: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const res = await updateQuoteStatus("mock-uuid-123", "submitted");
    assert.equal(capturedMethod, "PATCH");
    assert.equal(res.status, "submitted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client maps HTTP 400 Bad Request to ApiError", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ detail: "Discount exceeds maximum allowable discount 10%" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );

  try {
    await createQuote({
      customer_name: "Test",
      seats: 5,
      line_items: [],
      discount_pct: 25,
      annual_commitment: false,
    });
    assert.fail("Should have thrown ApiError");
  } catch (err: unknown) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.ok(err.detail.includes("Discount exceeds maximum"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client maps HTTP 404 Not Found to ApiError", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ detail: "Quote with ID 'missing' not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );

  try {
    await getQuote("missing");
    assert.fail("Should have thrown ApiError");
  } catch (err: unknown) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    assert.ok(err.detail.includes("not found"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client maps HTTP 422 Unprocessable Content arrays to human-readable string", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        detail: [
          { loc: ["body", "seats"], msg: "Input should be greater than or equal to 1" },
          { loc: ["body", "customer_name"], msg: "Field required" },
        ],
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );

  try {
    await calculateQuote({
      customer_name: "",
      seats: 0,
      line_items: [],
      discount_pct: 0,
      annual_commitment: false,
    });
    assert.fail("Should have thrown ApiError");
  } catch (err: unknown) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.ok(err.detail.includes("seats: Input should be greater than or equal to 1"));
    assert.ok(err.detail.includes("customer_name: Field required"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client maps HTTP 500 Internal Server Error cleanly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ detail: "Quote storage file is corrupted." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );

  try {
    await getQuotes();
    assert.fail("Should have thrown ApiError");
  } catch (err: unknown) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 500);
    assert.ok(err.detail.includes("storage file is corrupted"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client maps network connection failures to status 0", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await getCatalog();
    assert.fail("Should have thrown ApiError");
  } catch (err: unknown) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 0);
    assert.ok(err.detail.includes("Unable to connect to the Deal Desk backend"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API client rethrows AbortError on cancellation without wrapping in ApiError", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new DOMException("The user aborted a request.", "AbortError");
  };

  const controller = new AbortController();
  controller.abort();

  try {
    await calculateQuote(
      {
        customer_name: "Abort Co",
        seats: 5,
        line_items: [],
        discount_pct: 0,
        annual_commitment: false,
      },
      controller.signal
    );
    assert.fail("Should have thrown AbortError");
  } catch (err: unknown) {
    assert.ok(err instanceof DOMException);
    assert.equal(err.name, "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchHealth successfully calls /health and parses ok status", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";

  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const res = await fetchHealth();
    assert.ok(capturedUrl.endsWith("/health"));
    assert.equal(res.status, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cleanBaseUrl normalizes trailing slashes and trailing /api correctly", () => {
  assert.equal(cleanBaseUrl("http://localhost:8000"), "http://localhost:8000");
  assert.equal(cleanBaseUrl("http://localhost:8000/"), "http://localhost:8000");
  assert.equal(cleanBaseUrl("https://deal-desk.onrender.com/api"), "https://deal-desk.onrender.com");
  assert.equal(cleanBaseUrl("https://deal-desk.onrender.com/api/"), "https://deal-desk.onrender.com");
  assert.equal(cleanBaseUrl(""), "http://localhost:8000");
});

test("buildApiUrl safely constructs clean paths without /api/api or // duplicates", () => {
  // Standard base and endpoints
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com", "/health"),
    "https://deal-desk.onrender.com/health"
  );
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com", "/api/catalog"),
    "https://deal-desk.onrender.com/api/catalog"
  );

  // Base URL with trailing slash
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com/", "/api/catalog"),
    "https://deal-desk.onrender.com/api/catalog"
  );

  // Base URL erroneously ending with /api
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com/api", "/api/catalog"),
    "https://deal-desk.onrender.com/api/catalog"
  );

  // Base URL erroneously ending with /api/
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com/api/", "/health"),
    "https://deal-desk.onrender.com/health"
  );

  // Endpoint without leading slash
  assert.equal(
    buildApiUrl("https://deal-desk.onrender.com", "health"),
    "https://deal-desk.onrender.com/health"
  );
});

