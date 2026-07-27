"""
Tests for drift detection.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.ml.drift import DriftDetector


class TestDriftDetection:
    """Population Stability Index for feature drift."""

    def test_no_drift(self):
        """Identical distributions → no alert."""
        data = np.random.normal(0, 1, (1000, 5))
        reference = data.copy()

        detector = DriftDetector(reference, n_bins=10, psi_threshold=0.2)
        report = detector.check(data)
        assert not report.alert
        assert report.mean_drift_score < 0.2

    def test_drift_detected(self):
        """Different distributions → alert."""
        reference = np.random.normal(0, 1, (1000, 3))
        current = np.random.normal(5, 2, (1000, 3))  # shifted

        detector = DriftDetector(reference, feature_names=["a", "b", "c"], n_bins=10, psi_threshold=0.1)
        report = detector.check(current)
        assert report.n_drifted > 0

    def test_set_reference(self):
        """set_reference() updates the reference distribution."""
        data = np.random.normal(0, 1, (100, 2))
        detector = DriftDetector()
        detector.set_reference(data, ["f1", "f2"])
        assert detector.reference is not None
        assert len(detector.feature_names) == 2

    def test_no_reference_no_check(self):
        """No reference set → no alert."""
        detector = DriftDetector()
        report = detector.check(np.random.normal(0, 1, (100, 2)))
        assert not report.alert
        assert report.n_features == 0
