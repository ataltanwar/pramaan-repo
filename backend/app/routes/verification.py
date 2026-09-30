
import base64
from pathlib import Path
from fastapi import APIRouter, HTTPException
from ..database import get_conn
from ..services.crypto import sha256_bytes, record_hash as compute_record_hash, verify_signature

router = APIRouter(prefix="/tests", tags=["verification"])

@router.post("/{record_id_or_hash}/verify")
def verify(record_id_or_hash: str):
    conn = get_conn()
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

    d = dict(row)

    # --- Image hash verification ---
    try:
        from ..database import UPLOAD_DIR
        img_p = Path(d["image_path"])
        if not img_p.exists():
            img_p = UPLOAD_DIR / img_p.name
        if not img_p.exists() and d.get("record_hash"):
            img_p = UPLOAD_DIR / f"{d['record_hash']}.jpg"
        image_bytes = img_p.read_bytes()
        image_hash_ok = sha256_bytes(image_bytes) == d["image_hash"]
    except Exception:
        image_hash_ok = False


    # --- Record hash verification ---
    raw_acc = d.get("gps_accuracy")
    acc = None
    if raw_acc is not None:
        try:
            acc = int(raw_acc) if float(raw_acc).is_integer() else float(raw_acc)
        except (ValueError, TypeError):
            acc = raw_acc

    gps_obj = {}
    if d["latitude"] is not None:
        gps_obj = {
            "lat": float(d["latitude"]),
            "lon": float(d["longitude"]),
            "accuracy": acc
        }

    payload = {
        "record_id":    d["record_id"],
        "case_id":      d["case_id"],
        "sample_id":    d.get("sample_id"),
        "test_type":    d["test_type"],
        "operator_id":  d["operator_id"],
        "timestamp":    d["timestamp"],
        "gps":          gps_obj,
        "result":       d["result"],
        "confidence":   d["confidence"],
        "delta_e":      d["delta_e"],
        "sample_color": d.get("sample_color"),
        "image_hash":   d["image_hash"],
        "previous_hash": d["previous_hash"],
    }
    recalculated = compute_record_hash(payload)
    record_hash_ok = recalculated == d["record_hash"]

    # --- Signature verification ---
    # Cryptographic ECDSA P-256 verification using public key
    stored_signature = d.get("digital_signature")
    signature_valid = verify_signature(d["record_hash"], stored_signature) if stored_signature else False

    all_valid = image_hash_ok and record_hash_ok and signature_valid

    return {
        "verified": all_valid,
        "record_hash_valid": record_hash_ok,
        "signature_valid": signature_valid,
        "image_hash_valid": image_hash_ok,
        "record_id": d["record_id"],
        "recalculated_hash": recalculated,
        "stored_hash": d["record_hash"],
        "verdict": "VALID" if all_valid else "INVALID",
        "note": "Server-side ECDSA-P256 signing. Record hash integrity verified."
    }
