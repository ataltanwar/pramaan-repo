
import json
from fastapi import APIRouter
from ..database import get_conn

router = APIRouter(prefix="/profiles", tags=["profiles"])

@router.get("")
def list_profiles():
    """Return all active test profiles (names used as test-type selector options)."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name, category, kit, version FROM test_profiles WHERE active=1 ORDER BY category, name"
    ).fetchall()
    conn.close()
    return {
        "profiles": [dict(r) for r in rows]
    }

@router.get("/{name}")
def get_profile(name: str):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM test_profiles WHERE name=? AND active=1", (name,)
    ).fetchone()
    conn.close()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Profile not found.")
    d = dict(row)
    d["positive_profile"] = json.loads(d["positive_profile"])
    d["negative_profile"] = json.loads(d["negative_profile"])
    return {"profile": d}
