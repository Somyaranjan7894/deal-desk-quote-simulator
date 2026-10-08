# Engineering Decisions

## Phase 1

### Repository Architecture
The repository is structured as a cleanly separated full-stack project consisting of:
- `frontend/`: Next.js App Router, React, and TypeScript.
- `backend/`: Python and FastAPI.
- `data/`: Contains the immutable assessment source data (`catalog.json`).

**Rationale**:
1. **Decoupled Lifecycles**: Frontend and backend maintain distinct dependency trees, runtime environments (Node.js vs. Python venv), and test suites.
2. **Explicit HTTP Boundary**: The frontend communicates with the backend exclusively via standard HTTP endpoints. We intentionally avoid Next.js API routes or server action proxies as the calculation engine, reflecting real-world enterprise service architecture where pricing services are dedicated, independent services.
3. **Simplicity and Extensibility**: This layout allows reviewers and engineers to run, test, and containerize either application independently without framework entanglement.

---

### Backend Authority
The Python FastAPI backend is the sole authoritative source of truth for:
- Product definitions and unit prices.
- Seat count to pricing tier resolution (`STARTER`, `GROWTH`, `ENTERPRISE`).
- Maximum allowable discount percentage validation.
- Monetary calculations (subtotal, line totals, discount amounts, and final quote total).
- Deal desk approval determination and approval reasons.

**Rationale**:
1. **Security & Integrity**: Financial calculations must never be trusted from the browser client. Client-side rules are prone to manipulation or validation bypass.
2. **Consistency**: Hard-coding pricing tables or discount limits in the frontend would introduce dual-maintenance risks and logic drift. The client renders inputs and displays authoritative calculations returned by the backend.

---

### Source Catalog
`data/catalog.json` is treated as immutable assessment source data.

**Rationale**:
1. **Preservation of Source Data**: The catalog file provided in the assessment contains the currency, discount rules by seat ranges, and product catalog. It is preserved without modifications, reformatting, or normalization.
2. **Authoritative Loading**: In subsequent phases, backend repositories will load this file directly or ingest it into structured Pydantic domain models without mutating the underlying file.

---

### Business Logic Separation
The backend follows a layered design pattern:
```text
HTTP Request (Client)
       ↓
API Route Handler (`app/api/`)
       ↓
Schema Validation (`app/schemas/`)
       ↓
Business Domain Service (`app/services/`)
       ↓
Repository / Data Access (`app/repositories/`)
```

**Rationale**:
1. **Isolated Domain Logic**: Pricing and approval rules will be implemented in pure Python functions and services within `app/services/`, completely decoupled from Starlette/FastAPI request contexts.
2. **High Testability**: Complex discount boundaries and approval logic can be rigorously tested through fast, deterministic unit tests without spinning up HTTP servers or mocking request/response cycles.
3. **Maintainability**: Clear separation ensures changes to API schemas or serialization formats do not inadvertently impact core pricing calculations.

---

## Phase 4: Quote Calculation & Business Rules

### 1. Duplicate Product Lines
- **Decision**: Multiple line items referencing the same product SKU are automatically normalized and merged by summing their quantities. The order of the first occurrence of each SKU is preserved in the calculation output.
- **Rationale**: Sales representatives frequently add items incrementally as requirements evolve. Merging duplicates by SKU prevents redundant line entries, produces a clean summary invoice/quote, and ensures total quantities reflect customer intent deterministically without throwing arbitrary validation rejections.

### 2. Representation of 0% Discount
- **Decision**: A 0% discount is represented explicitly as numeric `0` or `Decimal("0")` in data contracts, producing a calculated `discount_amount` of `Decimal("0.00")` and a `total` equal to `subtotal`.
- **Rationale**: An explicit zero numeric representation avoids ambiguous nullable states (`null` vs `undefined` vs `0`), simplifies arithmetic evaluation without special-case branching, and clearly communicates that no discount concession was granted.

