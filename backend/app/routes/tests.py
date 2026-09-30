
import base64
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from ..database import get_conn, UPLOAD_DIR
from ..schemas import TestCreate
from ..services.crypto import sha256_bytes, canonical_json, record_hash, sign_hash, public_key_pem

router = APIRouter(prefix="/tests", tags=["tests"])

GENESIS = "PRAMAAN-GENESIS-v1"


def row_to_record(row, include_image: bool = False) -> dict:
    d = dict(row)

    # Build GPS sub-object
    d["gps"] = None
    if d.get("latitude") is not None:
        d["gps"] = {
            "lat": d["latitude"],
            "lon": d["longitude"],
            "accuracy": d.get("gps_accuracy")
        }
    d.pop("latitude", None)
    d.pop("longitude", None)
    d.pop("gps_accuracy", None)

    # Camel-case aliases for frontend compatibility
    d["sampleColor"]   = d.get("sample_color")
    d["deltaE"]        = d.get("delta_e")
    d["recordHash"]    = d.get("record_hash")
    d["imageHash"]     = d.get("image_hash")
    d["previousHash"]  = d.get("previous_hash")
    d["digitalSignature"] = d.get("digital_signature")
    d["recordId"]      = d.get("record_id")
    d["caseId"]        = d.get("case_id")
    d["sampleId"]      = d.get("sample_id")
    d["testType"]      = d.get("test_type")
    # Alias "test_type" as "kit" for backward-compat with existing frontend
    d["kit"]           = d.get("test_type")
    # Alias "operator_id" as "operator" for frontend display
    d["operator"]      = d.get("operator_id")

    if include_image and d.get("image_path"):
        p = Path(d["image_path"])
        if not p.exists():
            p = UPLOAD_DIR / p.name
        if not p.exists() and d.get("record_hash"):
            p = UPLOAD_DIR / f"{d['record_hash']}.jpg"
        if p.exists():
            d["image_data_url"] = "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()

    return d



