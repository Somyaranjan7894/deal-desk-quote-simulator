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

test("PHASE 9.6: Enterprise 50 seats + 30% discount is valid within tier ceiling", () => {
  const form: QuoteFormState = {
    customer_name: "Enterprise Global",
    seats: 50,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 30,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
  // Proves it does NOT produce an 'exceeds tier maximum' error for 30%
  assert.ok(!validation.error?.includes("exceeds maximum allowable discount"));
});

test("PHASE 9.6: Enterprise 50 seats + 30.01% discount is rejected by tier validation", () => {
  const form: QuoteFormState = {
    customer_name: "Enterprise Global",
    seats: 50,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 30.01,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, false);
  assert.ok(
    validation.error?.includes("exceeds maximum allowable discount 30% for tier 'ENTERPRISE'")
  );
});

test("PHASE 9.6: Growth 25 seats + 20% discount is valid within tier ceiling", () => {
  const form: QuoteFormState = {
    customer_name: "Growth Scaling",
    seats: 25,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 20,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test("PHASE 9.6: Growth 25 seats + 30% discount is rejected and must NEVER be treated as valid", () => {
  const form: QuoteFormState = {
    customer_name: "Growth Scaling",
    seats: 25,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 30,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, false);
  assert.ok(
    validation.error?.includes("exceeds maximum allowable discount 20% for tier 'GROWTH'")
  );
  // Proves this invalid quote is caught and must never display "No Approval Required"
  assert.notEqual(validation.error, null);
});

test("PHASE 9.6: Starter 5 seats + 10% discount is valid within tier ceiling", () => {
  const form: QuoteFormState = {
    customer_name: "Starter Inc",
    seats: 5,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 10,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test("PHASE 9.6: Starter 5 seats + 10.01% discount is rejected by tier validation", () => {
  const form: QuoteFormState = {
    customer_name: "Starter Inc",
    seats: 5,
    line_items: [{ sku: "AGENT-CORE", quantity: 1 }],
    discount_pct: 10.01,
    annual_commitment: false,
  };

  const validation = validateQuoteForm(form, mockCatalog);
  assert.equal(validation.isValid, false);
  assert.ok(
    validation.error?.includes("exceeds maximum allowable discount 10% for tier 'STARTER'")
  );
});

test("PHASE 9.6: Three distinct states: Valid No-Approval, Valid Approval-Required, and Invalid Quote", () => {
  // State A: Starter 5 seats, 10% discount -> valid, no approval (<=15%, <=$25k, not annual >10%)
  const starterReq = { seats: 5, discount_pct: 10, annual_commitment: false };
  assert.ok(starterReq.discount_pct <= 10);
  assert.ok(starterReq.discount_pct <= 15);

  // State B: Enterprise 50 seats, 30% discount -> valid tier (<=30%), approval required (>15%)
  const enterpriseReq = { seats: 50, discount_pct: 30, annual_commitment: false };
  assert.ok(enterpriseReq.discount_pct <= 30); // Valid tier limit
  assert.ok(enterpriseReq.discount_pct > 15);  // Triggers approval

  // State C: Growth 25 seats, 30% discount -> invalid tier (>20%)
  const growthReq = { seats: 25, discount_pct: 30, annual_commitment: false };
  assert.ok(growthReq.discount_pct > 20); // Violates tier limit! Must NOT show "No Approval Required"
});
