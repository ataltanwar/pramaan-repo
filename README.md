# PRAMAAN — Digital Companion for Field Drug Testing

**Presumptive Result Authentication & Metadata Assurance Network**

Smart India Hackathon 2026 | Problem Statement SIH26231

---

## Overview

PRAMAAN is a web application that assists authorised field officers in documenting and interpreting field drug-test results. It captures a test image, detects a reference colour card, performs colour-calibrated analysis, produces a **presumptive** result, and generates a tamper-evident digital record with SHA-256 hashes and ECDSA digital signature.

> **IMPORTANT:** PRAMAAN provides a presumptive field-test interpretation. It does not establish definitive substance identification. Laboratory confirmation remains necessary.

---

## Features

| Feature | Status |
|---|---|
| Authentication (Operator ID + PIN) | ✅ Backend-validated |
| Camera capture + image upload | ✅ |
| Reference colour card detection | ✅ Prototype (patch spread heuristic) |
| Lighting calibration (grey-world) | ✅ |
| Lab colourspace analysis + ΔE | ✅ |
| Configurable test profiles (11 drug types) | ✅ |
| POSITIVE / NEGATIVE / INCONCLUSIVE / INVALID CAPTURE | ✅ |
| Step-by-step analysis progress UI | ✅ |
| GPS capture | ✅ |
| SHA-256 image hash | ✅ |
| Record hash (canonical JSON) | ✅ |
| ECDSA P-256 digital signature | ✅ |
| Hash-chained records | ✅ |
| Test history with search & filters | ✅ |
| Record detail with cryptographic info | ✅ |
| QR code per record | ✅ |
| Backend verification endpoint | ✅ |
| PDF & JSON export | ✅ |
| Demo mode | ✅ |
| Offline fallback (IndexedDB cache) | ✅ |
| Backend API status indicator | ✅ |
| Supervisor dashboard | ✅ |

---

## Architecture

```
PRAMAAN
│
├── FRONTEND (Modular ES6 + Vanilla CSS)
│   ├── frontend/index.html                           — Default entry point
│   ├── frontend/PRAMAAN_Field_Test_Companion.html    — Companion entry point
│   ├── frontend/css/                                 — Modular styles (base, components, views)
│   └── frontend/js/                                  — Modular scripts (config, state, crypto, api, views)
│
└── BACKEND (FastAPI + SQLite)
    ├── app/main.py              — FastAPI app
    ├── app/database.py          — SQLite init + schema
    ├── app/schemas.py           — Pydantic models
    ├── app/routes/
    │   ├── auth.py              — POST /api/v1/auth/login
    │   ├── analysis.py          — POST /api/v1/tests/analyze
    │   ├── tests.py             — CRUD /api/v1/tests
    │   ├── verification.py      — POST /api/v1/tests/{id}/verify
    │   └── profiles.py          — GET  /api/v1/profiles
    └── app/services/
        ├── analyzer.py          — Full analysis pipeline
        └── crypto.py            — SHA-256, ECDSA-P256
```

---

---

## Production Deployment & Running

### 1. Local Development

#### A. Backend (FastAPI on Port 8000)
```bash
cd backend

# Windows:
python -m venv venv
venv\Scripts\activate

# Linux / macOS:
# python3 -m venv venv
# source venv/bin/activate

# Install dependencies (headless OpenCV, FastAPI, scikit-learn, etc.)
pip install -r requirements.txt

# Start backend (serves API at :8000/api/v1 and frontend at http://localhost:8000/)
uvicorn main:app --reload --port 8000
```