@router.post("")
def create_test(body: TestCreate):
    # --- Decode image ---
    try:
        raw = body.image_data_url.split(",", 1)[1]
        image_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image_data_url.")

    image_hash = sha256_bytes(image_bytes)

    conn = get_conn()
    previous = conn.execute(
        "SELECT record_hash FROM tests ORDER BY id DESC LIMIT 1"
    ).fetchone()
    previous_hash = previous["record_hash"] if previous else GENESIS

    record_id = "PRM-" + uuid.uuid4().hex[:8].upper()
    # Use backend authoritative timestamp (PRD §28)
    timestamp = datetime.now(timezone.utc).isoformat()
    raw_gps = body.gps or {}
    lat = raw_gps.get("lat") if raw_gps.get("lat") is not None else raw_gps.get("latitude")
    lon = raw_gps.get("lon") if raw_gps.get("lon") is not None else raw_gps.get("longitude")
    acc = raw_gps.get("accuracy") if raw_gps.get("accuracy") is not None else raw_gps.get("acc")
    if acc is not None:
        try:
            acc = int(acc) if float(acc).is_integer() else float(acc)
        except (ValueError, TypeError):
            pass
    if lat is not None:
        try:
            lat = float(lat)
        except (ValueError, TypeError):
            pass
    if lon is not None:
        try:
            lon = float(lon)
        except (ValueError, TypeError):
            pass

    gps = {
        "lat": lat,
        "lon": lon,
        "accuracy": acc
    } if lat is not None else {}

    payload = {
        "record_id":    record_id,
        "case_id":      body.case_id,
        "sample_id":    body.sample_id,
        "test_type":    body.test_type,
        "operator_id":  body.operator_id,
        "timestamp":    timestamp,
        "gps":          gps,
        "result":       body.result,
        "confidence":   body.confidence,
        "delta_e":      body.delta_e,
        "sample_color": body.sample_color,
        "image_hash":   image_hash,
        "previous_hash": previous_hash,
    }

    rhash = record_hash(payload)
    signature = sign_hash(rhash)

    image_path = UPLOAD_DIR / f"{rhash}.jpg"
    image_path.write_bytes(image_bytes)

    conn.execute("""
      INSERT INTO tests(
        record_id, case_id, sample_id, test_type, operator_id, timestamp,
        latitude, longitude, gps_accuracy, result, confidence, delta_e, sample_color,
        image_hash, previous_hash, record_hash, digital_signature, signature_algorithm,
        image_path, analysis_message, capture_status, reference_detected,
        image_quality, classification_method, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        record_id, body.case_id, body.sample_id, body.test_type, body.operator_id, timestamp,
        gps.get("lat"), gps.get("lon"), gps.get("accuracy"),
        body.result, body.confidence, body.delta_e, body.sample_color,
        image_hash, previous_hash, rhash, signature, "ECDSA-P256-SHA256",
        str(image_path), body.analysis_message,
        body.capture_status or "VALID",
        1 if body.reference_detected else 0,
        body.image_quality or "GOOD",
        body.classification_method or "prototype_rule_based",
        datetime.now(timezone.utc).isoformat()
    ))
    conn.commit()
    row = conn.execute("SELECT * FROM tests WHERE record_hash=?", (rhash,)).fetchone()
    conn.close()

    return {
        "record": row_to_record(row, include_image=True),
        "public_key": public_key_pem(),
        "message": "Record stored and cryptographically signed by PRAMAAN backend."
    }


@router.get("")
def list_tests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    result: Optional[str] = Query(default=None),
    test_type: Optional[str] = Query(default=None),
    operator_id: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
):
    conn = get_conn()
    conditions = []
    params: list = []

    page_val = int(page) if not hasattr(page, "default") else 1
    limit_val = int(limit) if not hasattr(limit, "default") else 50
    s_val = str(search) if isinstance(search, str) and search else None
    res_val = str(result) if isinstance(result, str) and result else None
    tt_val = str(test_type) if isinstance(test_type, str) and test_type else None
    op_val = str(operator_id) if isinstance(operator_id, str) and operator_id else None
    df_val = str(date_from) if isinstance(date_from, str) and date_from else None
    dt_val = str(date_to) if isinstance(date_to, str) and date_to else None

    if s_val:
        conditions.append("(case_id LIKE ? OR record_id LIKE ? OR operator_id LIKE ?)")
        like = f"%{s_val}%"
        params.extend([like, like, like])
    if res_val:
        conditions.append("result=?")
        params.append(res_val)
    if tt_val:
        conditions.append("test_type=?")
        params.append(tt_val)
    if op_val:
        conditions.append("operator_id=?")
        params.append(op_val)
    if df_val:
        conditions.append("timestamp >= ?")
        params.append(df_val)
    if dt_val:
        conditions.append("timestamp <= ?")
        params.append(dt_val + "T23:59:59Z")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page_val - 1) * limit_val

    rows = conn.execute(
        f"SELECT * FROM tests {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        params + [limit_val, offset]
    ).fetchall()
    total = conn.execute(
        f"SELECT COUNT(*) FROM tests {where}", params
    ).fetchone()[0]
    conn.close()

    return {
        "records": [row_to_record(r) for r in rows],
        "total": total,
        "page": page_val,
        "limit": limit_val
    }


@router.get("/{record_id_or_hash}")
def get_test(record_id_or_hash: str):
    conn = get_conn()
    # Support both record_id (PRM-XXXXXXXX) and record_hash (64-char hex)
    if record_id_or_hash.startswith("PRM-"):
        row = conn.execute(
            "SELECT * FROM tests WHERE record_id=?", (record_id_or_hash,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM tests WHERE record_hash=?", (record_id_or_hash,)
        ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"record": row_to_record(row, include_image=True)}


@router.get("/{record_id_or_hash}/image")
def get_image(record_id_or_hash: str):
    from fastapi.responses import FileResponse
    conn = get_conn()
    if record_id_or_hash.startswith("PRM-"):
        row = conn.execute(
            "SELECT image_path FROM tests WHERE record_id=?", (record_id_or_hash,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT image_path FROM tests WHERE record_hash=?", (record_id_or_hash,)
        ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Image not found.")
    img_path = Path(row["image_path"])
    if not img_path.exists():
        img_path = UPLOAD_DIR / img_path.name
    if not img_path.exists() and "record_hash" in row.keys() and row["record_hash"]:
        img_path = UPLOAD_DIR / f"{row['record_hash']}.jpg"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found on server.")
    return FileResponse(img_path, media_type="image/jpeg")



@router.delete("/{record_id_or_hash}")
def delete_test(record_id_or_hash: str):
    conn = get_conn()
    if record_id_or_hash.startswith("PRM-"):
        row = conn.execute(
            "SELECT * FROM tests WHERE record_id=?", (record_id_or_hash,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM tests WHERE record_hash=?", (record_id_or_hash,)
        ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Record not found.")

    rhash = row["record_hash"]
    rid = row["record_id"]
    image_path = row["image_path"]

    conn.execute("DELETE FROM tests WHERE id=?", (row["id"],))
    conn.commit()
    conn.close()

    if image_path:
        try:
            p = Path(image_path)
            if p.exists():
                p.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "record_id": rid,
        "record_hash": rhash,
        "message": f"Record {rid} successfully deleted."
    }

