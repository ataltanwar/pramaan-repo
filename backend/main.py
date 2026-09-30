"""
PRAMAAN Backend Entry Point for Render & Local Uvicorn Execution
===============================================================
Compatible with:
  - uvicorn main:app --host 0.0.0.0 --port $PORT
  - uvicorn app.main:app --host 0.0.0.0 --port $PORT
  - python main.py
"""
import os
import uvicorn
from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
