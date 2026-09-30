
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..database import get_conn
from ..services.analyzer import analyze_bytes

router = APIRouter(prefix="/tests", tags=["analysis"])

def _get_profile(test_type: str) -> dict | None:
    """Fetch the active test profile for the given test type from the database."""
    conn = get_conn()
    row = conn.execute(
        "SELECT positive_profile, negative_profile FROM test_profiles WHERE name=? AND active=1",
        (test_type,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "positive_profile": json.loads(row["positive_profile"]),
        "negative_profile": json.loads(row["negative_profile"])
    }

@router.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    test_type: str = Form("unknown"),
    operator_id: str = Form("demo-operator"),
):
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image.")
    try:
        profile = _get_profile(test_type)
        result = analyze_bytes(data, test_type, profile)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    result["operator_id"] = operator_id
    result["test_type"] = test_type
    return {"analysis": result}
