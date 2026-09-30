
import hashlib
from fastapi import APIRouter, HTTPException
from ..database import get_conn, _hash_pin
from ..schemas import LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(body: LoginRequest):
    conn = get_conn()
    # Try hashed PIN first (new schema), then fall back to plain PIN (legacy rows)
    pin_hash = _hash_pin(body.pin)
    row = conn.execute(
        """SELECT operator_id, name, role FROM operators
           WHERE operator_id=? AND pin_hash=? AND active=1""",
        (body.operator_id.strip().upper(), pin_hash)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Operator ID or PIN is incorrect.")
    user = dict(row)
    return {
        "access_token": "prototype-session",
        "user": {
            "id": user["operator_id"],
            "operator_id": user["operator_id"],
            "name": user["name"],
            "role": user["role"]
        }
    }
