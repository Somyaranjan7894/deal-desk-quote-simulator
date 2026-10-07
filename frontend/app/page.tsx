"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Catalog,
  Product,
  QuoteCalculationResult,
  QuoteFormLineItem,
  QuoteFormState,
  QuoteRequest,
} from "@/types";
import { calculateQuote, createQuote, getCatalog, ApiError, BACKEND_BASE_URL } from "@/lib/api";
import {
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
} from "@/lib/storage";
import { validateQuoteForm } from "@/lib/validation";
import { TierIndicator } from "@/components/TierIndicator";
import { LineItemRow } from "@/components/LineItemRow";
import { QuoteSummaryCard } from "@/components/QuoteSummaryCard";
import { DealHealth } from "@/components/DealHealth";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { DealDeskCopilot } from "@/components/DealDeskCopilot";

const INITIAL_FORM_STATE: QuoteFormState = {
  customer_name: "",
  seats: 10,
  line_items: [],
  discount_pct: 0,
  annual_commitment: false,
};

export default function QuoteBuilderPage() {
  const router = useRouter();

  // Catalog State
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<QuoteFormState>(INITIAL_FORM_STATE);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Calculation State
  const [calculation, setCalculation] = useState<QuoteCalculationResult | null>(
    null
  );
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Submission State
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AbortController reference for in-flight calculation requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // 1. Initial Load: Fetch Catalog and Restore Draft
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setCatalogLoading(true);
      setCatalogError(null);

      try {
        const cat = await getCatalog();
        if (!isMounted) return;
        setCatalog(cat);

        // Check for saved local draft
        const draft = loadLocalDraft();
        if (draft && draft.line_items) {
          setForm(draft);
          setHasRestoredDraft(true);
        } else if (cat.products.length > 0) {
          // Default to the first product in catalog
          setForm((prev) => ({
            ...prev,
            line_items: [{ sku: cat.products[0].sku, quantity: 1 }],
          }));
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Unable to load product catalog. Please ensure the Deal Desk backend is reachable.";
        setCatalogError(msg);
      } finally {
        if (isMounted) setCatalogLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. Reactive Calculation Engine (Debounced + AbortController)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Abort previous in-flight calculation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Persist editable inputs to localStorage
    if (catalog) {
      saveLocalDraft(form);
    }

    // Client-side pre-validation: only request calculation if inputs are syntactically valid
    const trimmedName = form.customer_name.trim();
    const validSeats =
      typeof form.seats === "number" && !isNaN(form.seats) && form.seats >= 1;
    const hasItems = form.line_items.length > 0;
    const validItems = form.line_items.every(
      (item) =>
        item.sku.trim() !== "" &&
        typeof item.quantity === "number" &&
        item.quantity > 0
    );
    const validDiscount =
      form.discount_pct === "" ||
      (typeof form.discount_pct === "number" && form.discount_pct >= 0);

    if (!validSeats || !hasItems || !validItems || !validDiscount) {
      setIsCalculating(false);
      return;
    }

    const payload: QuoteRequest = {
      customer_name: trimmedName.length > 0 ? trimmedName : "Draft Customer",
      seats: form.seats as number,
      line_items: form.line_items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity as number,
      })),
      discount_pct: form.discount_pct === "" ? 0 : form.discount_pct,
      annual_commitment: form.annual_commitment,
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsCalculating(true);
    setCalculationError(null);

    const timer = setTimeout(async () => {
      try {
        const result = await calculateQuote(payload, controller.signal);
        setCalculation(result);
        setCalculationError(null);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Ignore aborted requests
        }
        const msg =
          err instanceof ApiError
            ? err.detail
            : "Unable to calculate the quote. Please try again.";
        setCalculationError(msg);
      } finally {
        setIsCalculating(false);
      }
    }, 250); // 250ms debounce for responsive typing

    return () => {
      clearTimeout(timer);
    };
  }, [form, catalog]);

  // ---------------------------------------------------------------------------
  // 3. Form Input Handlers
  // ---------------------------------------------------------------------------
  const handleCustomerNameChange = (val: string) => {
    setForm((prev) => ({ ...prev, customer_name: val }));
  };

  const handleSeatsChange = (val: string) => {
    if (val === "") {
      setForm((prev) => ({ ...prev, seats: "" }));
    } else {
      const parsed = parseInt(val, 10);
      setForm((prev) => ({
        ...prev,
        seats: isNaN(parsed) ? "" : Math.max(1, parsed),
      }));
    }
  };

  const handleDiscountChange = (val: string) => {
    if (val === "") {
      setForm((prev) => ({ ...prev, discount_pct: "" }));
    } else {
      const parsed = parseFloat(val);
      setForm((prev) => ({
        ...prev,
        discount_pct: isNaN(parsed) ? "" : Math.max(0, parsed),
      }));
    }
  };

  const handleAnnualCommitmentChange = (checked: boolean) => {
    setForm((prev) => ({ ...prev, annual_commitment: checked }));
  };

  const handleAddProduct = () => {
    if (!catalog || catalog.products.length === 0) return;

    // Pick first product SKU not yet added
    const usedSkus = form.line_items.map((i) => i.sku);
    const available = catalog.products.find((p) => !usedSkus.includes(p.sku));
    const nextSku = available ? available.sku : catalog.products[0].sku;

    setForm((prev) => ({
      ...prev,
      line_items: [...prev.line_items, { sku: nextSku, quantity: 1 }],
    }));
  };

  const handleRemoveLineItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== index),
    }));
  };

  const handleChangeItemSku = (index: number, newSku: string) => {
    setForm((prev) => {
      const updated = [...prev.line_items];
      updated[index] = { ...updated[index], sku: newSku };
      return { ...prev, line_items: updated };
    });
  };

  const handleChangeItemQuantity = (
    index: number,
    newQuantity: number | ""
  ) => {
    setForm((prev) => {
      const updated = [...prev.line_items];
      updated[index] = { ...updated[index], quantity: newQuantity };
      return { ...prev, line_items: updated };
    });
  };

  const handleDiscardDraft = () => {
    clearLocalDraft();
    setHasRestoredDraft(false);
    if (catalog && catalog.products.length > 0) {
      setForm({
        ...INITIAL_FORM_STATE,
        line_items: [{ sku: catalog.products[0].sku, quantity: 1 }],
      });
    } else {
      setForm(INITIAL_FORM_STATE);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Save Draft Quote
  // ---------------------------------------------------------------------------
  const handleSaveDraft = async () => {
    const validation = validateQuoteForm(form, catalog);
    if (!validation.isValid) {
      setSaveError(validation.error);
      return;
    }

    const payload: QuoteRequest = {
      customer_name: form.customer_name.trim(),
      seats: form.seats as number,
      line_items: form.line_items.map((i) => ({
        sku: i.sku,
        quantity: i.quantity as number,
      })),
      discount_pct: form.discount_pct === "" ? 0 : form.discount_pct,
      annual_commitment: form.annual_commitment,
    };

    setIsSaving(true);
    setSaveError(null);

    try {
      const savedQuote = await createQuote(payload);
      // Clean local storage draft upon successful creation
      clearLocalDraft();
      // Navigate to Quote Review page
      if (savedQuote.id) {
        router.push(`/quotes/${savedQuote.id}`);
      } else {
        router.push("/quotes");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.detail
          : "Unable to save quote draft. Please try again.";
      setSaveError(msg);
      setIsSaving(false);
    }
  };

  const handleApplyScenario = (scenario: {
    seats: number;
    discount_pct: number;
    annual_commitment: boolean;
  }) => {
    setForm((prev) => ({
      ...prev,
      seats: scenario.seats,
      discount_pct: scenario.discount_pct,
      annual_commitment: scenario.annual_commitment,
    }));
  };

  // ---------------------------------------------------------------------------
  // 5. Derived UI States & Helpers
  // ---------------------------------------------------------------------------
  const usedSkus = form.line_items.map((i) => i.sku);
  const canAddMoreProducts =
    catalog &&
    catalog.products.length > 0 &&
    form.line_items.length < catalog.products.length;

  const currentSeats = typeof form.seats === "number" ? form.seats : 0;
  const currentTierRule = catalog?.discount_rules.find(
    (r) => currentSeats >= r.min_seats && currentSeats <= r.max_seats
  );

  const formValidation = validateQuoteForm(form, catalog);
  const canSave = formValidation.isValid && !calculationError;

  const lineItemsForSimulation = form.line_items.map((i) => ({
    sku: i.sku,
    quantity: typeof i.quantity === "number" ? i.quantity : parseInt(String(i.quantity), 10) || 1,
  }));

  const draftQuotePayload: QuoteRequest = {
    customer_name: form.customer_name.trim() || "Draft Customer",
    seats: typeof form.seats === "number" ? form.seats : parseInt(String(form.seats), 10) || 1,
    line_items: lineItemsForSimulation,
    discount_pct: typeof form.discount_pct === "number" ? form.discount_pct : parseFloat(String(form.discount_pct)) || 0,
    annual_commitment: form.annual_commitment,
  };

  // ---------------------------------------------------------------------------
  // 6. Loading & Error Early Returns
  // ---------------------------------------------------------------------------
  if (catalogLoading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div className="spinner spinner-primary" style={{ width: 28, height: 28, margin: "0 auto 1rem" }} />
        <h2>Loading Product Catalog...</h2>
        <p style={{ marginTop: "0.5rem" }}>
          Connecting to Deal Desk backend service at {BACKEND_BASE_URL}
        </p>
      </div>
    );
  }

  if (catalogError || !catalog) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
        <h2>Unable to Connect to Deal Desk Backend</h2>
        <p style={{ color: "var(--danger)", margin: "0.75rem 0 1.5rem" }}>
          {catalogError}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quote Builder</h1>
          <p className="page-description">
            Configure sales terms and calculate authoritative pricing against Deal Desk rules.
          </p>
        </div>
      </div>

      {/* Restored Draft Alert Banner */}
      {hasRestoredDraft && (
        <div className="alert alert-info">
          <span>
            📋 <strong>Draft Restored:</strong> Restored unsubmitted quote draft from your previous session.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDiscardDraft}
          >
            Discard Draft
          </button>
        </div>
      )}

      {/* Save Error Alert */}
      {saveError && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️ {saveError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSaveError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="quote-layout builder-grid">
        {/* Left Column: Form Configuration */}
        <section className="form-section main-quote-builder" aria-label="Quote Configuration">
          <div className="card">
            <h2 className="card-title">Customer &amp; Seat Bracket</h2>

            {/* Customer Name */}
            <div className="form-group">
              <label htmlFor="customer-name-input" className="form-label">
                <span>Customer Name *</span>
                <span className="form-label-hint">Required</span>
              </label>
              <input
                id="customer-name-input"
                type="text"
                className="input-text"
                placeholder="e.g. Acme Corporation"
                value={form.customer_name}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
              />
            </div>

            {/* Seats */}
            <div className="form-group">
              <label htmlFor="seats-input" className="form-label">
                <span>Seat Count *</span>
                <span className="form-label-hint">Determines pricing tier</span>
              </label>
              <input
                id="seats-input"
                type="number"
                min={1}
                step={1}
                className="input-text"
                placeholder="Number of seats"
                value={form.seats}
                onChange={(e) => handleSeatsChange(e.target.value)}
              />

              {/* Tier Indicator Strip */}
              <TierIndicator
                tiers={catalog.discount_rules}
                currentTier={calculation?.tier}
                seats={form.seats}
              />
            </div>
          </div>

          {/* Product Line Items */}
          <div className="card">
            <div className="card-title">
              <span>Products &amp; Quantities</span>
              {canAddMoreProducts && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddProduct}
                >
                  + Add Product
                </button>
              )}
            </div>

            {form.line_items.length === 0 ? (
              <div className="empty-state">
                <p>
                  <strong>No products added yet</strong>
                  <br />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Add at least one product to calculate the quote.
                  </span>
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleAddProduct}
                >
                  + Add Product
                </button>
              </div>
            ) : (
              <div className="line-items-container">
                {form.line_items.map((item, idx) => {
                  const calculatedDetail = calculation?.line_items?.find(
                    (detail) => detail.sku === item.sku
                  );

                  return (
                    <LineItemRow
                      key={`${item.sku}-${idx}`}
                      index={idx}
                      item={item}
                      products={catalog.products}
                      usedSkus={usedSkus}
                      calculatedDetail={calculatedDetail}
                      onChangeSku={(sku) => handleChangeItemSku(idx, sku)}
                      onChangeQuantity={(qty) => handleChangeItemQuantity(idx, qty)}
                      onRemove={() => handleRemoveLineItem(idx)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Discount & Terms */}
          <div className="card">
            <h2 className="card-title">Discount &amp; Commercial Terms</h2>

            {/* Discount Percentage */}
            <div className="form-group">
              <label htmlFor="discount-input" className="form-label">
                <span>Requested Discount (%)</span>
                <span className="form-label-hint">
                  {currentTierRule
                    ? `Max allowed for ${currentTierRule.code}: ${currentTierRule.max_discount_pct}%`
                    : "Max depends on seat bracket"}
                </span>
              </label>
              <input
                id="discount-input"
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="input-text"
                placeholder="0"
                value={form.discount_pct}
                onChange={(e) => handleDiscountChange(e.target.value)}
              />
            </div>

            {/* Annual Commitment Checkbox */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.annual_commitment}
                  onChange={(e) =>
                    handleAnnualCommitmentChange(e.target.checked)
                  }
                />
                <div>
                  <span>Annual Commitment (12-Month Contract)</span>
                  <span className="checkbox-hint">
                    Contract commitment agreement. Automatically triggers Deal Desk approval if discount exceeds 10%.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* Right Column: Live Authoritative Summary, Deal Health, Simulator & Copilot */}
        <aside
          className="deal-intelligence"
          aria-label="Deal Intelligence"
        >
          <QuoteSummaryCard
            calculation={calculation}
            isCalculating={isCalculating}
            isSaving={isSaving}
            canSave={Boolean(canSave)}
            tierMaxDiscountPct={currentTierRule?.max_discount_pct}
            validationError={calculationError}
            validationMessage={!formValidation.isValid ? formValidation.error : calculationError}
            onSaveDraft={handleSaveDraft}
            onReset={handleDiscardDraft}
          />

          {/* Deterministic Deal Health Metrics */}
          <DealHealth
            discountPct={form.discount_pct}
            approvalRequired={calculation?.approval_required}
            approvalReasons={calculation?.approval_reasons}
            annualCommitment={form.annual_commitment}
            hasProducts={form.line_items.length > 0}
          />

          {/* Interactive What-If Quote Simulator (Strictly Uses /calculate, Never Saves) */}
          <WhatIfSimulator
            customerName={form.customer_name}
            baseSeats={typeof form.seats === "number" ? form.seats : 10}
            baseDiscountPct={typeof form.discount_pct === "number" ? form.discount_pct : 0}
            baseAnnualCommitment={form.annual_commitment}
            lineItems={lineItemsForSimulation}
            onApplyScenario={handleApplyScenario}
          />

          {/* Deal Desk Copilot (Gemini-Powered Natural Language Explanation Layer) */}
          <DealDeskCopilot
            draftQuote={draftQuotePayload}
            canQuery={form.line_items.length > 0}
          />
        </aside>
      </div>
    </div>
  );
}