### 3. Money and Rounding Strategy
- **Decision**: All financial computations utilize Python `Decimal` with explicit `ROUND_HALF_UP` rounding to 2 decimal places (`Decimal("0.01")`). Premature intermediate rounding is avoided; `subtotal`, `discount_amount`, and `total` are quantized to cents at the calculation boundary.
- **Rationale**: Binary floating-point arithmetic (`float`) causes precision loss and non-deterministic rounding errors in financial software. `Decimal` guarantees exact base-10 arithmetic. Using `ROUND_HALF_UP` adheres to standard commercial accounting practices. Quantizing `discount_amount` and setting `total = subtotal - discount_amount` guarantees the fundamental financial invariant `subtotal == discount_amount + total`.

### 4. Annual Commitment Pricing Behavior
- **Decision**: The `annual_commitment` boolean flag does not alter unit prices or monetary calculation formulas; it functions strictly as a Deal Desk approval policy trigger.
- **Rationale**: The assessment specification does not specify an annual discount multiplier or altered price schedule. Therefore, pricing remains based strictly on product catalog unit prices, while annual commitments with discounts above 10% trigger deal desk governance.

### 5. Business-Rule Ownership
- **Decision**: Authoritative quote calculations, seat tier resolutions, and deal desk approval logic reside entirely within the backend service layer (`QuoteCalculationService`).
- **Rationale**: Frontend components and HTTP route handlers must never perform independent pricing math. Centralizing business rules in framework-agnostic domain services guarantees that all client interfaces receive identical, audited results and enables comprehensive automated test coverage without web server dependencies.

### 6. Approval Threshold Boundaries
- **Decision**: Approval rules evaluate strict inequality (`>`) against exact threshold boundaries:
  1. `discount_pct > 15.00%` (e.g., 15.00% requires no approval; 15.01% triggers approval).
  2. `total > $25,000.00` (e.g., $25,000.00 requires no approval; $25,000.01 triggers approval).
  3. `annual_commitment == True AND discount_pct > 10.00%` (e.g., annual commitment at 10.00% requires no approval; 10.01% triggers approval).
- **Reasons Formatting**: Approval reasons are returned as deterministic string identifiers in a stable, predictable sequence:
  - `"Discount exceeds 15%"`
  - `"Total exceeds $25,000"`
  - `"Annual commitment with discount above 10%"`

### 7. Tier Maximum Discount Enforcement
- **Decision**: Requesting a discount percentage higher than the customer seat tier's maximum allowable discount (STARTER: 10%, GROWTH: 20%, ENTERPRISE: 30%) raises a domain business exception (`DiscountExceedsTierMaximumError`).
- **Rationale**: The tier discount limit is a hard business constraint derived dynamically from `catalog.json`. Exceeding this limit constitutes an invalid business request, distinct from a valid quote that requires Deal Desk managerial approval.

---

## Phase 6: Quote Persistence & Review Lifecycle

### 1. JSON File Persistence Architecture
- **Decision**: Persist quotes to a local JSON file (`backend/data/quotes.json`) utilizing atomic file write operations (write to temporary `.tmp` file followed by an atomic filesystem replace).
- **Rationale**: The assessment specification explicitly authorizes JSON persistence without requiring a database. Using atomic replacement eliminates the risk of corrupted, half-written JSON files in the event of unexpected interruptions.

### 2. Separation of Responsibilities
- **Decision**:
  - `QuoteRepository`: Solely responsible for storage I/O, atomic file writes, JSON reading, and lookup by ID. Contains zero pricing, discount, or lifecycle transition logic.
  - `QuoteCalculationService`: Authoritative mathematical engine for line items, subtotals, tier ceilings, and approval policy evaluations.
  - `QuoteService`: Application service that coordinates calculation, persistence, UUID generation, and status state machine enforcement.

### 3. Historical Pricing Preservation & Product Retirement
- **Decision**: When a quote is created, the complete calculated financial breakdown—including product names, unit prices, line totals, subtotal, discount amount, final total, tier, and approval reasons—is frozen and saved directly in the quote record.
- **Rationale**: Commercial quotes represent legal and sales commitments at a point in time. If product prices change or products are retired from `catalog.json` later, existing saved quotes are never recalculated, ensuring historical integrity and audit compliance.

