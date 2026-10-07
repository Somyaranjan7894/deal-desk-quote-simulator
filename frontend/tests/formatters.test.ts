import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, formatPercentage, formatDateTime } from "../lib/formatters.ts";

test("formatCurrency formats standard decimal strings correctly", () => {
  assert.equal(formatCurrency("120.00"), "$120.00");
  assert.equal(formatCurrency("25000.00"), "$25,000.00");
  assert.equal(formatCurrency("0"), "$0.00");
  assert.equal(formatCurrency(null), "$0.00");
  assert.equal(formatCurrency(undefined), "$0.00");
});

test("formatPercentage formats percentages accurately", () => {
  assert.equal(formatPercentage("15"), "15%");
  assert.equal(formatPercentage(15.5), "15.5%");
  assert.equal(formatPercentage("0"), "0%");
  assert.equal(formatPercentage(null), "0%");
});

test("formatDateTime handles valid ISO timestamps and nulls", () => {
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime(""), "—");
  const formatted = formatDateTime("2026-10-07T14:30:00Z");
  assert.ok(formatted.includes("2026"));
  assert.ok(formatted.includes("Oct"));
});
