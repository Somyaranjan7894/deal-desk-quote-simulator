import type { QuoteFormState } from "../types/index.ts";

const DRAFT_STORAGE_KEY = "deal-desk-quote-draft";

/**
 * Persists incomplete quote-builder inputs in localStorage.
 * Only stores user-editable form inputs, NEVER authoritative calculation results.
 */
export function saveLocalDraft(draft: QuoteFormState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn("Failed to persist quote draft to localStorage:", err);
  }
}

/**
 * Restores incomplete quote-builder inputs from localStorage if present.
 */
export function loadLocalDraft(): QuoteFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.line_items)) {
      return parsed as QuoteFormState;
    }
  } catch (err) {
    console.warn("Failed to parse quote draft from localStorage:", err);
  }
  return null;
}

/**
 * Removes the saved quote draft from localStorage.
 */
export function clearLocalDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (err) {
    console.warn("Failed to clear quote draft from localStorage:", err);
  }
}
