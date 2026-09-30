"""
PRAMAAN Local Test & Validation Suite (using Python standard library urllib)
==========================================================================
Validates:
  1. GET /health
  2. GET /api/v1/health
  3. GET /api/v1/profiles
  4. POST /api/v1/auth/login
  5. POST /api/v1/tests/analyze
  6. POST /api/v1/tests
  7. POST /api/v1/tests/{id}/verify
  8. Error handling
"""

import sys
import json
import base64
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BASE_URL = "http://127.0.0.1:8000"

def request_json(path, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{path}"
    payload = None
    if data is not None:
        if isinstance(data, dict):
            payload = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(data, bytes):
            payload = data

    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed

def upload_multipart(path, fields, file_field, filename, file_bytes, content_type="image/png"):
    boundary = "----PramaanBoundaryXYZ789"
    body = bytearray()

    for k, v in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{v}\r\n".encode("utf-8"))

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8"))
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    body.extend(file_bytes)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    return request_json(path, method="POST", data=bytes(body), headers=headers)

def run_tests():
    print("=" * 65)
    print("RUNNING LIVE ENDPOINT TESTS AGAINST http://127.0.0.1:8000")
    print("=" * 65)

    # 1. GET /health
    print("\n[1/7] Testing GET /health...")
    status, res = request_json("/health")
    assert status == 200, f"/health returned {status}: {res}"
    assert res == {"status": "ok"}, f"Unexpected response: {res}"
    print(f"  [OK] GET /health -> {res}")

    # 2. GET /api/v1/health
    print("\n[2/7] Testing GET /api/v1/health...")
    status, res = request_json("/api/v1/health")
    assert status == 200, f"/api/v1/health returned {status}: {res}"
    print(f"  [OK] GET /api/v1/health -> {res.get('service')} v{res.get('version')} (status: {res.get('status')})")

    # 3. GET /api/v1/profiles
    print("\n[3/7] Testing GET /api/v1/profiles...")
    status, res = request_json("/api/v1/profiles")
    assert status == 200, f"/api/v1/profiles returned {status}: {res}"
    profiles = res.get("profiles", [])
    print(f"  [OK] Retrieved {len(profiles)} test profiles (e.g. {[p['name'] for p in profiles[:3]]}...)")

    # 4. POST /api/v1/auth/login
    print("\n[4/7] Testing POST /api/v1/auth/login...")
    status, res = request_json("/api/v1/auth/login", method="POST", data={"operator_id": "NCB/FO/2026/001", "pin": "123456"})
    assert status == 200, f"Login returned {status}: {res}"
    user = res.get("user", {})
    print(f"  [OK] Login successful -> Officer: {user.get('name')} ({user.get('role')})")

    # 5. POST /api/v1/tests/analyze
    print("\n[5/7] Testing Image Analysis (POST /api/v1/tests/analyze)...")
    sample_path = BASE_DIR / "sample_test_images" / "cannabis_positive_sample.png"
    with open(sample_path, "rb") as f:
        img_bytes = f.read()

    status, res = upload_multipart(
        "/api/v1/tests/analyze",
        fields={"test_type": "Marijuana", "operator_id": "NCB/FO/2026/001"},
        file_field="image",
        filename="cannabis_sample.png",
        file_bytes=img_bytes,
        content_type="image/png"
    )
    assert status == 200, f"Analysis returned {status}: {res}"
    analysis = res.get("analysis", {})
    print(f"  [OK] Analysis pipeline executed successfully:")
    print(f"    - Result: {analysis.get('result')}")
    print(f"    - Confidence: {analysis.get('confidence')}%")
    print(f"    - Method: {analysis.get('classification_method')}")
    print(f"    - Reference card detected: {analysis.get('reference_detected')}")
    print(f"    - Color: {analysis.get('sample_color')}")

    # 6. POST /api/v1/tests (Create signed ledger record)
    print("\n[6/7] Testing Record Creation & ECDSA Signing (POST /api/v1/tests)...")
    b64_img = "data:image/png;base64," + base64.b64encode(img_bytes).decode("ascii")
    payload = {
        "case_id": "PROD-VAL-CASE-001",
        "sample_id": "SMP-VAL-01",
        "test_type": "Marijuana",
        "operator_id": "NCB/FO/2026/001",
        "result": analysis.get("result", "POSITIVE"),
        "confidence": analysis.get("confidence", 90.0),
        "delta_e": analysis.get("delta_e", 4.2),
        "sample_color": analysis.get("sample_color", "#4a7c59"),
        "image_data_url": b64_img,
        "image_quality": analysis.get("image_quality", "GOOD"),
        "reference_detected": analysis.get("reference_detected", True),
        "classification_method": analysis.get("classification_method", "hybrid_ml_colorimetric"),
        "analysis_message": analysis.get("message", "Validation test"),
        "gps": {"lat": 28.6139, "lon": 77.2090, "accuracy": 4.5}
    }
    status, res = request_json("/api/v1/tests", method="POST", data=payload)
    assert status == 200, f"Record creation returned {status}: {res}"
    rec = res.get("record", {})
    rec_hash = rec.get("record_hash") or rec.get("recordHash")
    rec_id = rec.get("record_id") or rec.get("recordId")
    sig = rec.get("digitalSignature") or rec.get("digital_signature")
    print(f"  [OK] Record created: {rec_id}")
    print(f"    - Record Hash: {rec_hash}")
    print(f"    - ECDSA Signature: {sig[:28]}...")

    # 7. Verification Endpoint
    print("\n[7/7] Testing Integrity Verification (POST /api/v1/tests/{hash}/verify)...")
    status, res = request_json(f"/api/v1/tests/{rec_hash}/verify", method="POST")
    assert status == 200, f"Verify returned {status}: {res}"
    print(f"  [OK] Cryptographic verification verdict: {res.get('verdict')} (verified: {res.get('verified')})")
    print(f"    - Ledger record hash valid: {res.get('record_hash_valid')}")
    print(f"    - Image SHA-256 hash valid: {res.get('image_hash_valid')}")
    print(f"    - ECDSA-P256 signature valid: {res.get('signature_valid')}")
    assert res.get("verified") is True, f"Expected verified=True, got {res}"


    # 8. Error handling
    print("\n[Bonus] Testing Error Handling...")
    err_status, err_res = request_json("/api/v1/auth/login", method="POST", data={"operator_id": "BAD", "pin": "0"})
    assert err_status == 401, f"Expected 401, got {err_status}"
    print(f"  [OK] 401 on bad credentials verified ({err_res.get('detail')})")

    err_status2, _ = request_json("/api/v1/tests/INVALID_HASH_12345")
    assert err_status2 == 404, f"Expected 404, got {err_status2}"
    print("  [OK] 404 on non-existent record verified")

    print("\n" + "=" * 65)
    print("ALL ENDPOINTS AND PIPELINES VERIFIED SUCCESSFULLY!")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()