#### B. Frontend (Vanilla HTML/CSS/JS)
You can run the frontend via Python's built-in web server or live server:
```bash
cd frontend
python -m http.server 5500
```
Open [http://localhost:5500](http://localhost:5500) (or [http://localhost:8000](http://localhost:8000) when served directly from FastAPI).

---

### 2. Backend Deployment on Render

1. Log in to your [Render Dashboard](https://dashboard.render.com/) and click **New +** > **Web Service**.
2. Connect your GitHub repository (`pramaan-app`).
3. Configure the Web Service settings:
   - **Name:** `pramaan-backend` (or your chosen name)
   - **Language / Runtime:** `Python`
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Configure **Environment Variables** in Render:
   - `PYTHON_VERSION`: `3.11.9`
   - `FRONTEND_URL`: `https://your-frontend-app.vercel.app` *(update with your Vercel URL)*
   - `FRONTEND_ORIGINS`: `https://your-frontend-app.vercel.app,http://localhost:5500,http://localhost:8000`
5. Click **Create Web Service**.
6. Once deployed, note your Render service URL: `https://<your-service-name>.onrender.com`.
   - Healthcheck: `https://<your-service-name>.onrender.com/health`
   - Swagger Docs: `https://<your-service-name>.onrender.com/docs`

> *Note:* You can also deploy automatically using the included [`render.yaml`](file:///c:/Users/atalh/Downloads/pramaan-app/render.yaml) by selecting **New +** > **Blueprint**.

---

### 3. Frontend Deployment on Vercel

1. Log in to your [Vercel Dashboard](https://vercel.com/) and click **Add New...** > **Project**.
2. Import your GitHub repository (`pramaan-app`).
3. In the project configuration:
   - **Framework Preset:** `Other`
   - **Root Directory:** Edit and set to `frontend` *(or leave as `./` with root `vercel.json`)*
   - **Build Command:** *(Leave empty)*
   - **Output Directory:** *(Leave empty / `./`)*
4. Click **Deploy**.
5. Once deployed, your frontend will be live at `https://<your-app>.vercel.app`.

#### Connecting Frontend to Render API:
In `frontend/js/config.js`, update `DEFAULT_PRODUCTION_API_URL`:
```javascript
export const DEFAULT_PRODUCTION_API_URL = 'https://<your-backend>.onrender.com/api/v1';
```
*(Alternatively, you can test or override the API URL dynamically without redeploying by appending `?api_url=https://<your-backend>.onrender.com/api/v1` to your Vercel URL).*

Finally, make sure your Render backend has your Vercel URL added to `FRONTEND_URL` in Render Environment Variables.

---


## Demo Credentials

| Role | Operator ID | PIN |
|---|---|---|
| Field Officer | `NCB/FO/2026/001` | `123456` |
| Supervisor | `NCB/SUP/2026/001` | `654321` |
| Demo | `DEMO` | `000000` |

---

## API Endpoints

| Method | URL | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/profiles` | List test profiles |
| POST | `/api/v1/tests/analyze` | Analyse test image |
| POST | `/api/v1/tests` | Save signed record |
| GET | `/api/v1/tests` | List records (filterable) |
| GET | `/api/v1/tests/{id}` | Get record |
| GET | `/api/v1/tests/{id}/image` | Get image |
| POST | `/api/v1/tests/{id}/verify` | Verify integrity |

Interactive docs: http://localhost:8000/docs

---

## Project Limitations

- **Prototype only.** Colour-analysis thresholds are NOT laboratory-validated.
- Reference card detection uses a k-means heuristic, not a trained detector.
- PIN storage uses SHA-256 (prototype). Production must use bcrypt/Argon2.
- Cryptographic records are server-signed; client-side ECDSA is a fallback for offline records.
- All results must be confirmed by laboratory analysis before any legal action.

---

## Analysis Pipeline

1. Image quality assessment (blur, brightness, resolution)
2. Reference colour card detection (k-means colour spread)
3. Lighting calibration (white-patch normalisation)
4. Reaction region detection (central ROI)
5. RGB → Lab colour conversion
6. Colour feature extraction
7. Rule-based classification (replaceable with ML model — PRD §45)
8. Confidence scoring

---

*Smart India Hackathon 2026 | MHA – NCB*
