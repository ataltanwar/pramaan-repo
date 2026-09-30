"""
PRAMAAN - Machine Learning Model Trainer for Colorimetric Prototype Dataset
===========================================================================
Smart India Hackathon 2026 | Problem Statement SIH26231

Trains an ML classifier on the SIH26231 synthetic colorimetric dataset
(1,260 images: 840 train / 210 val / 210 test across 7 drugs and 3 outcome classes).

Outputs:
  - backend/app/models/colorimetric_ml_model.joblib
  - backend/app/models/model_metrics.json
"""

import csv
import json
import time
from pathlib import Path
import cv2
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import joblib

BASE_DIR = Path(__file__).resolve().parents[3]
DATASET_DIR = BASE_DIR / "colorimetric_prototype_dataset" / "SIH26231_synthetic_colorimetric_dataset"
MODELS_DIR = Path(__file__).resolve().parent
METADATA_FILE = DATASET_DIR / "metadata.csv"

def extract_well_features(img_bgr: np.ndarray) -> np.ndarray:
    """
    Extract color, texture, and contrast features from the central reaction well ROI.
    """
    h, w = img_bgr.shape[:2]
    cy, cx = h // 2, w // 2
    r_core = int(min(h, w) * 0.26)
    r_outer = int(min(h, w) * 0.44)

    # Core reaction well ROI
    core_roi = img_bgr[cy - r_core:cy + r_core, cx - r_core:cx + r_core]
    # Background/periphery ROI (corners of the crop)
    mask = np.ones((h, w), dtype=bool)
    cv2.circle(mask, (cx, cy), r_outer, False, -1)
    bg_pixels = img_bgr[mask]

    # Convert core to multiple color spaces
    rgb = cv2.cvtColor(core_roi, cv2.COLOR_BGR2RGB).astype(float)
    hsv = cv2.cvtColor(core_roi, cv2.COLOR_BGR2HSV).astype(float)
    lab = cv2.cvtColor(core_roi, cv2.COLOR_BGR2Lab).astype(float)

    # Scale Lab to CIE standard: L in [0,100], a in [-128,127], b in [-128,127]
    L = lab[:, :, 0] / 255.0 * 100.0
    a = lab[:, :, 1] - 128.0
    b = lab[:, :, 2] - 128.0

    # Color moments
    rgb_mean = rgb.mean(axis=(0, 1))
    rgb_std = rgb.std(axis=(0, 1))
    rgb_median = np.median(rgb, axis=(0, 1))

    hsv_mean = hsv.mean(axis=(0, 1))
    hsv_std = hsv.std(axis=(0, 1))
    hsv_median = np.median(hsv, axis=(0, 1))

    L_mean, L_std, L_median = float(L.mean()), float(L.std()), float(np.median(L))
    a_mean, a_std, a_median = float(a.mean()), float(a.std()), float(np.median(a))
    b_mean, b_std, b_median = float(b.mean()), float(b.std()), float(np.median(b))

    # Circular hue features (prevents boundary wrap discontinuity at 0/180)
    hue_rad = hsv_median[0] / 180.0 * np.pi * 2.0
    sin_hue = float(np.sin(hue_rad))
    cos_hue = float(np.cos(hue_rad))

    # Color difference Delta E from neutral gray (L=50, a=0, b=0)
    delta_e_neutral = float(np.sqrt((L_median - 50.0)**2 + a_median**2 + b_median**2))

    # Chroma = sqrt(a^2 + b^2)
    chroma = float(np.sqrt(a_median**2 + b_median**2))

    # Contrast ratio vs surrounding background
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

FEATURE_NAMES = [
    "r_mean", "g_mean", "b_mean",
    "r_std", "g_std", "b_std",
    "r_median", "g_median", "b_median",
    "h_mean", "s_mean", "v_mean",
    "h_std", "s_std", "v_std",
    "h_median", "s_median", "v_median",
    "L_mean", "L_std", "L_median",
    "a_mean", "a_std", "a_median",
    "b_mean", "b_std", "b_median",
    "sin_hue", "cos_hue",
    "delta_e_neutral", "chroma", "contrast"
]

