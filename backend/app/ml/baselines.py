"""
Baselines — à battre avant toute conservation d'un modèle ML.

1. FWI seul : score = normalize(FWI) → AUC-PR, Brier
2. FWI + coefficient local : score = combine(FWI, coeff_local)
   (le produit actuel de la PHASE 4, sans ML)

Règle (SPEC §PHASE 5):
  Aucun modèle appris n'est conservé s'il ne bat pas significativement
  le baseline FWI + coefficient local en validation spatiale par blocs.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass
from typing import Callable


@dataclass
class BaselineResult:
    """Baseline evaluation result."""

    name: str
    auc_pr: float
    brier: float
    auc_roc: float
    precision_at_thresholds: dict[str, float]  # thresholds → precision
    recall_at_thresholds: dict[str, float]  # thresholds → recall


class FWIBaseline:
    """FWI-only baseline: uses normalized FWI as the risk score.

    FWI is normalized to [0, 1] using the EFFIS scale.
    FWI=0 → score=0, FWI=50 → score=1.0
    """

    def predict(self, fwi_values: np.ndarray) -> np.ndarray:
        """Predict risk score from FWI alone."""
        return np.clip(fwi_values / 50.0, 0.0, 1.0)

    def evaluate(self, fwi_values: np.ndarray, y_true: np.ndarray) -> BaselineResult:
        """Evaluate FWI-only baseline."""
        y_score = self.predict(fwi_values)
        return self._compute_metrics("FWI seul", y_true, y_score)


class FWIandCoeffBaseline:
    """FWI + coefficient local baseline.

    score = 0.6 * normalize(FWI) + 0.4 * coefficient_local

    This represents the current PHASE 4 product (without any ML).
    """

    def predict(self, fwi_values: np.ndarray,
                coeff_values: np.ndarray) -> np.ndarray:
        """Predict from FWI + local coefficient."""
        fwi_norm = np.clip(fwi_values / 50.0, 0.0, 1.0)
        return 0.6 * fwi_norm + 0.4 * coeff_values

    def evaluate(self, fwi_values: np.ndarray,
                 coeff_values: np.ndarray,
                 y_true: np.ndarray) -> BaselineResult:
        """Evaluate FWI+coeff baseline."""
        y_score = self.predict(fwi_values, coeff_values)
        return self._compute_metrics("FWI + coefficient local", y_true, y_score)

    def _compute_metrics(self, name: str, y_true: np.ndarray,
                         y_score: np.ndarray) -> BaselineResult:
        """Compute AUC-PR, Brier, AUC-ROC for the baseline."""
        from sklearn.metrics import (
            average_precision_score,
            brier_score_loss,
            roc_auc_score,
            precision_recall_curve,
        )

        # AUC-PR (primary metric for imbalanced classes)
        auc_pr = average_precision_score(y_true, y_score)

        # Brier score
        brier = brier_score_loss(y_true, y_score)

        # AUC-ROC (secondary — can be misleading with imbalance)
        try:
            auc_roc = roc_auc_score(y_true, y_score)
        except ValueError:
            auc_roc = 0.0

        # Precision/recall at thresholds
        precisions, recalls, thresholds = precision_recall_curve(y_true, y_score)
        thr_dict = {}
        for i, thr in enumerate(thresholds[::max(1, len(thresholds)//10)]):
            thr_key = f"{thr:.2f}"
            thr_dict[thr_key] = {
                "precision": float(precisions[i]),
                "recall": float(recalls[i]),
            }

        return BaselineResult(
            name=name,
            auc_pr=round(auc_pr, 4),
            brier=round(brier, 4),
            auc_roc=round(auc_roc, 4),
            precision_at_thresholds={k: v["precision"] for k, v in thr_dict.items()},
            recall_at_thresholds={k: v["recall"] for k, v in thr_dict.items()},
        )
