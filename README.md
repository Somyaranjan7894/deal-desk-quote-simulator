# Deal Desk Quote Simulator

## Overview

The **Deal Desk Quote Simulator** is an enterprise sales quoting and governance platform designed for sales representatives and Deal Desk analysts. It enables sales teams to configure customer proposals, evaluate seat-bracketed pricing tiers, test pricing scenarios in real time, and request approvals based on deterministic financial rules and AI-assisted governance intelligence.

All financial logic, tier calculations, and approval policies are **authoritative on the backend**, ensuring absolute pricing integrity.

---

## Features

- **Authoritative Quote Simulation**: Real-time calculation of line items, subtotals, tier discount ceilings, and net totals powered by backend pricing engines.
- **Deal Health Indicator**: Compact, deterministic health metrics evaluating completeness, discount margins, annual commitment terms, and approval risk.
- **What-If Scenario Sandbox**: Interactive sandbox allowing sales reps to simulate alternative seat tiers, discount percentages, and annual contracts without mutating active quotes or consuming AI tokens.
- **Deal Desk Copilot**: Gemini-powered natural-language assistant providing executive summaries, pricing breakdowns, and approval rule explanations strictly from verified backend calculation data.
- **Quote Lifecycle Management**: State machine workflow supporting `DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `APPROVED` / `REJECTED` transitions with terminal state enforcement.
- **Deterministic Approval Rules**: Automatically triggers Deal Desk review when:
  - Requested discount exceeds 15%
  - Total quote value exceeds $25,000
  - Annual commitment is selected with discount exceeding 10%

---

## Architecture

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Vanilla CSS Design System (Zero UI library bloat)
- **Backend**: Python 3.11, FastAPI, Pydantic v2, Uvicorn
- **AI Intelligence**: Google Gemini (`gemini-3.5-flash-lite` with automated fallback), strictly backend-isolated via `httpx`
- **Data Source**: Immutable catalog source (`data/catalog.json`)
- **Target Deployment**: Vercel (Frontend Free Tier) + Render (Backend Web Service Free Tier)

```text
Browser Client (Desktop & Mobile)
       │
       │ HTTPS
       ▼
Vercel Edge (Next.js 14 Frontend)
       │
       │ REST API (NEXT_PUBLIC_API_URL)
       ▼
Render Free Tier (FastAPI Backend) ◄─── GEMINI_API_KEY (Backend Secret Only)
       │
       ├── Authoritative Pricing Engine (data/catalog.json)
       ├── JSON Persistence Layer (backend/data/quotes.json)
       │
       ▼ HTTPS
Google Gemini API (gemini-3.5-flash-lite)
```

---

## Local Development

### 1. Prerequisites
- **Node.js**: v18.18+ or v20+ / v22+
- **Python**: v3.10+
- **npm**: v9+

### 2. Backend Setup
From the project root:
```bash
# Create and activate Python virtual environment
python -m venv backend/.venv

# Windows (PowerShell):
.\backend\.venv\Scripts\Activate.ps1
# macOS / Linux:
source backend/.venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start FastAPI development server
uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```
Backend API starts at `http://127.0.0.1:8000` (Docs: `http://127.0.0.1:8000/docs`).

### 3. Frontend Setup
In a new terminal window from the project root:
```bash
cd frontend
npm install
npm run dev
```
Frontend application opens at `http://localhost:3000`.

---

## Environment Variables

Copy the provided `.env.example` to `.env` (or configure in cloud platform dashboards):

### Backend (`backend/.env` or Render Dashboard)
```env
# Server Configuration
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:3000

# Catalog Source Path
CATALOG_PATH=../data/catalog.json

# Gemini AI Copilot (Backend ONLY - NEVER expose to frontend)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### Frontend (`frontend/.env.local` or Vercel Dashboard)
```env
# Backend API Base URL (no trailing slash)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Security Rule**: `GEMINI_API_KEY` must **never** be prefixed with `NEXT_PUBLIC_` or placed in frontend configuration files.

