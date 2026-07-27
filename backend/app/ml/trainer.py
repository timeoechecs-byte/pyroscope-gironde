"""
Pipeline d'entraînement ML — XGBoost, LightGBM, CatBoost, ensemble, SHAP.

Validation temporelle par blocs (forward-chaining) + spatiale par blocs (GroupKFold).
Métriques : AUC-PR, Brier, courbe de calibration.
Aucune AUC-ROC seule présentée comme métrique principale.
Calibration Platt/isotonique (interne, jamais affichée en pourcentage).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import numpy as np

logger = logging.getLogger("pyroscope.ml.trainer")


@dataclass
class FoldMetrics:
    """Metrics for a single validation fold."""

    fold_name: str
    auc_pr: float
    brier: float
    auc_roc: float
    n_train: int
    n_test: int
    n_positives_test: int


@dataclass
class ModelResult:
    """Complete model evaluation result."""

    model_name: str
    fold_metrics: list[FoldMetrics]
    mean_auc_pr: float
    std_auc_pr: float
    mean_brier: float
    mean_auc_roc: float
    shap_values: np.ndarray | None = None
    feature_importance: dict[str, float] | None = None


class BlockedTimeSeriesSplit:
    """Validation temporelle par blocs (forward-chaining).

    Split les données par année pour éviter la fuite d'information du futur.

    Exemple:
        split = BlockedTimeSeriesSplit(years=[2006, 2007, ..., 2024], n_test_years=2)
        for train_years, test_years in split:
            # train: 2006-2014, test: 2015-2016
            # train: 2006-2016, test: 2017-2018
            # ...
    """

    def __init__(self, years: list[int], n_test_years: int = 2,
                 min_train_years: int = 5):
        self.years = sorted(years)
        self.n_test = n_test_years
        self.min_train = min_train_years

    def split(self):
        """Yield (train_years, test_years) tuples."""
        for i in range(self.min_train, len(self.years) - self.n_test + 1):
            train = self.years[:i]
            test = self.years[i:i + self.n_test]
            yield train, test


class SpatialBlockSplit:
    """Validation spatiale par blocs.

    Découpe la Gironde en blocs géographiques.
    Chaque bloc est laissé hors de l'entraînement à tour de rôle.

    Blocs : 10 km × 10 km → ~40 blocs sur la Gironde.
    """

    def __init__(self, n_blocks: int = 10):
        self.n_blocks = n_blocks

    def get_block(self, latitude: float, longitude: float) -> int:
        """Assign a cell to a spatial block based on its coordinates."""
        # BBOX: lon [-1.35, 0.35], lat [44.15, 45.60]
        lon_block = int((longitude + 1.35) / (1.70 / self.n_blocks))
        lat_block = int((latitude - 44.15) / (1.45 / self.n_blocks))
        hash_val = (lat_block * 31 + lon_block) % self.n_blocks
        return hash_val


class MLTrainer:
    """Trains and evaluates ML models with proper validation.

    PHASE 5 — implementation steps:
    1. XGBoost
    2. LightGBM
    3. CatBoost
    4. Ensemble (weighted average)
    5. Calibration (Platt / isotonic)
    6. SHAP
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.models: dict[str, Any] = {}

    def train_xgboost(self, X_train: np.ndarray, y_train: np.ndarray,
                      **kwargs) -> Any:
        """Train an XGBoost classifier."""
        import xgboost as xgb

        params = {
            "n_estimators": kwargs.get("n_estimators", 500),
            "max_depth": kwargs.get("max_depth", 6),
            "learning_rate": kwargs.get("learning_rate", 0.05),
            "subsample": kwargs.get("subsample", 0.8),
            "colsample_bytree": kwargs.get("colsample_bytree", 0.8),
            "scale_pos_weight": kwargs.get(
                "scale_pos_weight",
                max(1.0, (len(y_train) - y_train.sum()) / max(y_train.sum(), 1)),
            ),
            "eval_metric": "logloss",
            "random_state": self.random_state,
            "n_jobs": -1,
        }
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train)
        self.models["xgboost"] = model
        logger.info("train.xgboost_done", params=params)
        return model

    def train_lightgbm(self, X_train: np.ndarray, y_train: np.ndarray,
                       **kwargs) -> Any:
        """Train a LightGBM classifier."""
        import lightgbm as lgb

        params = {
            "n_estimators": kwargs.get("n_estimators", 500),
            "max_depth": kwargs.get("max_depth", 8),
            "learning_rate": kwargs.get("learning_rate", 0.05),
            "num_leaves": kwargs.get("num_leaves", 31),
            "subsample": kwargs.get("subsample", 0.8),
            "colsample_bytree": kwargs.get("colsample_bytree", 0.8),
            "class_weight": kwargs.get(
                "class_weight", "balanced"
            ),
            "random_state": self.random_state,
            "n_jobs": -1,
            "verbose": -1,
        }
        model = lgb.LGBMClassifier(**params)
        model.fit(X_train, y_train)
        self.models["lightgbm"] = model
        logger.info("train.lightgbm_done")
        return model

    def train_catboost(self, X_train: np.ndarray, y_train: np.ndarray,
                       **kwargs) -> Any:
        """Train a CatBoost classifier."""
        from catboost import CatBoostClassifier

        params = {
            "iterations": kwargs.get("iterations", 500),
            "depth": kwargs.get("depth", 6),
            "learning_rate": kwargs.get("learning_rate", 0.05),
            "auto_class_weights": kwargs.get(
                "auto_class_weights", "Balanced"
            ),
            "random_seed": self.random_state,
            "verbose": False,
        }
        model = CatBoostClassifier(**params)
        model.fit(X_train, y_train)
        self.models["catboost"] = model
        logger.info("train.catboost_done")
        return model

    def train_ensemble(self, X_train: np.ndarray, y_train: np.ndarray,
                       X_val: np.ndarray | None = None,
                       y_val: np.ndarray | None = None) -> dict[str, Any]:
        """Train all models and create a weighted ensemble.

        Weights are based on validation AUC-PR per model.
        """
        models = {
            "xgboost": self.train_xgboost(X_train, y_train),
            "lightgbm": self.train_lightgbm(X_train, y_train),
            "catboost": self.train_catboost(X_train, y_train),
        }

        # Weight by validation performance
        weights = {}
        if X_val is not None and y_val is not None:
            from sklearn.metrics import average_precision_score

            for name, model in models.items():
                y_pred = model.predict_proba(X_val)[:, 1]
                auc_pr = average_precision_score(y_val, y_pred)
                weights[name] = max(auc_pr, 0.01)

            # Normalize weights
            total = sum(weights.values())
            weights = {k: v / total for k, v in weights.items()}
        else:
            weights = {"xgboost": 0.4, "lightgbm": 0.35, "catboost": 0.25}

        self.models["ensemble"] = {"models": models, "weights": weights}
        logger.info("train.ensemble_done", weights=weights)
        return models

    def predict_ensemble(self, X: np.ndarray) -> np.ndarray:
        """Predict with weighted ensemble."""
        ensemble = self.models.get("ensemble")
        if not ensemble:
            # Use XGBoost as default
            return self.models["xgboost"].predict_proba(X)[:, 1]

        models = ensemble["models"]
        weights = ensemble["weights"]
        preds = np.zeros(len(X))

        for name, model in models.items():
            preds += weights[name] * model.predict_proba(X)[:, 1]

        return preds

    def compute_shap(self, model: Any, X: np.ndarray,
                     feature_names: list[str]) -> tuple[np.ndarray, dict[str, float]]:
        """Compute SHAP values for model interpretability.

        Returns:
            (shap_values, feature_importance)
        """
        import shap

        explainer = shap.Explainer(model, X)
        shap_values = explainer(X)

        mean_shap = np.abs(shap_values.values).mean(axis=0)
        importance = dict(zip(feature_names, mean_shap.tolist()))
        importance = dict(sorted(importance.items(), key=lambda x: -x[1]))

        return shap_values.values, importance