### 4. UUID-Based Identifiers
- **Decision**: Quote identifiers are generated using standard RFC 4122 Version 4 UUIDs (`uuid.uuid4()`).
- **Rationale**: Avoids sequential integer collisions, eliminates race conditions in concurrent creation scenarios, and prevents client-side quote enumeration.

### 5. Quote Status State Machine
- **Decision**: Quote lifecycle transitions are strictly governed by a centralized finite state machine:
  - `draft` → `submitted`
  - `submitted` → `approved`
  - `submitted` → `rejected`
  - All other transitions (e.g., `draft` → `approved`, `submitted` → `draft`, or mutating `approved`/`rejected` terminal states) are strictly prohibited and rejected by the backend with an `InvalidQuoteStatusTransitionError` (HTTP 400).
- **Rationale**: Guarantees sales governance integrity. A rep cannot bypass review to approve their own draft, and decided quotes cannot be tampered with.

### 6. Separation of `approval_required` and `status`
- **Decision**: `approval_required` (boolean) and `status` (lifecycle enum) are treated as distinct, independent concepts.
- **Rationale**: `approval_required` indicates whether managerial deal desk intervention is triggered by business rules (e.g., discount > 15% or total > $25k). `status` represents the workflow stage of the document (`draft` → `submitted` → `approved`/`rejected`). Even quotes that do not require Deal Desk approval must progress through standard submission workflow rather than jumping to approval automatically.

### 7. Persistence Limitations & Production Migration Path
- **Decision**: JSON file storage is optimal for the local prototype/take-home assignment, but has documented limitations:
  - Not designed for multi-process or high-concurrency writes.
  - File locking or race conditions can occur under parallel horizontal scaling.
  - Lack of ACID transaction isolation and indexed querying.
- **Production Migration Path**: In a production enterprise environment, `QuoteRepository` would be implemented on top of PostgreSQL using SQLAlchemy/SQLModel or asyncpg, storing quotes with ACID transactions, JSONB document columns for line item snapshots, and indexed audit tables.

---

## Phase 7: Frontend Quote Builder & Review UI

### 1. Frontend / Backend Responsibility Boundary
- **Decision**: The Next.js frontend acts strictly as a presentation and interaction layer. It collects inputs (`customer_name`, `seats`, `line_items`, `discount_pct`, `annual_commitment`) and dispatches them to the FastAPI backend.
- **Rationale**: The backend is the single source of truth for pricing calculations, seat tier resolution, discount ceilings, and approval policy evaluation. The frontend never performs independent math or approval logic to prevent financial divergence or rule discrepancies.

### 2. Centralized Typed API Client
- **Decision**: All HTTP interactions are centralized in `frontend/lib/api.ts`. No raw `fetch` calls are embedded directly within React components.
- **Rationale**: Ensures uniform error handling, structured error extraction (including Pydantic 422 arrays and 400/404/500 detail strings via custom `ApiError`), environment-based URL resolution (`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_BASE_URL`), and request cancellation capabilities.

### 3. Monetary Value and Decimal Precision
- **Decision**: The backend calculates and serializes financial numbers as exact Decimal strings (e.g. `"25600.00"`). The frontend treats these as presentation strings and uses `Intl.NumberFormat` via `formatCurrency()` purely for localized display formatting.
- **Rationale**: JavaScript's IEEE 754 floating-point arithmetic is prone to rounding imprecision (e.g., `0.1 + 0.2 !== 0.3`). By never performing mathematical operations on financial numbers in the client, precision is guaranteed by the backend's `Decimal` rounding (`ROUND_HALF_UP`).

### 4. Reactive Calculation Strategy & Stale Request Protection
- **Decision**: When quote inputs change, the UI debounces calculation requests by 250ms and cancels any prior in-flight calculation requests using `AbortController`.
- **Rationale**: Rapid typing on seat counts or discounts could trigger overlapping HTTP requests. Without cancellation, an earlier, slower calculation response could arrive after a newer one and overwrite the correct totals. `AbortController` guarantees that only the latest user state is rendered.

