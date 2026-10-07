import test from "node:test";
import assert from "node:assert/strict";
import { validateQuoteForm } from "../lib/validation.ts";
import type { Catalog, QuoteFormState } from "../types/index.ts";

const mockCatalog: Catalog = {
  currency: "USD",
  discount_rules: [
    { code: "STARTER", min_seats: 1, max_seats: 9, max_discount_pct: "10" },
    { code: "GROWTH", min_seats: 10, max_seats: 49, max_discount_pct: "20" },
    { code: "ENTERPRISE", min_seats: 50, max_seats: 99999, max_discount_pct: "30" },
  ],
  products: [
    { sku: "AGENT-CORE", name: "Agent Core", unit_price: "120" },
    { sku: "ONBOARDING", name: "Implementation", unit_price: "2500" },
  ],
};

const baseValidForm: QuoteFormState = {
  customer_name: "Acme Corp",
  seats: 10,
  line_items: [{ sku: "AGENT-CORE", quantity: 2 }],
  discount_pct: 10,
  annual_commitment: false,
};

test("validation passes for a valid quote form", () => {
  const result = validateQuoteForm(baseValidForm, mockCatalog);
  assert.equal(result.isValid, true);
  assert.equal(result.error, null);
});

test("validation rejects blank customer name", () => {
  const form: QuoteFormState = { ...baseValidForm, customer_name: "   " };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("Customer name is required"));
});

test("validation rejects zero seats", () => {
  const form: QuoteFormState = { ...baseValidForm, seats: 0 };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("Seat count must be an integer"));
});

test("validation rejects negative seats", () => {
  const form: QuoteFormState = { ...baseValidForm, seats: -5 };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("Seat count must be an integer"));
});

test("validation rejects empty line items", () => {
  const form: QuoteFormState = { ...baseValidForm, line_items: [] };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("at least one product"));
});

test("validation rejects zero quantity", () => {
  const form: QuoteFormState = {
    ...baseValidForm,
    line_items: [{ sku: "AGENT-CORE", quantity: 0 }],
  };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("greater than 0"));
});

test("validation rejects negative quantity", () => {
  const form: QuoteFormState = {
    ...baseValidForm,
    line_items: [{ sku: "AGENT-CORE", quantity: -2 }],
  };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("greater than 0"));
});

test("validation rejects negative discount", () => {
  const form: QuoteFormState = { ...baseValidForm, discount_pct: -5 };
  const result = validateQuoteForm(form, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("cannot be negative"));
});

test("validation rejects discount exceeding tier maximum", () => {
  // STARTER tier allows max 10%
  const starterForm: QuoteFormState = {
    ...baseValidForm,
    seats: 5,
    discount_pct: 15,
  };
  const result = validateQuoteForm(starterForm, mockCatalog);
  assert.equal(result.isValid, false);
  assert.ok(result.error?.includes("exceeds maximum allowable discount 10% for tier 'STARTER'"));
});
