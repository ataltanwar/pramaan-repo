
"""
PRAMAAN Image Analysis Engine
------------------------------
Prototype pipeline:
  1. Image quality assessment (blur, brightness, resolution)
  2. Reference card detection (colour patches)
  3. Reference patch sampling & lighting normalisation
  4. Reaction region detection (central ROI)
  5. RGB → Lab conversion
  6. Colour feature extraction
  7. Profile comparison & classification (rule-based, replaceable)
  8. Confidence scoring

NOTE: This is a prototype implementation only.
Thresholds are intentionally conservative and are NOT laboratory-validated.
Replace the RuleBasedClassifier with a trained ML model before operational use.
"""

import base64
import io
import json
import cv2
import numpy as np
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Classifier interface (replaceable with ML model – PRD §45)
# ---------------------------------------------------------------------------

class Classifier:
    """Abstract interface for presumptive classifiers."""
    def predict(self, features: dict) -> tuple[str, float]:
        raise NotImplementedError


class RuleBasedClassifier(Classifier):
    """
    Conservative rule-based prototype classifier.
    Uses HSV saturation/hue heuristics only.
    Returns (result, confidence_0_to_100).
    """
    def __init__(self, profile: Optional[dict]):
        self.profile = profile

    def predict(self, features: dict) -> tuple[str, float]:
        sat = features.get("sat", 0.0)
        val = features.get("val", 0.0)
        mean_hue = features.get("hue", 0.0)

        # Low signal → INCONCLUSIVE
        if sat < 20 or val < 15:
            return "INCONCLUSIVE", 55.0

        if self.profile:
            pos = self.profile.get("positive_profile", {})
            neg = self.profile.get("negative_profile", {})

            pos_hue = pos.get("hue_range", [0, 255])
            pos_sat_min = pos.get("sat_min", 0)
            neg_sat_max = neg.get("sat_max", 255)

            hue_in_pos = pos_hue[0] <= mean_hue <= pos_hue[1]
            if hue_in_pos and sat >= pos_sat_min:
                conf = float(min(95.0, 60.0 + sat * 0.15))
                return "POSITIVE", conf

            if sat <= neg_sat_max:
                conf = float(min(90.0, 60.0 + (255.0 - sat) * 0.10))
                return "NEGATIVE", conf

            return "INCONCLUSIVE", 60.0

        return "INCONCLUSIVE", 60.0


# ---------------------------------------------------------------------------
# ML Classifier (Trained on SIH26231 Synthetic Colorimetric CV Dataset - PRD §45)
# ---------------------------------------------------------------------------

_ML_MODEL_CACHE = None

def _load_ml_model():
    global _ML_MODEL_CACHE
    if _ML_MODEL_CACHE is not None:
        return _ML_MODEL_CACHE
    model_path = Path(__file__).resolve().parents[1] / "models" / "colorimetric_ml_model.joblib"
    if model_path.exists():
        try:
            import joblib
            _ML_MODEL_CACHE = joblib.load(model_path)
            return _ML_MODEL_CACHE
        except Exception as e:
            print("Warning: could not load ML model:", e)
    return None


