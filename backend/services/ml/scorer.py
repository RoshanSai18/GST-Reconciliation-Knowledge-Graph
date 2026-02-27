"""
scorer.py — Score every vendor (or a single vendor) and persist results to Neo4j.

Compliance Score (0–100)
------------------------
  Base penalties (rule-based):
    – high_risk_ratio    × 35
    – warning_ratio      × 15
    – late_filing_rate   × 20
    – missing_payment_rate × 10
    – amendment_rate     × 10
    – value_mismatch_rate × 5
    – avg_delay_days capped at 90 days → proportional 5 pts

  IsolationForest boost (optional):
    – IF anomaly score is [-1, 0] (scaled). Map to 0-5 extra deduction.

  Final score = max(0, min(100, 100 - total_penalty))

Risk level thresholds:
    ≥ 75  → Low
    ≥ 50  → Medium
    < 50  → High
"""

from __future__ import annotations

import logging
from pathlib import Path

import joblib
import numpy as np

from services.ml.feature_extractor import (
    FEATURE_NAMES,
    extract_features,
    to_matrix,
)
from services.ingestion.graph_builder import write_taxpayer_scores_batch

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR    = _BACKEND_DIR / "data" / "models"
IF_PATH      = MODEL_DIR / "isolation_forest.pkl"
SCALER_PATH  = MODEL_DIR / "scaler.pkl"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_models() -> tuple:
    """Load IsolationForest + scaler if available. Return (iso, scaler) or (None, None)."""
    try:
        iso    = joblib.load(IF_PATH)
        scaler = joblib.load(SCALER_PATH)
        return iso, scaler
    except Exception as exc:
        logger.info("ML models not found (%s) — using rule-based scoring only", exc)
        return None, None


def _compute_rule_score(feat: dict) -> float:
    """Compute rule-based compliance score from feature dict."""
    penalty = 0.0
    penalty += feat.get("high_risk_ratio",     0.0) * 35.0
    penalty += feat.get("warning_ratio",        0.0) * 15.0
    penalty += feat.get("late_filing_rate",     0.0) * 20.0
    penalty += feat.get("missing_payment_rate", 0.0) * 10.0
    penalty += feat.get("amendment_rate",       0.0) * 10.0
    penalty += feat.get("value_mismatch_rate",  0.0) *  5.0

    # avg_delay_days: 0 → 90+ days maps to 0 → 5 pt penalty
    delay_ratio = min(feat.get("avg_delay_days", 0.0) / 90.0, 1.0)
    penalty     += delay_ratio * 5.0

    return max(0.0, min(100.0, 100.0 - penalty))


def _apply_if_adjustment(base_score: float, if_raw_score: float) -> float:
    """
    IsolationForest.score_samples() returns a float; more negative = more anomalous.
    Typical range: [-0.7, 0.1].  Map to [0, 5] extra deduction.
    """
    # Normalise to [0, 1], 0 = normal, 1 = most anomalous
    clipped = max(-0.8, min(0.2, if_raw_score))
    anomaly = (0.2 - clipped) / 1.0        # higher when clipped is more negative
    penalty = anomaly * 5.0
    return max(0.0, min(100.0, base_score - penalty))


def _risk_level(score: float) -> str:
    if score >= 75.0:
        return "Low"
    if score >= 50.0:
        return "Medium"
    return "High"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_all_vendors() -> dict:
    """
    Score every vendor, persist results to Neo4j, return summary.
    """
    feature_rows = extract_features()
    if not feature_rows:
        return {"status": "error", "message": "No feature data available", "count": 0}

    iso, scaler = _load_models()

    # Compute IF scores if models are present
    if_scores: dict[str, float] = {}
    if iso is not None and scaler is not None:
        try:
            gstins, X_raw = to_matrix(feature_rows)
            X_arr  = np.array(X_raw, dtype=float)
            X_sc   = scaler.transform(X_arr)
            raw_if = iso.score_samples(X_sc)     # shape (n,)
            if_scores = {g: float(s) for g, s in zip(gstins, raw_if)}
        except Exception as exc:
            logger.warning("IF scoring failed: %s", exc)

    updates: list[dict] = []
    for feat in feature_rows:
        gstin      = feat["gstin"]
        base_score = _compute_rule_score(feat)

        if gstin in if_scores:
            score = _apply_if_adjustment(base_score, if_scores[gstin])
        else:
            score = base_score

        score = round(score, 2)
        updates.append({
            "gstin":      gstin,
            "risk_score": score,
            "risk_level": _risk_level(score),
        })

    # Persist all scores to Neo4j in one batch
    write_taxpayer_scores_batch(updates)

    low    = sum(1 for u in updates if u["risk_level"] == "Low")
    medium = sum(1 for u in updates if u["risk_level"] == "Medium")
    high   = sum(1 for u in updates if u["risk_level"] == "High")

    logger.info(
        "Scored %d vendors — Low:%d  Medium:%d  High:%d",
        len(updates), low, medium, high,
    )
    return {
        "status":       "ok",
        "total_scored": len(updates),
        "low":          low,
        "medium":       medium,
        "high":         high,
    }


def score_vendor(gstin: str) -> dict:
    """
    Score a single vendor and persist the result.
    Returns the score dict or raises ValueError if not found.
    """
    feature_rows = extract_features()
    row = next((r for r in feature_rows if r["gstin"] == gstin), None)
    if row is None:
        raise ValueError(f"No feature data for GSTIN: {gstin}")

    iso, scaler = _load_models()
    base_score  = _compute_rule_score(row)

    if iso is not None and scaler is not None:
        try:
            X_arr = np.array(
                [[float(row[f]) for f in FEATURE_NAMES]], dtype=float
            )
            X_sc       = scaler.transform(X_arr)
            raw_if     = iso.score_samples(X_sc)[0]
            final_score = _apply_if_adjustment(base_score, float(raw_if))
        except Exception as exc:
            logger.warning("IF single-vendor scoring failed: %s", exc)
            final_score = base_score
    else:
        final_score = base_score

    final_score = round(final_score, 2)
    risk_lvl    = _risk_level(final_score)

    write_taxpayer_scores_batch([{
        "gstin":      gstin,
        "risk_score": final_score,
        "risk_level": risk_lvl,
    }])

    return {
        "gstin":            gstin,
        "compliance_score": final_score,
        "risk_level":       risk_lvl,
        "features":         row,
    }
