
import os
import hashlib
import json
from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parents[1]
_db_env = os.getenv("DATABASE_PATH") or os.getenv("DB_PATH")
DB_PATH = Path(_db_env) if _db_env else (BASE_DIR / "pramaan.db")

_upload_env = os.getenv("UPLOAD_DIR")
UPLOAD_DIR = Path(_upload_env) if _upload_env else (BASE_DIR / "uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _hash_pin(pin: str) -> str:
    """Simple SHA-256 pin hashing for prototype. Use bcrypt/Argon2 in production."""
    return hashlib.sha256(pin.encode()).hexdigest()

# Default test profiles (prototype only – not laboratory-validated thresholds).
DEFAULT_PROFILES = [
    {
        "name": "Opium",
        "category": "Opioids",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [0, 30], "sat_min": 40, "lab_target": [35, 12, 8]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 20},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Morphine",
        "category": "Opioids",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [0, 25], "sat_min": 50, "lab_target": [30, 15, 10]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 15},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Codeine",
        "category": "Opioids",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [5, 40], "sat_min": 35, "lab_target": [40, 10, 15]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 18},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Heroin",
        "category": "Opioids",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [0, 20], "sat_min": 60, "lab_target": [25, 18, 5]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 12},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Amphetamines",
        "category": "Stimulants",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [0, 15], "sat_min": 80, "lab_target": [20, 25, 5]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 15},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Mescaline",
        "category": "Hallucinogens",
        "kit": "Marquis",
        "positive_profile": {"hue_range": [10, 40], "sat_min": 45, "lab_target": [45, 8, 18]},
        "negative_profile": {"hue_range": [0, 10], "sat_max": 20},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Marijuana",
        "category": "Cannabis",
        "kit": "Duquenois-Levine",
        "positive_profile": {"hue_range": [120, 179], "sat_min": 40, "lab_target": [30, -5, -15]},
        "negative_profile": {"hue_range": [0, 30], "sat_max": 20},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Hashish",
        "category": "Cannabis",
        "kit": "Duquenois-Levine",
        "positive_profile": {"hue_range": [115, 179], "sat_min": 45, "lab_target": [28, -4, -12]},
        "negative_profile": {"hue_range": [0, 30], "sat_max": 20},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Hashish Oil",
        "category": "Cannabis",
        "kit": "Duquenois-Levine",
        "positive_profile": {"hue_range": [110, 179], "sat_min": 50, "lab_target": [25, -3, -10]},
        "negative_profile": {"hue_range": [0, 30], "sat_max": 20},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Cocaine",
        "category": "Stimulants",
        "kit": "Cobalt Thiocyanate",
        "positive_profile": {"hue_range": [90, 140], "sat_min": 60, "lab_target": [40, -8, -25]},
        "negative_profile": {"hue_range": [0, 30], "sat_max": 15},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
    {
        "name": "Methaqualone",
        "category": "Depressants",
        "kit": "Simon's",
        "positive_profile": {"hue_range": [135, 179], "sat_min": 30, "lab_target": [38, -10, -20]},
        "negative_profile": {"hue_range": [0, 20], "sat_max": 18},
        "reference_card": "standard_6patch",
        "version": "1.0"
    },
]

def init_db():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS operators (
        operator_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT UNIQUE NOT NULL,
        case_id TEXT NOT NULL,
        sample_id TEXT,
        test_type TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        gps_accuracy REAL,
        result TEXT NOT NULL,
        confidence REAL NOT NULL,
        delta_e REAL NOT NULL,
        sample_color TEXT,
        image_path TEXT NOT NULL,
        image_hash TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        record_hash TEXT UNIQUE NOT NULL,
        digital_signature TEXT NOT NULL,
        signature_algorithm TEXT NOT NULL DEFAULT 'ECDSA-P256-SHA256',
        analysis_message TEXT,
        capture_status TEXT NOT NULL DEFAULT 'VALID',
        reference_detected INTEGER NOT NULL DEFAULT 1,
        image_quality TEXT NOT NULL DEFAULT 'GOOD',
        classification_method TEXT NOT NULL DEFAULT 'prototype_rule_based',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        category TEXT,
        kit TEXT NOT NULL,
        positive_profile TEXT NOT NULL,
        negative_profile TEXT NOT NULL,
        reference_card TEXT,
        version TEXT NOT NULL DEFAULT '1.0',
        active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_tests_case ON tests(case_id);
    CREATE INDEX IF NOT EXISTS idx_tests_operator ON tests(operator_id);
    CREATE INDEX IF NOT EXISTS idx_tests_timestamp ON tests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_tests_result ON tests(result);
    CREATE INDEX IF NOT EXISTS idx_tests_test_type ON tests(test_type);
    """)

    # Seed operators with hashed PINs
    seed = [
        ("NCB/FO/2026/001", "Field Officer", "Field Officer", _hash_pin("123456")),
        ("NCB/SUP/2026/001", "Supervisor", "Supervisor", _hash_pin("654321")),
        ("DEMO", "Demo Officer", "Demo", _hash_pin("000000")),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO operators(operator_id,name,role,pin_hash) VALUES (?,?,?,?)",
        seed
    )

    # Seed test profiles
    for p in DEFAULT_PROFILES:
        conn.execute(
            """INSERT OR IGNORE INTO test_profiles
               (name,category,kit,positive_profile,negative_profile,reference_card,version,active)
               VALUES (?,?,?,?,?,?,?,1)""",
            (
                p["name"], p["category"], p["kit"],
                json.dumps(p["positive_profile"]),
                json.dumps(p["negative_profile"]),
                p.get("reference_card", ""),
                p["version"]
            )
        )

    conn.commit()
    conn.close()
