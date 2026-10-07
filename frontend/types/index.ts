/**
 * Authoritative TypeScript definitions for Deal Desk Quote Simulator.
 * Strictly aligned with FastAPI Pydantic schemas in backend/app/schemas/.
 */

export interface Product {
  sku: string;
  name: string;
  unit_price: string | number;
}

export interface DiscountTier {
  code: string;
  min_seats: number;
  max_seats: number;
  max_discount_pct: string | number;
}

export interface Catalog {
  currency: string;
  discount_rules: DiscountTier[];
  products: Product[];
}

export interface QuoteLineItem {
  sku: string;
  quantity: number;
}

export interface QuoteLineItemResponse extends QuoteLineItem {
  name?: string;
  product_name?: string;
  unit_price?: string;
  line_total?: string;
}

export interface QuoteRequest {
  customer_name: string;
  seats: number;
  line_items: QuoteLineItem[];
  discount_pct: number | string;
  annual_commitment: boolean;
}

export interface QuoteCalculationResult {
  customer_name?: string;
  seats?: number;
  tier: string;
  discount_pct?: string | number;
  annual_commitment?: boolean;
  subtotal: string;
  discount_amount: string;
  total: string;
  approval_required: boolean;
  approval_reasons: string[];
  line_items: QuoteLineItemResponse[];
}

export type QuoteStatus = "draft" | "submitted" | "approved" | "rejected";

export interface QuoteStatusUpdateRequest {
  status: QuoteStatus;
}

export interface QuoteResponse {
  id?: string;
  status: QuoteStatus;
  customer_name: string;
  seats: number;
  line_items: QuoteLineItemResponse[];
  discount_pct: string | number;
  annual_commitment: boolean;
  tier?: string;
  subtotal?: string;
  discount_amount?: string;
  total?: string;
  approval_required?: boolean;
  approval_reasons?: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Local UI form state for the Quote Builder.
 * Allows empty string inputs while user is typing.
 */
export interface QuoteFormLineItem {
  sku: string;
  quantity: number | "";
}

export interface QuoteFormState {
  customer_name: string;
  seats: number | "";
  line_items: QuoteFormLineItem[];
  discount_pct: number | "";
  annual_commitment: boolean;
}

/**
 * Deal Desk Copilot types strictly aligned with backend schemas.
 */
export interface CopilotMessageRequest {
  message: string;
  action?: string;
}

export interface UnsavedQuoteCopilotRequest {
  quote: QuoteRequest;
  message: string;
  action?: string;
}

export interface CopilotResponse {
  answer: string;
  quote_id?: string;
  model: string;
  generated: boolean;
}

/**
 * Deterministic Deal Health item representation.
 */
export interface DealHealthItem {
  label: string;
  status: "good" | "warning" | "neutral";
  statusText: string;
  detail: string;
}

