# Deployment Guide: Deal Desk Quote Simulator

This guide provides end-to-end instructions for deploying the **Deal Desk Quote Simulator** to free-tier cloud platforms:
- **Backend API**: [Render](https://render.com/) (Web Service - Free Tier)
- **Frontend App**: [Vercel](https://vercel.com/) (Next.js - Free Tier)
- **AI Intelligence**: [Google Gemini API](https://ai.google.dev/) (Free Tier key)

---

## 1. Architecture & Security Model

```text
Browser Client
     │
     │ HTTPS
     ▼
Vercel (Next.js Frontend)
     │
     │ HTTPS (NEXT_PUBLIC_API_URL)
     ▼
Render (FastAPI Backend) ◄─── GEMINI_API_KEY (Backend-Only Secret)
     │
     │ HTTPS
     ▼
Google Gemini API (gemini-2.5-flash)
```

### Security Invariants:
1. **Gemini API Key Backend-Only**: `GEMINI_API_KEY` is exclusively configured on the Render backend service. It is **never** sent to the frontend, never prefixed with `NEXT_PUBLIC_`, and never logged or exposed in API errors.
2. **Backend Authoritative**: All quote calculations, tier determinations, maximum discount enforcement, and approval rules execute strictly on the FastAPI backend.
3. **CORS Restricted**: The Render backend CORS policy explicitly allows the Vercel production domain and local development (`http://localhost:3000`).

---

## 2. Step 1: Deploy Backend to Render (Free Tier)

### Option A: Automatic via `render.yaml` Blueprint
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository: `https://github.com/Somyaranjan7894/deal-desk-quote-simulator.git`.
4. Render detects `render.yaml` automatically.
5. In the environment variables prompt, enter your `GEMINI_API_KEY`.
6. Click **Apply**.

### Option B: Manual Web Service Setup
1. In Render, click **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository.
3. Configure the following service settings:
   - **Name**: `deal-desk-quote-simulator-api`
   - **Region**: Closest to you (e.g., Oregon, Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: Leave empty (root)
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. Expand **Advanced** and set:
   - **Health Check Path**: `/health`
5. Under **Environment Variables**, add:
   - `PYTHON_VERSION`: `3.11.9`
   - `GEMINI_API_KEY`: `<your_actual_gemini_api_key>`
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `CORS_ORIGINS`: `http://localhost:3000,https://<your-vercel-app-name>.vercel.app`
6. Click **Create Web Service**.
7. Wait for deployment to complete. Once deployed, copy your Render URL:
   `https://<your-render-service>.onrender.com`
8. Verify health endpoint in your browser or curl:
   ```bash
   curl https://<your-render-service>.onrender.com/health
   # Expected response: {"status":"ok"}
   ```

*Note on Free Tier Cold Starts: Render free-tier services spin down after 15 minutes of inactivity. The first request after sleep may take ~30–50 seconds to wake up.*

---

## 3. Step 2: Deploy Frontend to Vercel (Free Tier)

1. Log in to your [Vercel Dashboard](https://vercel.com/).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import your GitHub repository: `deal-desk-quote-simulator`.
4. Configure the project:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click **Edit** and select `frontend`.
   - **Build Command**: `next build` (default)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)
5. Expand **Environment Variables** and add:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://<your-render-service>.onrender.com` (your actual Render backend URL without trailing slash)
6. Click **Deploy**.
7. After deployment finishes, copy your assigned Vercel URL:
   `https://<your-app-name>.vercel.app`

---

## 4. Step 3: Update Backend CORS on Render

Now that you have your final Vercel domain:
1. Go to your Render Dashboard $\rightarrow$ Web Service $\rightarrow$ **Environment**.
2. Update the `CORS_ORIGINS` variable:
   ```text
   http://localhost:3000,https://<your-app-name>.vercel.app
   ```
3. Save changes. Render will automatically redeploy with the updated CORS origin allowed.

---

## 5. Verification & Smoke Test Checklist

Once both services are deployed:
- [ ] **Health Endpoint**: `GET https://<render-url>/health` returns `{"status":"ok"}`.
- [ ] **Catalog Endpoint**: `GET https://<render-url>/api/catalog` returns 4 products in USD.
- [ ] **Frontend Loading**: Visiting `https://<vercel-url>` renders the Quote Builder with catalog items.
- [ ] **Live Calculation**: Adjusting seat count from 9 to 10 immediately updates pricing tier from `STARTER` to `GROWTH`.
- [ ] **What-If Simulator**: Toggling the simulator recalculates preview totals without altering the active form.
- [ ] **Deal Desk Copilot**: Asking "Explain pricing" returns natural-language breakdown via Gemini (or safe fallback message if key is omitted).
- [ ] **Saved Quotes**: Saving a draft stores the quote and enables the review workflow (`DRAFT` $\rightarrow$ `SUBMITTED` $\rightarrow$ `APPROVED`).
- [ ] **Security Verification**: Inspect browser Network tab — verify `GEMINI_API_KEY` is nowhere in requests, headers, or payloads.
