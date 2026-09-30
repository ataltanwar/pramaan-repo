
import base64
import hashlib
import json
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

KEY_DIR = Path(__file__).resolve().parents[1] / "keys"
KEY_DIR.mkdir(exist_ok=True)
PRIVATE_KEY_FILE = KEY_DIR / "pramaan_ecdsa_private.pem"
PUBLIC_KEY_FILE = KEY_DIR / "pramaan_ecdsa_public.pem"

def load_or_create_key():
    if PRIVATE_KEY_FILE.exists():
        return serialization.load_pem_private_key(PRIVATE_KEY_FILE.read_bytes(), password=None)

    key = ec.generate_private_key(ec.SECP256R1())
    PRIVATE_KEY_FILE.write_bytes(
        key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    )
    PUBLIC_KEY_FILE.write_bytes(
        key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )
    return key

PRIVATE_KEY = load_or_create_key()

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def canonical_json(obj: dict) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def record_hash(payload: dict) -> str:
    return hashlib.sha256(canonical_json(payload)).hexdigest()

def sign_hash(hex_hash: str) -> str:
    sig = PRIVATE_KEY.sign(bytes.fromhex(hex_hash), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(sig).decode()

PUBLIC_KEY = PRIVATE_KEY.public_key()

def verify_signature(hex_hash: str, signature_b64: str) -> bool:
    try:
        sig_bytes = base64.b64decode(signature_b64)
        PUBLIC_KEY.verify(sig_bytes, bytes.fromhex(hex_hash), ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False

def public_key_pem() -> str:
    return PUBLIC_KEY.public_bytes(
        Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
    ).decode()