---

## Deployment

Detailed instructions are available in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Render (FastAPI Backend Free Tier)
- **Runtime**: Python 3
- **Build Command**: `pip install -r backend/requirements.txt`
- **Start Command**: `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
- **Health Check Path**: `/health`
- **Environment Variables**:
  - `PYTHON_VERSION`: `3.11.9`
  - `GEMINI_API_KEY`: `<your_gemini_api_key>`
  - `GEMINI_MODEL`: `gemini-2.5-flash`
  - `CORS_ORIGINS`: `http://localhost:3000,https://<your-vercel-domain>.vercel.app`

### Vercel (Next.js Frontend Free Tier)
- **Framework Preset**: Next.js
- **Root Directory**: `frontend`
- **Build Command**: `next build`
- **Output Directory**: `.next`
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: `https://<your-render-service>.onrender.com`

---

## API Overview

All API endpoints are mounted under `/api` (plus the `/health` root check):

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Lightweight service health probe (`{"status": "ok"}`) |
| `GET` | `/api/catalog` | Authoritative pricing tiers, seat rules, and products |
| `POST` | `/api/quotes/calculate` | Stateless authoritative calculation of pricing & approvals |
| `POST` | `/api/quotes` | Creates and persists a quote in `DRAFT` status |
| `GET` | `/api/quotes` | Lists all saved quotes |
| `GET` | `/api/quotes/{id}` | Retrieves a saved quote by unique ID |
| `PATCH`| `/api/quotes/{id}/status` | Updates quote lifecycle status (`submitted`, `approved`, `rejected`) |
| `POST` | `/api/quotes/copilot` | Copilot explanation for unsaved draft quotes |
| `POST` | `/api/quotes/{id}/copilot`| Copilot explanation for saved quotes |

---

## Testing

### Backend Test Suite (Pytest)
```bash
# Run 109 automated backend tests
.\backend\.venv\Scripts\python.exe -m pytest backend/tests -v
```

### Frontend Test Suite (Node.js Test Runner)
```bash
# Run unit & live integration tests (55 passing tests)
npm --prefix frontend test

# Run TypeScript type verification
npm --prefix frontend run typecheck

# Run Next.js production build verification
npm --prefix frontend run build
```

---

## Security

1. **Backend-Only AI Key**: The Google Gemini API key is maintained strictly on the FastAPI server environment. The client browser never receives, queries, or logs the key.
2. **Untrusted Input Sanitation**: All user inquiries to Copilot are passed within hardened prompt enclosures instructing the LLM to adhere strictly to backend pricing facts and reject unauthorized discount prompts.
3. **Graceful Degradation**: If `GEMINI_API_KEY` is missing or the Gemini API is unreachable, Copilot returns an informative fallback message. Core quote calculation and approval flows operate with 100% availability.
4. **Authoritative Boundaries**: Calculations cannot be overridden by frontend inputs. The backend rejects discounts above tier ceilings with HTTP 400.
5. **No Secret Leaks**: Exception handlers mask file paths and stack traces from production responses.

---

## Project Structure

```text
deal-desk-quote-simulator/
├── frontend/                     # Next.js 14 App Router Frontend
│   ├── app/                      # Routes: /, /quotes, /quotes/[id], globals.css
│   ├── components/               # QuoteBuilder, DealHealth, WhatIfSimulator, Copilot
│   ├── lib/                      # API client, validation, formatters, storage
│   ├── types/                    # Domain TypeScript interfaces
│   └── tests/                    # Unit, layout, and E2E integration test suites
├── backend/                      # FastAPI Python Service
│   ├── app/
│   │   ├── api/                  # Routes (/catalog, /quotes) & dependency injection
│   │   ├── core/                 # Settings (config.py) & domain exceptions
│   │   ├── repositories/         # Catalog & quotes JSON data access
│   │   ├── schemas/              # Pydantic v2 domain schemas
│   │   └── services/             # Calculation engine, quote service, Gemini service
│   ├── requirements.txt          # Python dependencies
│   └── tests/                    # 109 unit, calculation, and API test suites
├── data/
│   └── catalog.json              # Immutable assessment source catalog (SHA256 verified)
├── docs/
│   └── DEPLOYMENT.md             # Complete Vercel + Render deployment runbook
├── render.yaml                   # Render Blueprint Infrastructure-as-Code
├── .env.example                  # Environment configuration template
├── .gitignore                    # Git exclusions
├── DECISIONS.md                  # Architectural decisions log
└── README.md                     # Project documentation
```