def extract_well_features(img_bgr: np.ndarray) -> np.ndarray:
    """
    Extract 32 color moments, multi-space Lab/HSV/RGB statistics, chroma,
    circular hue, and contrast features for the ML model.
    """
    h, w = img_bgr.shape[:2]
    cy, cx = h // 2, w // 2
    r_core = max(4, int(min(h, w) * 0.28))
    r_outer = max(6, int(min(h, w) * 0.44))

    core_roi = img_bgr[cy - r_core:cy + r_core, cx - r_core:cx + r_core]
    if core_roi.size == 0:
        core_roi = img_bgr

    mask = np.ones((h, w), dtype=bool)
    cv2.circle(mask, (cx, cy), r_outer, False, -1)
    bg_pixels = img_bgr[mask]

    rgb = cv2.cvtColor(core_roi, cv2.COLOR_BGR2RGB).astype(float)
    hsv = cv2.cvtColor(core_roi, cv2.COLOR_BGR2HSV).astype(float)
    lab = cv2.cvtColor(core_roi, cv2.COLOR_BGR2Lab).astype(float)

    L = lab[:, :, 0] / 255.0 * 100.0
    a = lab[:, :, 1] - 128.0
    b = lab[:, :, 2] - 128.0

    rgb_mean = rgb.mean(axis=(0, 1))
    rgb_std = rgb.std(axis=(0, 1))
    rgb_median = np.median(rgb, axis=(0, 1))

    hsv_mean = hsv.mean(axis=(0, 1))
    hsv_std = hsv.std(axis=(0, 1))
    hsv_median = np.median(hsv, axis=(0, 1))

    L_mean, L_std, L_median = float(L.mean()), float(L.std()), float(np.median(L))
    a_mean, a_std, a_median = float(a.mean()), float(a.std()), float(np.median(a))
    b_mean, b_std, b_median = float(b.mean()), float(b.std()), float(np.median(b))

    hue_rad = hsv_median[0] / 180.0 * np.pi * 2.0
    sin_hue = float(np.sin(hue_rad))
    cos_hue = float(np.cos(hue_rad))

    delta_e_neutral = float(np.sqrt((L_median - 50.0)**2 + a_median**2 + b_median**2))
    chroma = float(np.sqrt(a_median**2 + b_median**2))

    bg_rgb = cv2.cvtColor(bg_pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2RGB).reshape(-1, 3).astype(float) if len(bg_pixels) else rgb.reshape(-1, 3)
    bg_mean = bg_rgb.mean(axis=0)
    contrast = float(np.linalg.norm(rgb_mean - bg_mean))

    return np.array([
        rgb_mean[0], rgb_mean[1], rgb_mean[2],
        rgb_std[0], rgb_std[1], rgb_std[2],
        rgb_median[0], rgb_median[1], rgb_median[2],
        hsv_mean[0], hsv_mean[1], hsv_mean[2],
        hsv_std[0], hsv_std[1], hsv_std[2],
        hsv_median[0], hsv_median[1], hsv_median[2],
        L_mean, L_std, L_median,
        a_mean, a_std, a_median,
        b_mean, b_std, b_median,
        sin_hue, cos_hue,
        delta_e_neutral, chroma, contrast
    ], dtype=np.float32)


class MLClassifier(Classifier):
    """
    Trained Machine Learning Classifier (Random Forest + CalibratedClassifierCV)
    trained on SIH26231 synthetic colorimetric dataset (PRD §45).
    Predicts outcome (POSITIVE, NEGATIVE, INCONCLUSIVE) and drug hypothesis.
    Falls back to RuleBasedClassifier if model is unavailable.
    """
    def __init__(self, profile: Optional[dict] = None, test_type: str = "unknown"):
        self.profile = profile
        self.test_type = test_type
        self.model_data = _load_ml_model()

    def predict(self, features: dict, roi_bgr: Optional[np.ndarray] = None) -> tuple[str, float, str, float]:
        if not self.model_data or roi_bgr is None:
            rb = RuleBasedClassifier(self.profile)
            res, conf = rb.predict(features)
            return res, conf, "unknown", 0.0

        try:
            feat_vec = extract_well_features(roi_bgr)
            outcome_model = self.model_data["outcome_model"]
            classes = self.model_data["classes"]

            probs = outcome_model.predict_proba([feat_vec])[0]
            pred_idx = int(np.argmax(probs))
            pred_class = classes[pred_idx]
            pred_conf = float(probs[pred_idx] * 100.0)

            drug_model = self.model_data.get("drug_model")
            drug_hypothesis = "unknown"
            drug_conf = 0.0
            if drug_model:
                drug_classes = self.model_data["drugs"]
                d_probs = drug_model.predict_proba([feat_vec])[0]
                d_idx = int(np.argmax(d_probs))
                drug_hypothesis = drug_classes[d_idx]
                drug_conf = float(d_probs[d_idx] * 100.0)

            # Heuristic profile confirmation for consistency
            if self.profile:
                sat = features.get("sat", 0.0)
                if sat < 18 and pred_class == "POSITIVE":
                    # Desaturated reaction cannot be a valid positive
                    pred_class = "NEGATIVE"
                    pred_conf = max(pred_conf, 80.0)

            return pred_class, round(min(98.0, max(52.0, pred_conf)), 1), drug_hypothesis, round(drug_conf, 1)
        except Exception:
            rb = RuleBasedClassifier(self.profile)
            res, conf = rb.predict(features)
            return res, conf, "unknown", 0.0


