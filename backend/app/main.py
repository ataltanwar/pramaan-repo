
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import init_db
from .routes.auth import router as auth_router
from .routes.analysis import router as analysis_router
from .routes.tests import router as tests_router
from .routes.verification import router as verification_router
from .routes.profiles import router as profiles_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("pramaan")

FRONTEND_URL = os.getenv("FRONTEND_URL", "")
FRONTEND_ORIGINS_ENV = os.getenv("FRONTEND_ORIGINS", "")

DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

# Parse allowed origins
allowed_origins = list(DEV_ORIGINS)
for raw in [FRONTEND_URL, FRONTEND_ORIGINS_ENV]:
    if raw:
        for u in raw.split(","):
            cleaned = u.strip().rstrip("/")
            if cleaned and cleaned not in allowed_origins:
                allowed_origins.append(cleaned)

app = FastAPI(
    title="PRAMAAN API",
    version="2.0.0",
    description="Presumptive Result Authentication & Metadata Assurance Network — Digital Companion for Field Drug Testing"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    logger.info("PRAMAAN backend started. DB initialised.")

@app.get("/health")
def health():
    """Simple healthcheck for Render and monitoring tools."""
    return {"status": "ok"}

@app.get("/api/v1/health")
def api_health():
    """Full system healthcheck endpoint."""
    return {
        "status": "ok",
        "service": "PRAMAAN",
        "version": "2.0.0",
        "description": "Presumptive Result Authentication & Metadata Assurance Network"
    }

app.include_router(auth_router,         prefix="/api/v1")
app.include_router(analysis_router,     prefix="/api/v1")
app.include_router(tests_router,        prefix="/api/v1")
app.include_router(verification_router, prefix="/api/v1")
app.include_router(profiles_router,     prefix="/api/v1")

# Serve frontend when running locally or co-located
frontend_dir = Path(__file__).resolve().parent.parent.parent / "frontend"
if frontend_dir.exists():
    @app.get("/")
    def serve_frontend_root():
        target = frontend_dir / "index.html"
        if not target.exists():
            target = frontend_dir / "PRAMAAN_Field_Test_Companion.html"
        if target.exists():
            return FileResponse(target)
        return {"status": "ok", "service": "PRAMAAN API", "docs": "/docs"}

    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
else:
    @app.get("/")
    def serve_root():
        return {
            "status": "ok",
            "service": "PRAMAAN API",
            "version": "2.0.0",
            "docs": "/docs",
            "health": "/health"
        }