---

## Source Data Integrity

The file `data/catalog.json` contains the currency, seat-based discount rules, and product catalog supplied with the assessment.

> **IMMUTABLE DATA CONTRACT**:  
> The backend treats `data/catalog.json` as the authoritative source of truth. The SHA-256 hash `97DA1F6EF1DC312AB26BEEB99960AF0BEE7185E739420BA6CA06D50A52FEB4C8` is strictly verified. Product prices and discount rules are never hardcoded in client code.


## Backend Setup & Execution

### 1. Create Virtual Environment & Install Dependencies

From the project root:

```bash
# Create virtual environment
python -m venv backend/.venv

# Activate virtual environment
# Windows (PowerShell):
.\backend\.venv\Scripts\Activate.ps1
# Linux / macOS:
source backend/.venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 2. Run Backend Development Server

```bash
# From project root using the virtual environment python:
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The backend starts at `http://127.0.0.1:8000`.  
Interactive Swagger API docs are available at `http://127.0.0.1:8000/docs`.

### 3. Run Backend Test Suite

```bash
.\backend\.venv\Scripts\pytest.exe backend/tests -v
```

---

## Frontend Setup & Execution

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

The frontend application starts at `http://localhost:3000`.

### 3. Run TypeScript Validation & Build

```bash
npm run typecheck
npm run build
```

---

## Backend API Endpoints

All API endpoints are mounted under the `/api` prefix (except `/health`).

### 1. Health Check
- **`GET /health`**
- **Status**: `200 OK`
- **Response**:
  ```json
  {
    "status": "ok"
  }
  ```

---

### 2. Product Catalog
- **`GET /api/catalog`**
- **Status**: `200 OK`
- **Description**: Returns the authoritative currency, seat-based discount rules, and product catalog.
- **Example Response**:
  ```json
  {
    "currency": "USD",
    "discount_rules": [
      {
        "code": "STARTER",
        "min_seats": 1,
        "max_seats": 9,
        "max_discount_pct": "10"
      },
      {
        "code": "GROWTH",
        "min_seats": 10,
        "max_seats": 49,
        "max_discount_pct": "20"
      },
      {
        "code": "ENTERPRISE",
        "min_seats": 50,
        "max_seats": 99999,
        "max_discount_pct": "30"
      }
    ],
    "products": [
      {
        "sku": "AGENT-CORE",
        "name": "Agent Core",
        "unit_price": "120"
      },
      {
        "sku": "AGENT-ANALYTICS",
        "name": "Agent Analytics",
        "unit_price": "80"
      },
      {
        "sku": "AGENT-AUTOMATE",
        "name": "Agent Automate",
        "unit_price": "150"
      },
      {
        "sku": "ONBOARDING",
        "name": "Implementation",
        "unit_price": "2500"
      }
    ]
  }
  ```

---

### 3. Quote Calculation (Stateless)
- **`POST /api/quotes/calculate`**
- **Status**: `200 OK`
- **Description**: Authoritatively calculates pricing, tier matching, discount amount, final total, and deal desk approval reasons without persisting the quote.
- **Example Request Body**:
  ```json
  {
    "customer_name": "Acme Corporation",
    "seats": 50,
    "line_items": [
      {
        "sku": "ONBOARDING",
        "quantity": 10
      },
      {
        "sku": "AGENT-CORE",
        "quantity": 5
      }
    ],
    "discount_pct": 16.0,
    "annual_commitment": true
  }
  ```
