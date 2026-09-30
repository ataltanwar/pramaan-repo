
from pydantic import BaseModel, Field
from typing import Optional, Any

class LoginRequest(BaseModel):
    operator_id: str
    pin: str

class TestCreate(BaseModel):
    case_id: str
    sample_id: Optional[str] = None
    test_type: str
    operator_id: str
    timestamp: Optional[str] = None
    gps: Optional[dict[str, Any]] = None
    result: str
    confidence: float = Field(ge=0, le=100)
    delta_e: float = Field(ge=0)
    sample_color: Optional[str] = None
    image_data_url: str
    analysis_message: Optional[str] = None
    capture_status: Optional[str] = "VALID"
    reference_detected: Optional[bool] = True
    image_quality: Optional[str] = "GOOD"
    classification_method: Optional[str] = "prototype_rule_based"