def load_dataset_features():
    with open(METADATA_FILE, mode="r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    print(f"Loaded metadata with {len(reader)} records.")

    features = []
    rows = []

    t0 = time.time()
    for row in reader:
        img_path = DATASET_DIR / row["image_path"]
        if not img_path.exists():
            continue
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        feat = extract_well_features(img)
        features.append(feat)
        rows.append(row)

    print(f"Extracted features for {len(features)} images in {time.time() - t0:.2f}s.")
    X = np.vstack(features)
    return X, rows

def train_and_evaluate():
    print("=" * 60)
    print("PRAMAAN SIH26231 - Training Colorimetric ML Classifier")
    print("=" * 60)

    X, rows = load_dataset_features()

    splits = np.array([r["split"] for r in rows])
    classes = np.array([r["class"].upper() for r in rows])
    drugs = np.array([r["drug"].lower() for r in rows])

    train_mask = splits == "train"
    val_mask = splits == "val"
    test_mask = splits == "test"

    X_train, y_outcome_train = X[train_mask], classes[train_mask]
    X_val, y_outcome_val = X[val_mask], classes[val_mask]
    X_test, y_outcome_test = X[test_mask], classes[test_mask]

    print(f"Splits -> Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    # 1. Outcome Classifier (POSITIVE / NEGATIVE / INCONCLUSIVE)
    # Using Random Forest with probability calibration
    base_rf = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        min_samples_split=4,
        random_state=42,
        class_weight="balanced"
    )
    # Combine train + val for calibrated fitting
    X_train_val = np.vstack([X_train, X_val])
    y_train_val = np.concatenate([y_outcome_train, y_outcome_val])

    base_rf.fit(X_train_val, y_train_val)
    outcome_model = CalibratedClassifierCV(estimator=base_rf, method="sigmoid", cv=5)
    outcome_model.fit(X_train_val, y_train_val)

    outcome_preds = outcome_model.predict(X_test)
    outcome_acc = accuracy_score(y_outcome_test, outcome_preds)
    outcome_report = classification_report(y_outcome_test, outcome_preds, output_dict=True)

    print("\n--- Outcome Classification Report (Test Set) ---")
    print(classification_report(y_outcome_test, outcome_preds))
    print(f"Test Accuracy: {outcome_acc * 100:.2f}%")

    # 2. Drug Identification Classifier (7 drugs)
    drug_rf = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        random_state=42,
        class_weight="balanced"
    )
    # Filter to positive samples for drug signature identification
    pos_mask = classes == "POSITIVE"
    conclusive_mask_train = (splits != "test") & pos_mask
    conclusive_mask_test = (splits == "test") & pos_mask

    drug_rf.fit(X[conclusive_mask_train], drugs[conclusive_mask_train])
    drug_preds = drug_rf.predict(X[conclusive_mask_test])
    drug_acc = accuracy_score(drugs[conclusive_mask_test], drug_preds)
    print(f"\nPositive Reaction Drug Signature Accuracy: {drug_acc * 100:.2f}%")

    # Save model artifact
    model_artifact = {
        "outcome_model": outcome_model,
        "drug_model": drug_rf,
        "feature_names": FEATURE_NAMES,
        "classes": outcome_model.classes_.tolist(),
        "drugs": drug_rf.classes_.tolist(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_accuracy": float(outcome_acc),
        "test_drug_accuracy": float(drug_acc)
    }

    model_path = MODELS_DIR / "colorimetric_ml_model.joblib"
    joblib.dump(model_artifact, model_path)
    print(f"\nModel artifact saved to: {model_path}")

    # Save metrics JSON for documentation and evaluation reporting
    metrics = {
        "dataset": "SIH26231 Synthetic Colorimetric Prototype CV Dataset",
        "model_architecture": "RandomForest + CalibratedClassifierCV (Sigmoid)",
        "features_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "splits": {
            "train": int(len(X_train)),
            "val": int(len(X_val)),
            "test": int(len(X_test)),
            "total": int(len(X))
        },
        "test_metrics": {
            "outcome_accuracy": round(float(outcome_acc), 4),
            "outcome_report": outcome_report,
            "drug_signature_accuracy": round(float(drug_acc), 4)
        },
        "outcome_classes": outcome_model.classes_.tolist(),
        "drugs_covered": drug_rf.classes_.tolist(),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    metrics_path = MODELS_DIR / "model_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2))
    print(f"Metrics saved to: {metrics_path}")

if __name__ == "__main__":
    train_and_evaluate()
