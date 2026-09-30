# PRAMAAN Backend v2

## Run

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API:
- GET  /api/v1/health
- POST /api/v1/auth/login
- POST /api/v1/tests/analyze
- POST /api/v1/tests
- GET  /api/v1/tests
- GET  /api/v1/tests/{record_hash}
- GET  /api/v1/tests/{record_hash}/image
- POST /api/v1/tests/{record_hash}/verify

The backend creates `pramaan.db`, stores uploaded images, hashes the image with SHA-256,
creates a tamper-evident record hash, and signs the record hash with an ECDSA P-256 key.
