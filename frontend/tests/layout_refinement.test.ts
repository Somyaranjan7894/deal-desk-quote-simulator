import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GLOBALS_CSS_PATH = path.join(__dirname, "..", "app", "globals.css");
const BUILDER_PAGE_PATH = path.join(__dirname, "..", "app", "page.tsx");
const DETAIL_PAGE_PATH = path.join(__dirname, "..", "app", "quotes", "[id]", "page.tsx");
const DEAL_HEALTH_PATH = path.join(__dirname, "..", "components", "DealHealth.tsx");
const WHAT_IF_PATH = path.join(__dirname, "..", "components", "WhatIfSimulator.tsx");
const COPILOT_PATH = path.join(__dirname, "..", "components", "DealDeskCopilot.tsx");

test("LAYOUT: Page container max-width 1440px and balanced centering", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  assert.ok(css.includes(".page-shell"), "globals.css should define .page-shell");
  assert.ok(css.includes(".main-content"), "globals.css should define .main-content");
  assert.ok(css.includes("max-width: 1440px;"), "Page container must enforce 1440px max width");
  assert.ok(css.includes("margin: 0 auto;"), "Page container must be centered with margin: 0 auto");
  assert.ok(css.includes("padding: 24px 32px 48px;"), "Page container must use standard padding scale");
});

test("LAYOUT: Two-column grid with deliberate desktop and responsive widths", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  assert.ok(css.includes(".quote-layout"), "globals.css must define .quote-layout");
  assert.ok(css.includes(".builder-grid"), "globals.css must define .builder-grid");
  assert.ok(
    css.includes("grid-template-columns: minmax(0, 1fr) 420px;"),
    "Desktop grid must use minmax(0, 1fr) 420px"
  );
  assert.ok(css.includes("gap: 24px;"), "Desktop grid must use 24px gap");
  assert.ok(
    css.includes("grid-template-columns: minmax(0, 1fr) 380px;"),
    "Tablet grid must reduce sidebar to 380px"
  );
  assert.ok(
    css.includes("grid-template-columns: 1fr;"),
    "Mobile grid must collapse to single column"
  );
});

test("LAYOUT: Left Column uses form-section with uniform flexbox gap", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  assert.ok(css.includes(".form-section"), "globals.css must define .form-section");
  assert.ok(css.includes("gap: 20px;"), "form-section must have 20px gap between cards");
  assert.ok(css.includes("min-width: 0;"), "form-section must have min-width: 0 to prevent overflow");
});

test("LAYOUT: Deal Intelligence sidebar container rules & normal document flow", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  assert.ok(css.includes(".deal-intelligence"), "globals.css must define .deal-intelligence");
  assert.ok(css.includes("gap: 16px;"), "deal-intelligence must have 16px gap between intelligence cards");
  assert.ok(css.includes("align-self: start;"), "deal-intelligence must align to start of grid");

  // Verify sticky behavior is NOT unconditional (only tall desktop viewports)
  assert.ok(
    css.includes("@media (min-width: 1200px) and (min-height: 980px)"),
    "Sticky positioning must be gated to tall viewports to prevent cutoff"
  );

  // Prohibit viewport trap
  assert.ok(
    !css.includes("height: 100vh;\n  overflow-y: auto"),
    "Sidebar must not have height: 100vh; overflow-y: auto trap"
  );
});

test("LAYOUT: Deal Health compact 4-indicator layout", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  const component = fs.readFileSync(DEAL_HEALTH_PATH, "utf-8");
  assert.ok(css.includes(".deal-health-list"), "globals.css must define .deal-health-list");
  assert.ok(css.includes(".deal-health-row"), "globals.css must define .deal-health-row");
  assert.ok(css.includes(".deal-health-badge"), "globals.css must define .deal-health-badge");
  assert.ok(component.includes("Pricing"), "DealHealth must include Pricing indicator");
  assert.ok(component.includes("Discount"), "DealHealth must include Discount indicator");
  assert.ok(component.includes("Approval"), "DealHealth must include Approval indicator");
  assert.ok(component.includes("Commitment"), "DealHealth must include Commitment indicator");
});