# ---------------------------------------------------------------------------
# Decode helpers
# ---------------------------------------------------------------------------

def decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("Invalid image data URL.")
    return base64.b64decode(data_url.split(",", 1)[1])


def load_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("The uploaded image could not be decoded.")
    return img


# ---------------------------------------------------------------------------
# Step 1 – Image quality assessment
# ---------------------------------------------------------------------------

def assess_quality(image: np.ndarray) -> dict:
    h, w = image.shape[:2]
    if w < 240 or h < 180:
        return {"ok": False, "reason": "Image resolution is too low. Use a higher-quality capture."}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    mean_val = float(gray.mean())

    if blur_score < 25:
        return {"ok": False, "reason": "Image is too blurry. Hold the camera steady and retake."}
    if mean_val < 30:
        return {"ok": False, "reason": "Image is too dark. Improve lighting and retake."}
    if mean_val > 235:
        return {"ok": False, "reason": "Image is overexposed. Reduce lighting or adjust camera and retake."}

    quality_label = "GOOD" if blur_score > 100 else "FAIR"
    return {"ok": True, "blur_score": round(blur_score, 1), "mean_brightness": round(mean_val, 1), "quality": quality_label}


# ---------------------------------------------------------------------------
# Step 2 – Reference card detection (prototype heuristic)
# ---------------------------------------------------------------------------

def check_human_subject(image: np.ndarray) -> bool:
    """
    Detect if the capture is dominated by a human face/portrait instead of a test kit.
    Uses skin color segmentation in YCrCb color space over the central ROI.
    """
    h, w = image.shape[:2]
    roi = image[int(h * 0.2):int(h * 0.8), int(w * 0.2):int(w * 0.8)]
    if roi.size == 0:
        return False
    ycrcb = cv2.cvtColor(roi, cv2.COLOR_BGR2YCrCb)
    skin_mask = cv2.inRange(ycrcb, np.array([0, 133, 77]), np.array([255, 173, 127]))
    skin_ratio = float(skin_mask.sum()) / 255.0 / (roi.shape[0] * roi.shape[1])
    return skin_ratio > 0.38