- **Example Successful Response (`200 OK`)**:
  ```json
  {
    "customer_name": "Acme Corporation",
    "seats": 50,
    "tier": "ENTERPRISE",
    "discount_pct": "16",
    "annual_commitment": true,
    "subtotal": "25600.00",
    "discount_amount": "4096.00",
    "total": "21504.00",
    "approval_required": true,
    "approval_reasons": [
      "Discount exceeds 15%",
      "Annual commitment with discount above 10%"
    ],
    "line_items": [
      {
        "sku": "ONBOARDING",
        "quantity": 10,
        "name": "Implementation",
        "product_name": "Implementation",
        "unit_price": "2500.00",
        "line_total": "25000.00"
      },
      {
        "sku": "AGENT-CORE",
        "quantity": 5,
        "name": "Agent Core",
        "product_name": "Agent Core",
        "unit_price": "120.00",
        "line_total": "600.00"
      }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Business rule violations (e.g. discount exceeds tier maximum).
    ```json
    {
      "detail": "Requested discount 15% exceeds maximum allowable discount 10% for tier 'STARTER'."
    }
    ```
  - `404 Not Found`: Product SKU not in catalog.
    ```json
    {
      "detail": "Product with SKU 'UNKNOWN-SKU' not found in catalog."
    }
    ```
  - `422 Unprocessable Content`: Structural schema validation failure (e.g. `seats < 1`, empty line items, negative quantities, missing required fields).

---

### 4. Create and Save Quote
- **`POST /api/quotes`**
- **Status**: `201 Created`
- **Description**: Authoritatively calculates pricing, generates a unique UUID, assigns initial status `DRAFT`, records UTC ISO-8601 timestamps, and saves the quote to JSON storage. Client cannot submit arbitrary prices or totals.
- **Request Body**: Same schema as `POST /api/quotes/calculate`.
- **Example Response (`201 Created`)**:
  ```json
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "customer_name": "Acme Corporation",
    "seats": 50,
    "tier": "ENTERPRISE",
    "discount_pct": "16",
    "annual_commitment": true,
    "subtotal": "25600.00",
    "discount_amount": "4096.00",
    "total": "21504.00",
    "approval_required": true,
    "approval_reasons": [
      "Discount exceeds 15%",
      "Annual commitment with discount above 10%"
    ],
    "status": "DRAFT",
    "created_at": "2026-10-07T14:30:00Z",
    "updated_at": "2026-10-07T14:30:00Z",
    "line_items": [
      {
        "sku": "ONBOARDING",
        "quantity": 10,
        "name": "Implementation",
        "product_name": "Implementation",
        "unit_price": "2500.00",
        "line_total": "25000.00"
      },
      {
        "sku": "AGENT-CORE",
        "quantity": 5,
        "name": "Agent Core",
        "product_name": "Agent Core",
        "unit_price": "120.00",
        "line_total": "600.00"
      }
    ]
  }
  ```

---

### 5. List Quotes
- **`GET /api/quotes`**
- **Status**: `200 OK`
- **Description**: Returns all saved quotes from JSON storage, sorted newest first (`created_at` descending).
- **Example Response (`200 OK`)**:
  ```json
  [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "customer_name": "Acme Corporation",
      "seats": 50,
      "tier": "ENTERPRISE",
      "status": "DRAFT",
      "total": "21504.00",
      "approval_required": true,
      "created_at": "2026-10-07T14:30:00Z",
      "updated_at": "2026-10-07T14:30:00Z"
    }
  ]
  ```

---

### 6. Get Quote by ID
- **`GET /api/quotes/{id}`**
- **Status**: `200 OK`
- **Description**: Retrieves a single saved quote by its UUID.
- **Error Responses**:
  - `404 Not Found`: When the quote ID does not exist in storage:
    ```json
    {
      "detail": "Quote with ID '3fa85f64-5717-4562-b3fc-2c963f66afa6' not found."
    }
    ```

---

### 7. Update Quote Status
- **`PATCH /api/quotes/{id}/status`**
- **Status**: `200 OK`
- **Description**: Transitions the workflow status of an existing quote, enforcing the authoritative Deal Desk state machine.
- **Example Request Body**:
  ```json
  {
    "status": "SUBMITTED"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Disallowed transition (e.g. attempting to approve a `DRAFT` directly, or mutating terminal `APPROVED` / `REJECTED` quotes):
    ```json
    {
      "detail": "Invalid status transition from 'DRAFT' to 'APPROVED'. Allowed transitions from 'DRAFT': SUBMITTED."
    }
    ```
  - `404 Not Found`: Quote ID does not exist in storage.
### 8. Deal Desk Copilot (Unsaved Draft Quote)
- **`POST /api/quotes/copilot`**
- **Status**: `200 OK`
- **Description**: Evaluates unpersisted draft quote inputs authoritatively through `QuoteCalculationService` first, constructs trusted pricing context, and prompts Gemini for natural-language explanations. Client cannot inject fabricated numbers or bypass backend business calculations.
- **Request Body**:
  ```json
  {
    "quote": {
      "customer_name": "Acme Corporation",
      "seats": 25,
      "line_items": [
        { "sku": "AGENT-CORE", "quantity": 10 }
      ],
      "discount_pct": 18.0,
      "annual_commitment": true
    },
    "message": "Why does this quote require Deal Desk approval?",
    "action": "why_approval"
  }
  ```
- **Response**:
  ```json
  {
    "answer": "This quote requires approval for two reasons: the 18% discount exceeds the standard 15% threshold, and annual commitment with a discount over 10% requires executive approval.",
    "quote_id": null,
    "model": "gemini-2.5-flash",
    "generated": true
  }
  ```

---

### 9. Deal Desk Copilot (Persisted Quote)
- **`POST /api/quotes/{id}/copilot`**
- **Status**: `200 OK`
- **Description**: Retrieves authoritative saved quote by ID from storage, formats trusted financial facts, and invokes Gemini for contextual advice.
- **Request Body**:
  ```json
  {
    "message": "Summarize this deal for my manager.",
    "action": "summarize_deal"
  }
  ```
- **Response**:
  ```json
  {
    "answer": "Deal Summary:\nCustomer: Acme Corporation\nSeats: 25 (GROWTH tier)\nSubtotal: $1,000.00 | Discount: 18% ($180.00)\nTotal: $820.00\nApproval: Required (Discount > 15%, Annual > 10%)",
    "quote_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "model": "gemini-2.5-flash",
    "generated": true
  }
  ```

---


## Quote Lifecycle & State Machine

Quotes move through an explicit, safe state machine:

```text
[ DRAFT ] ────────► [ SUBMITTED ] ────────┬───────► [ APPROVED ]
                                          │
                                          └───────► [ REJECTED ]
```

- **`DRAFT`**: Initial status when created via `POST /api/quotes`.
- **`SUBMITTED`**: Sales representative formally submits quote for review.
- **`APPROVED`**: Deal desk approves quote (terminal state; immutable).
- **`REJECTED`**: Deal desk rejects quote (terminal state; immutable).
- **Decoupled Approval Rule**: `approval_required` is an authoritative rule evaluation flag indicating whether Deal Desk intervention is needed; `status` represents the current operational workflow state.

---

## Quote Persistence Architecture

- **Storage Location**: `backend/data/quotes.json` (created automatically on first write, git-ignored).
- **Atomic Writes**: Writes are written to a temporary sibling file (`backend/data/quotes.json.tmp`) and then atomically replaced using `os.replace` / `Path.replace`. This prevents corruption if a process crashes mid-write.
- **Historical Immutability**: All calculated financial attributes (`unit_price`, `line_total`, `subtotal`, `discount_amount`, `total`, `approval_required`, `approval_reasons`) are permanently embedded in the saved record. Subsequent updates to `data/catalog.json` do not mutate historical quotes.
- **Safety**: If the persistence file contains corrupted JSON, `QuoteStorageCorruptedError` is raised with HTTP 500 rather than silently overwriting and destroying historical data.

---

## Frontend Application Architecture (Phase 7)

The frontend is a modern Next.js 14 App Router application written in TypeScript that connects directly to the FastAPI service via HTTP.

### Architecture Flow
```text
User Interaction
       ↓
React State (Debounced 250ms)
       ↓
Typed API Client (lib/api.ts + AbortController)
       ↓  HTTP / JSON
FastAPI Service (/api/quotes/calculate, /api/quotes)
       ↓
Domain Services (authoritative calculation & approval evaluation)
       ↓  JSON Response
React UI Rendering
```

### Frontend Routes
1. **`GET /` (Quote Builder)**:
   - Interactive configuration: Customer name, seat count, dynamic product line items, discount percentage, annual commitment.
   - Live seat tier indicator (`STARTER`, `GROWTH`, `ENTERPRISE`) reflecting catalog rules.
   - Real-time reactive calculation preview querying `POST /api/quotes/calculate`.
   - Stale request & race-condition protection via `AbortController`.
   - Local draft persistence: Form inputs auto-saved to `localStorage` (`deal-desk-quote-draft`) and restorable across sessions.
   - Authoritative save action via `POST /api/quotes` redirecting to quote review.
2. **`GET /quotes` (Saved Quotes Workspace)**:
   - Tabular overview of all persisted customer quotes with customer name, seats, tier, total, status badges, and approval indicators.
   - Dynamic search by customer name or quote ID.
   - Filter by quote lifecycle status (`Draft`, `Submitted`, `Approved`, `Rejected`).
   - Direct link to individual quote review.
3. **`GET /quotes/[id]` (Quote Review & Deal Desk Workflow)**:
   - Detailed inspection: Commercial terms, line items breakdown (quantity, unit price, line total), financial summary (subtotal, discount amount, final total).
   - Prominent Deal Desk approval banner highlighting triggered policy rules.
   - Authoritative status actions enforcing the state machine:
     - `DRAFT`: **[ Submit for Approval ]** $\rightarrow$ `SUBMITTED`
     - `SUBMITTED`: **[ Approve Quote ]** $\rightarrow$ `APPROVED` or **[ Reject Quote ]** $\rightarrow$ `REJECTED`
     - `APPROVED` / `REJECTED`: Terminal states with read-only badges.

### Frontend Testing
To run the native unit and E2E integration test suite (covering formatters, API client, form validation, and full live user workflows):
```bash
npm --prefix frontend test
```
To run the TypeScript typecheck:
```bash
npm --prefix frontend run typecheck
```
To run the production build:
```bash
npm --prefix frontend run build
```

---

## Project Status & Implementation Roadmap

- [x] **Phase 1: Project Foundation & Architecture Setup**
- [x] **Phase 2: Backend Domain Modeling & Validation**
- [x] **Phase 3: Catalog Repository & Catalog Service**
- [x] **Phase 4: Authoritative Quote Calculation Engine**
- [x] **Phase 5: FastAPI HTTP API Layer**
- [x] **Phase 6: Quote Persistence & Review Lifecycle**
- [x] **Phase 7: Frontend Quote Builder & Review UI**
- [x] **Phase 8: End-to-End Verification, Testing & Quality Hardening**
- [x] **Phase 9: Final UI Polish & UX Hardening**

### Phase 9 UI Polish Highlights:
- **Clear Governance Terminology**: Removed "Pre-Approved" wording; replaced with "No Approval Required" (*"Pricing falls within standard sales representative authority."*) and "Approval Required".
- **Deterministic Pricing Breakdown**: Added "How was this calculated?" (`ExplainPricingPanel`) showing authoritative line item math, subtotal, discount, total, tier, tier discount maximums, and approval triggers.
- **Save Draft Guidance**: Rendered inline contextual validation feedback near the disabled Save Draft button.
- **Accessibility & Mobile Layout**: Screen-reader accessible input labels, responsive touch scrolling on tables, two-line mobile grid for line item configuration, and viewport safety across 375px–1440px.

---

## Phase 9.5 — Gemini Deal Desk Copilot & What-If Simulator

Phase 9.5 enhances the Deal Desk Quote Simulator with an enterprise-grade AI Copilot powered by Google Gemini, an interactive real-time What-If scenario sandbox, and a deterministic Deal Health assessment engine.

### Deal Desk Copilot Architecture

The Deal Desk Copilot uses Gemini to provide contextual natural-language explanations of quote pricing, discount rules, and approval requirements.

All financial calculations and approval decisions remain authoritative in the FastAPI backend. Gemini receives the trusted calculation result and acts only as an explanation layer.

```text
Browser / Next.js
       │
       │ HTTP (POST /api/quotes/copilot or /api/quotes/{id}/copilot)
       ▼
FastAPI Backend
       │
       ├── Authoritative Quote Calculation (QuoteCalculationService)
       │
       └── Gemini Service
                 │
                 ▼  (Backend HTTPS via httpx)
             Gemini API
                 │
                 ▼
       Natural-language explanation
                 │
                 ▼
Browser / Next.js
```

#### Core Architectural Guarantees:
1. **FastAPI Sole Pricing Authority**: Gemini NEVER calculates product prices, subtotals, discount amounts, totals, seat tiers, or approval triggers. Those are computed strictly by `QuoteCalculationService` in Python.
2. **Backend-Only Gemini Integration**: The browser NEVER communicates with Gemini directly. The Gemini API key is never exposed to the client or embedded in JavaScript bundles (`GEMINI_API_KEY` is strictly a backend environment variable; `NEXT_PUBLIC_GEMINI_API_KEY` is prohibited).
3. **Graceful Fallback**: If `GEMINI_API_KEY` is unconfigured or Gemini is unreachable, the core application continues working seamlessly. Quoting, calculations, validations, drafts, and approval workflows are 100% unaffected.
4. **Prompt Injection Protection**: User inquiries are treated as untrusted input. The backend enforces strict system instructions preventing prompt overrides, ensuring Gemini never promises unauthorized discounts or alters quote facts.

#### Copilot Capabilities:
- **Why approval?**: Explains the exact governing rules triggered (e.g. discount > 15%, annual commitment with discount > 10%, or total > $25,000) using verified backend data.
- **Explain pricing**: Provides a clear narrative breakdown of products, quantities, catalog unit prices, subtotal, applied discount, and final total.
- **What can I change?**: Informs sales reps of maximum tier discounts, boundary rules, and paths to optimize commercial terms.
- **Summarize deal**: Generates an executive summary suitable for deal desk managers.
- **Free-text questions**: Answers specific rep questions within strict governance guidelines.

#### Configuration (Render Backend)
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### What-If Quote Simulator
The What-If Quote Simulator allows sales reps to model pricing scenarios (seats, discounts, annual commitment) in real time:
- Calls `POST /api/quotes/calculate` directly for every scenario preview.
- Never calls Gemini for scenario calculations (100% deterministic and instantaneous).
- Never saves scenarios automatically (prominently badged `SCENARIO PREVIEW — NOT SAVED`).
- Provides a `[Reset to Current Quote]` action to restore base values.
- Includes an optional `[Apply Scenario to Form]` action on the Quote Builder.

### Deterministic Deal Health
A compact overview panel evaluating pricing completeness, discount threshold risk, Deal Desk approval status, and annual commitment terms. It uses transparent, explainable business rules rather than speculative AI risk scores.

---

## Phase 9.6 — Production Bug Fixes, Persistence Hardening & Gemini Copilot Repair

Phase 9.6 resolves critical production issues identified after initial cloud deployment, hardens persistence architecture, and restores Gemini Copilot functionality.

### 1. Issue 1 — Gemini Copilot Repair & Fallback
- **Root Cause**: `gemini-2.5-flash` returned HTTP 429 quota exhaustion and 503 high-demand errors on Google Generative AI v1beta endpoints. The backend lacked automated model fallback and client timeout was too short (10.0s).
- **Fix**:
  - Upgraded default model to `gemini-3.5-flash-lite`.
  - Added automated retry/fallback to `gemini-3.5-flash-lite` in `GeminiService` if the primary model returns 404, 429, or 503.
  - Increased HTTP client timeout to 15.0s.
  - Added safe diagnostic endpoint `GET /api/quotes/copilot/status` (exposes only `{"configured": true, "model": "gemini-3.5-flash-lite"}` without leaking secrets).

### 2. Issue 2 — Enterprise Discount Warning Repair
- **Root Cause**: The UI lacked clear distinction between **Tier Maximums** (Enterprise allows up to 30%) and **Approval Thresholds** (discounts > 15% require Deal Desk review). Users entering 30% were confused when the approval banner stated "Discount exceeds 15%", interpreting it as a tier violation.
- **Fix**:
  - Enhanced `TierIndicator` with an explicit tier limit comparison strip: `Current Tier: ENTERPRISE | Maximum Discount: 30% | 30% / 30% (✓ Within tier limit)`.
  - Enterprise 30% is clearly marked as valid within the tier cap, while correctly requiring approval under the separate >15% governance policy.

### 3. Issue 3 — Persistence Hardening & Ephemeral Reality
- **Root Cause**: Render free-tier web services spin down after 15 minutes of inactivity and redeploy onto fresh container filesystems. Runtime disk writes to `quotes.json` do not survive container rebuilds or multi-hour sleep cycles. Furthermore, `QuoteRepository` had no environment variable path override, and quote GET requests lacked anti-caching headers.
- **Fix**:
  - Added `QUOTES_STORAGE_PATH` configuration in `backend/app/core/config.py` and `QuoteRepository._resolve_path()` to support mounted persistent storage.
  - Added HTTP anti-caching headers (`Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`) to `GET /api/quotes` and `GET /api/quotes/{id}`.
  - Confirmed the frontend saved quotes list (`/quotes`) fetches directly from the backend API as the single source of truth (localStorage is strictly for draft form recovery).
  - Added `backend/tests/test_persistence_lifecycle.py` testing quote survival across separate repository and service object lifetimes.
  - Clearly documented that PostgreSQL is the production migration path for durable multi-instance cloud deployments.

### 4. Issue 4 — Growth 30% Invalid Quote Handling
- **Root Cause**: When an invalid discount was entered (e.g., Growth tier with 30% discount, exceeding the 20% tier cap), the backend calculation endpoint rejected the request with HTTP 400 (`DiscountExceedsTierMaximumError`). In the frontend, the `catch` block set `calculationError` but failed to clear `calculation` (`setCalculation(null)`). The UI retained the previous calculation where `approval_required === false`, erroneously displaying "No Approval Required".
- **Fix**:
  - Implemented an explicit three-state model:
    - **Valid + No Approval**: `✓ No Approval Required`
    - **Valid + Approval Required**: `⚠ Approval Required` (with reasons)
    - **Invalid Quote**: `✕ Invalid Quote` (with error message: *"Discount exceeds maximum allowed discount for tier GROWTH. Reduce discount to 20% or below."*)
  - Explicitly cleared calculation state (`setCalculation(null)`) on validation rejection.
  - Updated `ApprovalBanner` to render `✕ Invalid Quote` with guidance when `status="invalid"`. Invalid quotes **never** display "No Approval Required" or "Approval Required".



