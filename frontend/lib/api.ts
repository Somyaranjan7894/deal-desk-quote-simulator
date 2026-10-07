import type {
  Catalog,
  CopilotMessageRequest,
  CopilotResponse,
  QuoteCalculationResult,
  QuoteRequest,
  QuoteResponse,
  QuoteStatus,
  UnsavedQuoteCopilotRequest,
} from "../types/index.ts";

/**
 * Normalizes the backend base URL by stripping trailing slashes and any
 * trailing '/api' suffix, ensuring endpoint concatenation never results in
 * duplicated paths like '/api/api/...'.
 */
export function cleanBaseUrl(url: string): string {
  let cleaned = (url || "").trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/api")) {
    cleaned = cleaned.slice(0, -4).replace(/\/+$/, "");
  }
  return cleaned || "http://localhost:8000";
}

/**
 * Base URL configuration for the FastAPI service.
 * Supports both NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_BASE_URL.
 */
const rawBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000";

export const BACKEND_BASE_URL = cleanBaseUrl(rawBaseUrl);

/**
 * Safely constructs the target request URL from a base URL and endpoint,
 * preventing duplicate slashes, duplicate /api prefixes, or path malformations.
 */
export function buildApiUrl(baseUrl: string, endpoint: string): string {
  const cleanBase = cleanBaseUrl(baseUrl);
  let cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  // Guard against duplicate /api prefix
  if (cleanBase.endsWith("/api") && cleanEndpoint.startsWith("/api/")) {
    cleanEndpoint = cleanEndpoint.slice(4);
  }

  return `${cleanBase}${cleanEndpoint}`;
}

/**
 * Structured API Error containing HTTP status and descriptive error message.
 */
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Parses response error details from FastAPI into a human-readable string.
 */
async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const errorData = await response.json();
    if (typeof errorData?.detail === "string") {
      return errorData.detail;
    }
    if (Array.isArray(errorData?.detail)) {
      // Pydantic 422 validation errors array
      return errorData.detail
        .map((err: { loc?: string[]; msg?: string }) => {
          const field = err.loc ? err.loc[err.loc.length - 1] : "field";
          return `${field}: ${err.msg || "invalid value"}`;
        })
        .join("; ");
    }
    if (errorData?.message) {
      return String(errorData.message);
    }
  } catch {
    // Non-JSON response
  }
  return `HTTP ${response.status}: ${response.statusText || "Request failed"}`;
}

/**
 * Generic JSON request wrapper.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = buildApiUrl(BACKEND_BASE_URL, endpoint);
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Let caller handle aborted requests
    }
    throw new ApiError(
      0,
      "Unable to connect to the Deal Desk backend. Ensure the FastAPI server is running."
    );
  }

  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

// -----------------------------------------------------------------------------
// API Service Methods
// -----------------------------------------------------------------------------

/**
 * Health check endpoint.
 */
export async function fetchHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/health", { cache: "no-store" });
}

/**
 * Fetches the authoritative product catalog and seat discount rules.
 */
export async function getCatalog(): Promise<Catalog> {
  return request<Catalog>("/api/catalog", { cache: "no-store" });
}

/**
 * Authoritatively calculates quote totals, tier, and approval requirements.
 * Does NOT persist the quote. Supports AbortSignal for request cancellation.
 */
export async function calculateQuote(
  req: QuoteRequest,
  signal?: AbortSignal
): Promise<QuoteCalculationResult> {
  return request<QuoteCalculationResult>("/api/quotes/calculate", {
    method: "POST",
    body: JSON.stringify(req),
    signal,
  });
}

/**
 * Calculates and persists a new quote with initial status "draft".
 */
export async function createQuote(req: QuoteRequest): Promise<QuoteResponse> {
  return request<QuoteResponse>("/api/quotes", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/**
 * Retrieves all saved quotes, sorted newest first.
 */
export async function getQuotes(): Promise<QuoteResponse[]> {
  return request<QuoteResponse[]>("/api/quotes", { cache: "no-store" });
}

/**
 * Retrieves a single persisted quote by ID.
 */
export async function getQuote(id: string): Promise<QuoteResponse> {
  return request<QuoteResponse>(`/api/quotes/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
}

/**
 * Transitions quote status according to the authoritative Deal Desk state machine.
 */
export async function updateQuoteStatus(
  id: string,
  status: QuoteStatus
): Promise<QuoteResponse> {
  return request<QuoteResponse>(
    `/api/quotes/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}

/**
 * Deal Desk Copilot: natural-language explanation on an unsaved draft quote.
 * FastAPI calculates quote authoritatively before sending context to Gemini.
 */
export async function askDraftQuoteCopilot(
  req: UnsavedQuoteCopilotRequest
): Promise<CopilotResponse> {
  return request<CopilotResponse>("/api/quotes/copilot", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/**
 * Deal Desk Copilot: natural-language explanation on a persisted quote.
 * FastAPI retrieves authoritative quote context before sending to Gemini.
 */
export async function askSavedQuoteCopilot(
  id: string,
  req: CopilotMessageRequest
): Promise<CopilotResponse> {
  return request<CopilotResponse>(
    `/api/quotes/${encodeURIComponent(id)}/copilot`,
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
}