def detect_reference_card(image: np.ndarray) -> dict:
    """
    Looks for a structured reference colour card with multiple distinct colour patches.
    Rejects monochromatic or diffuse room/selfie scenes.
    """
    h, w = image.shape[:2]
    # Check lower portion where reference card is placed
    card_roi = image[int(h * 0.35):, :]
    small = cv2.resize(card_roi, (160, 100))
    pixels = small.reshape(-1, 3).astype(np.float32)

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    try:
        _, _, centers = cv2.kmeans(pixels, 6, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
    except Exception:
        return {"detected": False, "reason": "Reference colour card could not be detected. Ensure the card is visible."}

    centers_bgr = centers.astype(np.uint8).reshape(-1, 1, 3)
    centers_lab = cv2.cvtColor(centers_bgr, cv2.COLOR_BGR2Lab).reshape(-1, 3).astype(float)
    centers_hsv = cv2.cvtColor(centers_bgr, cv2.COLOR_BGR2HSV).reshape(-1, 3).astype(float)

    # Check perceptual distance across clusters in Lab space
    dists = []
    for i in range(len(centers_lab)):
        for j in range(i + 1, len(centers_lab)):
            d = float(np.linalg.norm(centers_lab[i] - centers_lab[j]))
            dists.append(d)

    avg_dist = float(np.mean(dists)) if dists else 0.0

    # A genuine reference card must have at least one bright/white patch (V >= 165, S <= 60)
    has_light_neutral = any(c[2] >= 165 and c[1] <= 60 for c in centers_hsv)
    
    # Must have distinct chromatic patches with good saturation (S >= 50, V >= 40)
    chroma_hues = [c[0] for c in centers_hsv if c[1] >= 50 and c[2] >= 40]
    hue_spread = 0.0
    if len(chroma_hues) >= 2:
        for i in range(len(chroma_hues)):
            for j in range(i + 1, len(chroma_hues)):
                diff = abs(chroma_hues[i] - chroma_hues[j])
                diff = min(diff, 180 - diff)
                if diff > hue_spread:
                    hue_spread = diff

    # Valid card criteria: diverse patches, high color spread, and hue diversity
    is_valid_card = (avg_dist >= 28.0) and (has_light_neutral or len(chroma_hues) >= 3) and (hue_spread >= 24.0 or len(chroma_hues) >= 3)

    if not is_valid_card:
        return {
            "detected": False,
            "reason": "Reference colour card was not detected. Place the official colour card beside the test kit.",
            "patch_spread": round(avg_dist, 1)
        }

    # Sample the white/neutral patch estimate (brightest centre with low saturation)
    neutral_candidates = [c for c in centers_hsv if c[1] <= 60]
    if neutral_candidates:
        brightest_idx = int(np.argmax([c[2] for c in neutral_candidates]))
        white_patch_hsv = neutral_candidates[brightest_idx]
        white_patch_bgr = centers[np.where((centers_hsv == white_patch_hsv).all(axis=1))[0][0]].astype(float)
    else:
        brightness = np.array([0.299 * c[2] + 0.587 * c[1] + 0.114 * c[0] for c in centers])
        white_patch_bgr = centers[np.argmax(brightness)].astype(float)

    return {
        "detected": True,
        "patch_spread": round(avg_dist, 1),
        "white_patch_bgr": white_patch_bgr.tolist(),
        "num_patches": len(centers)
    }


# ---------------------------------------------------------------------------
# Step 3 – Colour calibration / lighting normalisation
# ---------------------------------------------------------------------------

def calibrate_color(image: np.ndarray, card_info: dict) -> tuple[np.ndarray, dict]:
    """
    Reference colour card lighting calibration:
    White-patch illumination normalisation using the detected 6-patch card.
    Divides BGR channels by the estimated white patch and normalises to standard reference luminance.
    Returns (calibrated_image, calibration_meta).
    """
    if not card_info.get("detected"):
        return image, {"applied": False, "factor": 1.0}

    white = np.array(card_info["white_patch_bgr"], dtype=float)
    if white.min() < 1:
        return image, {"applied": False, "factor": 1.0}

    target_white = 200.0
    scale = target_white / white
    calibrated = image.astype(float) * scale[None, None, :]
    calibrated_img = np.clip(calibrated, 0, 255).astype(np.uint8)
    avg_scale = float(scale.mean())
    return calibrated_img, {
        "applied": True,
        "factor": round(avg_scale, 3),
        "white_patch_bgr": [round(float(c), 1) for c in white],
        "scale_bgr": [round(float(s), 3) for s in scale]
    }


# ---------------------------------------------------------------------------
# Step 4 – Reaction region detection (Geometric well detection + central fallback)
# ---------------------------------------------------------------------------

def detect_reaction_region(image: np.ndarray) -> dict:
    """
    Reaction region detection:
    1. Attempts geometric detection of circular reaction well / tube vial using HoughCircles.
    2. If found, extracts the focused inner core (radius * 0.70) to prevent border artifact or background dilution.
    3. Falls back to central rectangular crop (28%–72%) if no distinct circular well is isolated.
    """
    h, w = image.shape[:2]

    # Try detecting circular reaction well
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 1.5)
    min_dim = min(h, w)
    min_r = int(min_dim * 0.08)
    max_r = int(min_dim * 0.42)

    try:
        circles = cv2.HoughCircles(
            blurred, cv2.HOUGH_GRADIENT,
            dp=1.2, minDist=max(20, min_dim // 4),
            param1=50, param2=30,
            minRadius=min_r, maxRadius=max_r
        )
        if circles is not None and len(circles[0]) > 0:
            valid_circles = []
            for c in circles[0]:
                cx, cy, r = int(c[0]), int(c[1]), int(c[2])
                if cy < h * 0.78 and r >= min_r:
                    valid_circles.append((cx, cy, r))

            if valid_circles:
                cx, cy, r = min(valid_circles, key=lambda c: (c[0] - w * 0.4)**2 + (c[1] - h * 0.45)**2)
                core_r = max(8, int(r * 0.70))
                y1, y2 = max(0, cy - core_r), min(h, cy + core_r)
                x1, x2 = max(0, cx - core_r), min(w, cx + core_r)
                roi = image[y1:y2, x1:x2]
                if roi.size > 0:
                    return {
                        "ok": True,
                        "roi": roi,
                        "bbox": [x1, y1, x2, y2],
                        "method": "geometric_circle_well",
                        "circle": {"cx": cx, "cy": cy, "r": r}
                    }
    except Exception:
        pass

    # Fallback: central crop
    y1, y2 = int(h * 0.28), int(h * 0.72)
    x1, x2 = int(w * 0.28), int(w * 0.72)
    roi = image[y1:y2, x1:x2]
    if roi.size == 0:
        return {"ok": False, "reason": "Reaction region could not be extracted from image."}
    return {"ok": True, "roi": roi, "bbox": [x1, y1, x2, y2], "method": "central_crop"}


# ---------------------------------------------------------------------------
# Step 5 & 6 – Feature extraction (Lab colourspace)
# ---------------------------------------------------------------------------

def extract_features(roi_bgr: np.ndarray) -> dict:
    """
    Extract colour features in RGB, HSV, and Lab.
    Prefer Lab for distance calculations (PRD §14, §19).
    """
    rgb = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2Lab)

    pixels_rgb = rgb.reshape(-1, 3)
    pixels_hsv = hsv.reshape(-1, 3)
    pixels_lab = lab.reshape(-1, 3)

    med_rgb = np.median(pixels_rgb, axis=0).astype(float)
    med_hsv = np.median(pixels_hsv, axis=0).astype(float)
    med_lab = np.median(pixels_lab, axis=0).astype(float)

    # CIE Lab coordinates (OpenCV stores L in [0,255], a and b in [0,255] centered at 128)
    L = med_lab[0] / 255.0 * 100.0   # → [0, 100]
    a = med_lab[1] - 128.0           # → [-128, 127]
    b = med_lab[2] - 128.0           # → [-128, 127]

    sample_hex = "#{:02x}{:02x}{:02x}".format(
        int(np.clip(med_rgb[0], 0, 255)),
        int(np.clip(med_rgb[1], 0, 255)),
        int(np.clip(med_rgb[2], 0, 255))
    )

    return {
        "hue": float(med_hsv[0]),
        "sat": float(med_hsv[1]),
        "val": float(med_hsv[2]),
        "L": round(L, 2),
        "a": round(a, 2),
        "b": round(b, 2),
        "sample_rgb": med_rgb.astype(int).tolist(),
        "sample_color": sample_hex
    }