### 5. Client-Side UX Validation vs. Backend Authoritative Validation
- **Decision**: The frontend performs minimal client-side validation for UX feedback (e.g. customer name required, seats >= 1, non-empty line items, positive quantities). If client validation fails, the UI disables submission and pauses calculations without calling the backend.
- **Rationale**: Prevents noisy, unnecessary 422 HTTP calls while typing. However, the backend still authoritatively validates every payload upon arrival and returns descriptive domain errors.

### 6. Local Draft Recovery (`localStorage`)
- **Decision**: Form inputs are automatically synchronized to `localStorage` under the key `deal-desk-quote-draft`. If the user navigates away or refreshes, their draft is restored with a clear notification and option to discard.
- **Rationale**: Protects sales representatives from losing in-progress quote configurations during long sales calls or accidental tab closures. Authoritative calculation results are never cached in `localStorage`; only editable inputs are persisted.

### 7. Frontend Testing Strategy
- **Decision**: Critical presentation utilities (`formatCurrency`, `formatPercentage`, `formatDateTime`) and API error encapsulation (`ApiError`) are verified using Node 22's native `node:test` runner with TypeScript type stripping (`--experimental-strip-types`).
- **Rationale**: Avoids adding heavy external testing libraries (such as Jest, Vitest, or Babel) to the lightweight Next.js project while verifying core data formatting and error handling. Full integration/E2E testing of the Next.js UI could be extended via Playwright in a subsequent phase.

---

## Phase 8: End-to-End Verification & Quality Hardening

### 1. Verification of Security and Trust Boundaries
- **Decision**: The backend enforces `model_config = ConfigDict(extra="forbid")` on `QuoteRequest`. Any attempt by a client or malicious caller to submit pre-computed financial fields (`unit_price`, `line_total`, `subtotal`, `discount_amount`, `total`, `approval_required`, `approval_reasons`) is rejected with HTTP 422 Unprocessable Content.
- **Rationale**: Client inputs must never override or influence the authoritative calculation engine. Calculations must be performed exclusively within `QuoteCalculationService`.

### 2. Live E2E Integration Testing via Native Node 22 Test Suite
- **Decision**: An automated end-to-end integration test suite (`frontend/tests/e2e_integration.test.ts`) verifies the live Next.js frontend on port 3000 and FastAPI backend on port 8000 across the complete 30-step sales representative workflow:
  - Catalog retrieval
  - Seat-bracket tier resolution across STARTER, GROWTH, and ENTERPRISE
  - Boundary discount limits and 400 rejection
  - Multi-policy approval triggers (discount > 15%, total > $25k, annual commitment + discount > 10%)
  - Quote persistence (POST /api/quotes), listing, detail inspection
  - Workflow status transitions (DRAFT → SUBMITTED → APPROVED)
  - Rejection of illegal transitions from terminal states
- **Rationale**: Guarantees system integration works end-to-end without requiring third-party browser automation frameworks.

### 3. Assessment of "SHOULD-BUILD" Features
- **Draft Recovery**: **IMPLEMENTED**. Persists incomplete form inputs in `localStorage` under `deal-desk-quote-draft`. Restores across reloads and clears upon successful quote creation.
- **Explain Pricing**: **IMPLEMENTED INLINE**. Every calculation and review response provides an explicit, deterministic breakdown of unit prices, line totals, subtotal, discount percentage, discount dollar amount, applicable tier, and an itemized list of policy triggers explaining why approval is required.
- **Quote Comparison**: **DELIBERATELY DEFERRED**. Building a side-by-side multi-quote diffing interface would increase UI surface area without improving the core requirements (calculation authority, quote persistence, and approval workflow). Documented for future iterations.

---

## Phase 9: Final UI Polish & UX Hardening