test("LAYOUT: What-If Simulator compact card and prominent preview badge", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  const component = fs.readFileSync(WHAT_IF_PATH, "utf-8");
  assert.ok(css.includes(".what-if-card"), "globals.css must define .what-if-card");
  assert.ok(css.includes(".scenario-badge-banner"), "globals.css must define .scenario-badge-banner");
  assert.ok(component.includes("SCENARIO PREVIEW"), "What-If must display SCENARIO PREVIEW");
  assert.ok(component.includes("NOT SAVED"), "What-If must display NOT SAVED");
  assert.ok(component.includes("Simulate Changes"), "What-If must display toggle button");
});

test("LAYOUT: Deal Desk Copilot natural height, 2x2 actions, and flex input group", () => {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  const component = fs.readFileSync(COPILOT_PATH, "utf-8");
  assert.ok(css.includes(".copilot-card"), "globals.css must define .copilot-card");
  assert.ok(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"), "Quick actions must use 2x2 grid");
  assert.ok(css.includes(".copilot-input-form"), "globals.css must define .copilot-input-form");
  assert.ok(css.includes("overflow-wrap: anywhere;"), "Copilot response must wrap text cleanly");
  assert.ok(component.includes("copilot-input-form"), "Copilot must use copilot-input-form");
  assert.ok(component.includes("copilot-actions-grid"), "Copilot must use copilot-actions-grid");
});

test("LAYOUT: Quote Builder page structure adheres to Quote Builder + Deal Intelligence", () => {
  const page = fs.readFileSync(BUILDER_PAGE_PATH, "utf-8");
  assert.ok(page.includes('className="quote-layout builder-grid"'), "Page must use .quote-layout.builder-grid");
  assert.ok(page.includes('className="form-section main-quote-builder"'), "Page must use .form-section");
  assert.ok(page.includes('className="deal-intelligence"'), "Page must use .deal-intelligence aside");

  // Verify order in sidebar
  const summaryIdx = page.indexOf("<QuoteSummaryCard");
  const healthIdx = page.indexOf("<DealHealth");
  const whatIfIdx = page.indexOf("<WhatIfSimulator");
  const copilotIdx = page.indexOf("<DealDeskCopilot");

  assert.ok(summaryIdx !== -1 && healthIdx !== -1 && whatIfIdx !== -1 && copilotIdx !== -1);
  assert.ok(summaryIdx < healthIdx, "Quote Summary must precede Deal Health");
  assert.ok(healthIdx < whatIfIdx, "Deal Health must precede What-If Simulator");
  assert.ok(whatIfIdx < copilotIdx, "What-If Simulator must precede Deal Desk Copilot");
});

test("LAYOUT: Quote Review route (/quotes/[id]) mirrors identical two-column structure", () => {
  const page = fs.readFileSync(DETAIL_PAGE_PATH, "utf-8");
  assert.ok(page.includes('className="quote-layout builder-grid"'), "Detail page must use .quote-layout.builder-grid");
  assert.ok(page.includes('className="form-section main-quote-builder"'), "Detail page must use .form-section");
  assert.ok(page.includes('className="deal-intelligence"'), "Detail page must use .deal-intelligence aside");

  const healthIdx = page.indexOf("<DealHealth");
  const whatIfIdx = page.indexOf("<WhatIfSimulator");
  const copilotIdx = page.indexOf("<DealDeskCopilot");

  assert.ok(healthIdx !== -1 && whatIfIdx !== -1 && copilotIdx !== -1);
  assert.ok(healthIdx < whatIfIdx, "Deal Health must precede What-If Simulator on detail page");
  assert.ok(whatIfIdx < copilotIdx, "What-If Simulator must precede Deal Desk Copilot on detail page");
});
