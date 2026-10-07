import type { Catalog, QuoteFormState } from "../types/index.ts";

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates editable form inputs on the client before calculation/persistence.
 * This provides immediate UX feedback without replacing authoritative backend validation.
 */
export function validateQuoteForm(
  form: QuoteFormState,
  catalog?: Catalog | null
): ValidationResult {
  // 1. Customer name validation
  const trimmedCustomer = form.customer_name?.trim() ?? "";
  if (!trimmedCustomer) {
    return { isValid: false, error: "Customer name is required." };
  }

  // 2. Seats validation
  if (
    form.seats === "" ||
    typeof form.seats !== "number" ||
    isNaN(form.seats) ||
    !Number.isInteger(form.seats) ||
    form.seats < 1
  ) {
    return {
      isValid: false,
      error: "Seat count must be an integer greater than or equal to 1.",
    };
  }

  // 3. Products validation
  if (!form.line_items || form.line_items.length === 0) {
    return {
      isValid: false,
      error: "Quote must include at least one product.",
    };
  }

  for (const item of form.line_items) {
    if (!item.sku || item.sku.trim() === "") {
      return {
        isValid: false,
        error: "Product SKU cannot be blank.",
      };
    }
    if (
      item.quantity === "" ||
      typeof item.quantity !== "number" ||
      isNaN(item.quantity) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return {
        isValid: false,
        error: "Product quantity must be an integer greater than 0.",
      };
    }
  }

  // 4. Discount percentage validation
  if (
    form.discount_pct !== "" &&
    (typeof form.discount_pct !== "number" ||
      isNaN(form.discount_pct) ||
      form.discount_pct < 0)
  ) {
    return {
      isValid: false,
      error: "Discount percentage cannot be negative.",
    };
  }

  // 5. Tier maximum discount ceiling validation (if catalog available)
  if (catalog && catalog.discount_rules && form.discount_pct !== "") {
    const seats = form.seats as number;
    const currentTier = catalog.discount_rules.find(
      (r) => seats >= r.min_seats && seats <= r.max_seats
    );

    if (currentTier) {
      const maxDiscount =
        typeof currentTier.max_discount_pct === "number"
          ? currentTier.max_discount_pct
          : parseFloat(String(currentTier.max_discount_pct));

      if (form.discount_pct > maxDiscount) {
        return {
          isValid: false,
          error: `Requested discount ${form.discount_pct}% exceeds maximum allowable discount ${maxDiscount}% for tier '${currentTier.code}'.`,
        };
      }
    }
  }

  return { isValid: true, error: null };
}