### 1. Replaced "Pre-Approved" Terminology
- **Decision**: Eliminated all occurrences of "Pre-Approved" wording across the application. Quotes that do not require Deal Desk escalation are now labeled **"No Approval Required"** accompanied by the supporting explanation: *"Pricing falls within standard sales representative authority."* Quotes requiring escalation are labeled **"Approval Required"**.
- **Rationale**: The project maintains two strictly orthogonal dimensions: `approval_required` (policy trigger) and `status` (lifecycle workflow state: `draft`, `submitted`, `approved`, `rejected`). Calling an unsubmitted draft quote "Pre-Approved" or "Approved" creates commercial ambiguity and contradicts enterprise quote governance rules.

### 2. Authoritative Approval Reasons Display
- **Decision**: Approval reasons are consumed exclusively from the backend calculation engine's `approval_reasons` array and displayed as clean bullet points in the `ApprovalBanner` and explanation panels.
- **Rationale**: The frontend must never duplicate policy evaluation rules. The backend remains the sole authoritative source for determining threshold violations (discount > 15%, total > $25,000, annual commitment + discount > 10%).

### 3. Dedicated "How was this calculated?" Explanation Panel
- **Decision**: Implemented `ExplainPricingPanel` (`frontend/components/ExplainPricingPanel.tsx`), an accessible, collapsible panel that organizes the backend calculation response:
  - Product line items breakdown (`{Quantity} × {Unit Price} = {Line Total}`)
  - Financial breakdown (`Subtotal`, `Discount (%)`, `Discount Amount`, `Final Total`)
  - Tier & Policy authority (`Applicable Tier`, `Maximum Discount for Tier`, `Approval Status`, and itemized `Approval Reasons`)
- **Rationale**: Provides clear visibility to sales reps into why specific discounts or totals triggered Deal Desk review without crowding the primary quote creation view.

### 4. Save Draft Validation Guidance
- **Decision**: Enhanced `QuoteSummaryCard` so that when `!canSave`, a concise guidance hint is rendered beneath the disabled Save Draft button displaying the immediate blocking validation reason (e.g. "Customer name is required.", "Quote must include at least one product.", "Requested discount exceeds maximum allowable discount").
- **Rationale**: Sales representatives immediately understand why saving is disabled without trial-and-error clicks, reusing the existing `validateQuoteForm()` and `canSave` state logic.

### 5. Products & Quantities UX Refinement
- **Decision**: Updated empty states with helpful iconography and instructional copy ("No products added yet. Add at least one product to calculate the quote."). On mobile screens (`<= 640px`), line item rows stack cleanly into a two-line layout (product selector spanning full width on top, quantity, price preview, and remove action on the bottom).

### 6. Accessibility & Responsive Hardening
- **Decision**:
  - Replaced inline `display: none` labels with standard accessible `.visually-hidden` / `.sr-only` styles to ensure full screen-reader compliance.
  - Added `aria-expanded` and `aria-controls` to the pricing explanation trigger.
  - Added `-webkit-overflow-scrolling: touch` and `max-width: 100%` on data table wrappers to prevent horizontal viewport clipping on mobile.
---

## Gemini Copilot Architecture (Phase 9.5)

### 1. Why Gemini was Added
Gemini is used as a natural-language explanation and advisory layer for the Deal Desk workflow. Sales representatives and deal desk analysts frequently need plain-language explanations of complex multi-variable commercial policies (such as how seat brackets affect allowable discounts, why a particular combination of annual commitment and discount triggered executive escalation, and what specific levers can be adjusted to unblock a quote). Gemini provides this contextual narrative interface.

### 2. Why Gemini is NOT the Pricing Authority
The FastAPI backend (`QuoteCalculationService`) remains authoritative for all financial calculations, product unit pricing, discount amounts, final totals, seat tier boundaries, and approval decisions.
- **Risk Mitigation**: Large Language Models are probabilistic and prone to hallucination or rounding inconsistencies. Under no circumstances should an LLM compute commercial transactions, totals, or approval decisions.
- **Strict Hierarchy**:
  ```text
  CATALOG (catalog.json)
        ↓
  QuoteCalculationService (FastAPI)
        ↓
  Authoritative Calculation Result
        ↓
  Gemini Service (Explanation Layer Only)
  ```
  Gemini is strictly downstream and receives trusted, verified facts from the pricing engine.

