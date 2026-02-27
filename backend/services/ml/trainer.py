"""
trainer.py — Train IsolationForest + RandomForestClassifier on vendor feature vectors.

Saves artefacts to:
    data/models/isolation_forest.pkl
    data/models/random_forest.pkl
    data/models/feature_meta.json  (feature names + training timestamp)

Usage
-----
    from services.ml.trainer import train_all
    result = train_all()
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler

from services.ml.feature_extractor import FEATURE_NAMES, extract_features, to_matrix

logger = logging.getLogger(__name__)

# Resolve model storage directory relative to this file
_BACKEND_DIR = Path(__file__).resolve().parents[2]          # …/backend/
MODEL_DIR     = _BACKEND_DIR / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

IF_PATH      = MODEL_DIR / "isolation_forest.pkl"
RF_PATH      = MODEL_DIR / "random_forest.pkl"
SCALER_PATH  = MODEL_DIR / "scaler.pkl"
META_PATH    = MODEL_DIR / "feature_meta.json"


def _get_labels_from_graph(gstins: list[str]) -> np.ndarray | None:
    """
    Pull majority invoice risk_level per taxpayer from Neo4j to create
    binary labels (1 = risky, 0 = clean) for supervised training.
    Returns None when insufficient labelled data is available.
    """
    from database.neo4j_client import run_query

    LABEL_QUERY = """
    MATCH (i:Invoice)-[:ISSUED_BY]->(t:Taxpayer)
    WHERE i.status IS NOT NULL
    WITH t.gstin AS gstin,
         count(CASE WHEN i.status IN ['High-Risk', 'Warning'] THEN 1 END) AS risky,
         count(i) AS total
    RETURN gstin, risky, total
    """
    try:
        rows = run_query(LABEL_QUERY)
    except Exception as exc:
        logger.warning("Label query failed — skipping RandomForest: %s", exc)
        return None

    label_map: dict[str, int] = {}
    for r in rows:
        g = r.get("gstin")
        if g and r.get("total", 0) > 0:
            ratio = (r["risky"] or 0) / r["total"]
            label_map[g] = 1 if ratio >= 0.3 else 0

    if len(label_map) < 20:
        logger.info("Too few labelled samples (%d) — skipping RandomForest", len(label_map))
        return None

    labels = np.array([label_map.get(gstin, 0) for gstin in gstins])
    unique, counts = np.unique(labels, return_counts=True)
    logger.info("Label distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
    return labels


def train_all() -> dict:
    """
    Extract features, train models, save artefacts.
    Returns a summary dict.
    """
    logger.info("Starting model training …")
    feature_rows = extract_features()
    if not feature_rows:
        return {"status": "error", "message": "No feature data available"}

    gstins, X_raw = to_matrix(feature_rows)
    X_arr = np.array(X_raw, dtype=float)

    n_samples, n_features = X_arr.shape
    logger.info("Training matrix: %d samples × %d features", n_samples, n_features)

    # ── Scale features ────────────────────────────────────────────────────
    scaler = MinMaxScaler()
    X = scaler.fit_transform(X_arr)
    joblib.dump(scaler, SCALER_PATH)

    # ── IsolationForest (unsupervised) ────────────────────────────────────
    contamination = min(0.15, max(0.01, 1 / max(n_samples, 1)))
    iso = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(X)
    joblib.dump(iso, IF_PATH)
    logger.info("IsolationForest saved to %s", IF_PATH)

    # ── RandomForestClassifier (supervised, optional) ─────────────────────
    rf_trained = False
    labels = _get_labels_from_graph(gstins)
    if labels is not None:
        rf = RandomForestClassifier(
            n_estimators=300,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        )
        rf.fit(X, labels)
        joblib.dump(rf, RF_PATH)
        logger.info("RandomForest saved to %s", RF_PATH)
        rf_trained = True

    # ── Feature metadata ──────────────────────────────────────────────────
    meta = {
        "feature_names":  FEATURE_NAMES,
        "n_samples":      n_samples,
        "n_features":     n_features,
        "rf_trained":     rf_trained,
        "trained_at":     datetime.now(timezone.utc).isoformat(),
    }
    META_PATH.write_text(json.dumps(meta, indent=2))

    return {
        "status":       "ok",
        "n_vendors":    n_samples,
        "rf_trained":   rf_trained,
        "model_dir":    str(MODEL_DIR),
        "trained_at":   meta["trained_at"],
    }