# ---------------------------------------------------------------------------
# Delta E calculation
# ---------------------------------------------------------------------------

def delta_e(features: dict, profile: Optional[dict]) -> float:
    """
    Calculate CIE ΔE between observed colour and the configured positive profile.
    Falls back to distance from neutral grey when no profile is configured.
    NOTE: Not a validated forensic measurement.
    """
    L, a, b = features["L"], features["a"], features["b"]
    if profile and "positive_profile" in profile:
        lab_target = profile["positive_profile"].get("lab_target")
        if lab_target and len(lab_target) == 3:
            return round(float(np.sqrt(
                (L - lab_target[0]) ** 2 +
                (a - lab_target[1]) ** 2 +
                (b - lab_target[2]) ** 2
            )), 2)
    # Default: distance from neutral (50, 0, 0)
    return round(float(np.sqrt((L - 50) ** 2 + a ** 2 + b ** 2)), 2)


# ---------------------------------------------------------------------------
# Main analysis entry point
# ---------------------------------------------------------------------------

def analyze_bytes(data: bytes, test_type: str, profile: Optional[dict] = None) -> dict:
    """
    Full PRAMAAN analysis pipeline.
    Returns a dict matching the PRD §16 analysis response shape.
    """

    # --- Load image ---
    image = load_image(data)

    # Step 1: Quality
    quality = assess_quality(image)
    if not quality["ok"]:
        return {
            "status": "invalid_capture",
            "result": "INVALID CAPTURE",
            "capture_status": "INVALID",
            "reason": quality["reason"],
            "confidence": 0.0,
            "delta_e": 0.0,
            "sample_color": "#808080",
            "reference_detected": False,
            "image_quality": "POOR",
            "classification_method": "prototype_rule_based",
            "warning": "Presumptive field-test result only. Not a laboratory confirmation.",
            "prototype": True
        }

    # Step 1b: Reject human portraits/selfies
    if check_human_subject(image):
        return {
            "status": "invalid_capture",
            "result": "INVALID CAPTURE",
            "capture_status": "INVALID",
            "reason": "Human subject or face detected. Please point the camera directly at the chemical test kit cassette and reference colour card.",
            "confidence": 0.0,
            "delta_e": 0.0,
            "sample_color": "#808080",
            "reference_detected": False,
            "image_quality": "POOR",
            "classification_method": "prototype_rule_based",
            "warning": "Presumptive field-test result only. Not a laboratory confirmation.",
            "prototype": True
        }

    # Step 2: Reference card
    card = detect_reference_card(image)
    if not card["detected"]:
        return {
            "status": "invalid_capture",
            "result": "INVALID CAPTURE",
            "capture_status": "INVALID",
            "reason": card["reason"],
            "confidence": 0.0,
            "delta_e": 0.0,
            "sample_color": "#808080",
            "reference_detected": False,
            "image_quality": quality.get("quality", "FAIR"),
            "classification_method": "prototype_rule_based",
            "warning": "Presumptive field-test result only. Not a laboratory confirmation.",
            "prototype": True
        }

    # Step 3: Lighting calibration using in-frame reference colour card
    calibrated, calib_meta = calibrate_color(image, card)

    # Step 4: Reaction region
    region = detect_reaction_region(calibrated)
    if not region["ok"]:
        return {
            "status": "invalid_capture",
            "result": "INVALID CAPTURE",
            "capture_status": "INVALID",
            "reason": region["reason"],
            "confidence": 0.0,
            "delta_e": 0.0,
            "sample_color": "#808080",
            "reference_detected": True,
            "calibration_applied": calib_meta.get("applied", False),
            "image_quality": quality.get("quality", "FAIR"),
            "classification_method": "ML_Colorimetric_Model_v1",
            "warning": "Presumptive field-test result only. Not a laboratory confirmation.",
            "prototype": True
        }

    # Steps 5 & 6: Features
    features = extract_features(region["roi"])

    # ΔE
    de = delta_e(features, profile)

    # Step 7: Classify with MLClassifier (trained on SIH26231 dataset)
    ml_clf = MLClassifier(profile=profile, test_type=test_type)
    result, confidence, drug_hyp, drug_conf = ml_clf.predict(features, region["roi"])
    method_name = "ML_Colorimetric_Model_v1 (Calibrated Random Forest)" if ml_clf.model_data else "prototype_rule_based"

    # Step 8: Presumptive classification message
    if result == "POSITIVE":
        drug_note = f" (detected reaction signature: {drug_hyp.capitalize()}, {drug_conf:.1f}% match)" if drug_hyp != "unknown" else ""
        message = f"Presumptive field-test classification: colour response is POSITIVE for {test_type}{drug_note}."
    elif result == "NEGATIVE":
        message = f"Presumptive field-test classification: colour response is NEGATIVE (remained neutral/baseline)."
    else:
        message = "Colour signal is ambiguous or intermediate; result is INCONCLUSIVE. Recommend repeating under controlled lighting or sending for laboratory confirmation."

    return {
        "status": "success",
        "result": result,
        "capture_status": "VALID",
        "confidence": round(confidence, 1),
        "delta_e": de,
        "sample_color": features["sample_color"],
        "sample_rgb": features["sample_rgb"],
        "reference_detected": True,
        "calibration_applied": calib_meta.get("applied", False),
        "lighting_factor": calib_meta.get("factor", 1.0),
        "drug_hypothesis": drug_hyp,
        "drug_confidence": round(drug_conf, 1),
        "image_quality": quality.get("quality", "GOOD"),
        "classification_method": method_name,
        "message": message,
        "warning": "Presumptive field-test result only. Not a laboratory confirmation.",
        "prototype": True
    }