### 3. Why Gemini is Called from FastAPI Rather than the Browser
The Next.js frontend never contacts the Gemini API directly:
- **Security & Key Protection**: If the browser called Gemini directly, the Gemini API key would have to be shipped to the client (e.g. `NEXT_PUBLIC_GEMINI_API_KEY`), where it could be extracted by anyone inspecting network traffic or JavaScript bundles.
- **Enforced Authority**: Calling Gemini via FastAPI guarantees that the backend executes the authoritative calculation engine *before* Gemini receives context. For unsaved draft quotes (`POST /api/quotes/copilot`), the backend recalculates all totals server-side, preventing malicious clients from feeding fake totals or discounts to Gemini.

### 4. Why the API Key is Stored Only on the Backend
`GEMINI_API_KEY` is loaded exclusively from the server environment on Render/FastAPI via Pydantic `settings`.
- It is never exposed in client bundles or public endpoints.
- It is absent from version control (enforced via `.gitignore` and `.env.example` placeholders).
- Backend logs and exception handlers explicitly sanitize and mask authorization details.

### 5. Why Gemini Failures Do Not Block Quoting
Gemini is treated as an optional enhancement, not a core runtime dependency:
- If the Gemini API key is missing, invalid, rate-limited, times out, or returns an error, the core quoting engine continues operating normally.
- Pricing calculation, quote persistence, quote review, and status transitions remain 100% functional.
- The Copilot gracefully returns a friendly fallback message informing the user that the conversational layer is temporarily unavailable while highlighting that authoritative quote details remain visible.

### 6. Why Automated Tests Mock Gemini
Automated CI/CD test suites (`pytest` and `node:test`) mock `GeminiService` rather than making live external network calls:
- **Determinism**: Live LLM calls have non-deterministic response times and non-deterministic text generation.
- **Speed & Isolation**: Mocking ensures test suites run in under 2 seconds without external network dependencies.
- **Zero Cost & Rate Limit Immunity**: Automated tests never consume Gemini API quotas or incur charges.
- **Fallback Verification**: Mocking enables precise testing of error pathways (timeouts, 503s, invalid keys) without needing to simulate actual outages.

### 7. Why the What-If Simulator Does NOT Use Gemini
The What-If Quote Simulator is powered entirely by `POST /api/quotes/calculate`:
- **Instantaneous Real-Time Feedback**: Sales reps adjusting sliders or typing seat counts receive instant calculation feedback in < 50ms without LLM latency.
- **Mathematical Precision**: Scenario modeling requires exact arithmetic and rule validation (e.g. checking whether 10 seats unlocks the GROWTH tier or whether 10% discount on annual commitment triggers approval).
- **Zero Token Cost**: Modeling dozens of parameter permutations incurs zero API costs.
- **Safety**: What-If scenarios are never persisted automatically, ensuring draft and saved quotes remain intact.

### 8. Production Health Check & API URL Normalization
- **Public Health Route**: The backend exposes `GET /health` (along with `/health/`, `/api/health`, and `/`) returning `{"status": "ok"}` to satisfy cloud health checkers (Render, Vercel, uptime monitors).
- **Binding & Port**: Render dynamically allocates `$PORT` and expects services to bind to `0.0.0.0`. Uvicorn is configured via `run.py` and `render.yaml` to bind to `0.0.0.0:$PORT`.
- **CORS Configuration**: Supports explicit origins (`localhost:3000`, `https://deal-desk-quote-simulator.vercel.app`) as well as dynamic Vercel preview environments via regex (`^https://.*\.vercel\.app$`).
- **Defensive Frontend URL Construction**: Frontend API clients use `cleanBaseUrl` and `buildApiUrl` to strip erroneous trailing `/api` suffixes and avoid malformed paths like `/api/api/...` or double slashes `//`.

---

## Phase 9.6: Production Bug Fixes, Persistence Hardening & Gemini Copilot Repair

### 1. Three-State UI Model for Quote Evaluation (Issue 2 & Issue 4)
- **Decision**: The frontend quote builder and quote detail views implement an explicit three-state model for quote evaluation:
  1. **State A — Valid and No Approval Required**: Discount $\le$ tier maximum AND no Deal Desk approval rules triggered (`approval_required === false`). Renders `✓ No Approval Required`.
  2. **State B — Valid but Approval Required**: Discount $\le$ tier maximum AND one or more Deal Desk approval rules triggered (`approval_required === true`). Renders `⚠ Approval Required` with specific reasons (e.g., "Discount exceeds 15%").
  3. **State C — Invalid Quote**: Discount $>$ tier maximum (e.g. Growth 30% when tier maximum is 20%). Renders `✕ Invalid Quote` with actionable guidance ("Discount exceeds maximum allowed discount for tier GROWTH. Reduce discount to 20% or below.").
- **Critical Invariant**: An invalid quote **never** displays "No Approval Required" or "Approval Required". The calculation state is cleared on validation rejection (`setCalculation(null)`), preventing stale calculation objects from displaying false approval decisions.
- **Visual Separation in Tier Indicator**: `TierIndicator` explicitly displays both the tier maximum and current utilization (`30% / 30% - Within tier limit` vs `30% / 20% - Exceeds tier limit`). This completely separates tier limit enforcement from Deal Desk approval threshold triggers. Enterprise 30% is clearly within tier limits (`✓ Within tier limit`), while triggering governance review under the separate policy (`Discount exceeds 15%`).

### 2. Ephemeral Storage Reality & Persistence Hardening (Issue 3)
- **Decision**: Honestly document that Render's free-tier web services operate on an ephemeral container filesystem. Inactivity spin-downs (after 15 minutes) or service redeploys destroy runtime disk writes to `quotes.json`.
- **Architectural Safeguards Implemented**:
  1. **Configurable Persistence Path**: Added `QUOTES_STORAGE_PATH` setting to `app/core/config.py` and `QuoteRepository._resolve_path()`. In environments with persistent disks (e.g. Docker volumes, Render Persistent Disk mounts, or local directories), persistence is redirected without code modifications.
  2. **HTTP Cache Invalidation**: Added strict anti-caching headers (`Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`) to `GET /api/quotes` and `GET /api/quotes/{id}` to ensure browsers and edge CDNs never serve stale quote lists.
  3. **Single Source of Truth**: The frontend saved quotes list (`/quotes`) fetches exclusively from the backend API. LocalStorage is strictly relegated to draft recovery on the quote creation form (`/`).
  4. **Production Migration Path**: Documented that PostgreSQL (via SQLAlchemy or asyncpg) is the industry-standard persistence layer for production deployments requiring multi-instance scaling and durable retention across restarts.

### 3. Gemini Copilot Resiliency & Model Fallback (Issue 1)
- **Decision**: Updated default Gemini model to `gemini-3.5-flash-lite` and implemented automatic runtime fallback in `GeminiService`.
- **Rationale**:
  - `gemini-2.5-flash` experienced HTTP 429 rate limit / quota exhaustion and HTTP 503 high-demand errors on Google Generative AI v1beta endpoints.
  - Probing confirmed that `gemini-3.5-flash-lite` has active quota, lower latency, and robust availability.
  - If the primary configured model returns HTTP 404, 429, or 503, `GeminiService` automatically retries with `gemini-3.5-flash-lite` before falling back to the graceful error response.
  - Added safe diagnostic endpoint `GET /api/quotes/copilot/status` exposing `configured: bool` and `model: str` without ever revealing the private `GEMINI_API_KEY`.
  - HTTP client timeout increased from 10.0s to 15.0s to accommodate peak LLM generation latency without throwing client-side abort errors.
