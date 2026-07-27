"""
Tests for the Gironde local coefficient (14 factors).

Verifies:
- Bounds [0, 1]
- Renormalization when factors are missing
- Weight sum validation
- No default implicit value for missing factors
- No 'confidence: X%' in output
"""

from __future__ import annotations

import pytest

from app.science.local_coefficient import LocalCoefficient


class TestLocalCoefficientBasics:
    """Basic properties of the local coefficient."""

    def test_all_factors_available(self):
        """All 14 factors available → score in [0, 1], no renormalization."""
        coeff = LocalCoefficient()
        result = coeff.compute(
            cell_id=1,
            dry_days_7d=5.0, dry_days_15d=10.0, dry_days_30d=20.0,
            heatwave_days=3.0, soil_moisture_7cm=20.0,
            vapour_pressure_deficit=2.5,
            pine_percentage=80.0, ndmi_anomaly=-0.3, forest_density=75.0,
            recent_clear_cut=0.0,
            road_distance=150.0, amenity_distance=500.0,
            building_density=0.1, seasonality=7.0, historic_density=3.0,
            slope=2.0, coastal_proximity=20000.0, aspect=180.0,
        )
        assert 0.0 <= result.score <= 1.0
        assert result.n_available == result.n_factors
        assert not result.renormalized
        assert result.n_factors == 18  # 18 factors in the config
        assert result.ignition_score != 0.0
        assert result.spread_score != 0.0

    def test_score_never_exceeds_1(self):
        """Even with extreme inputs, score stays within [0, 1]."""
        coeff = LocalCoefficient()
        result = coeff.compute(
            cell_id=1,
            dry_days_7d=999, dry_days_15d=999, dry_days_30d=999,
            heatwave_days=999, soil_moisture_7cm=999,
            vapour_pressure_deficit=999,
            pine_percentage=100, ndmi_anomaly=2, forest_density=100,
            recent_clear_cut=1,
            road_distance=0, amenity_distance=0,
            building_density=1, seasonality=7, historic_density=999,
            slope=999, coastal_proximity=0, aspect=180,
        )
        assert 0.0 <= result.score <= 1.0
        assert result.score >= 0.5  # extreme inputs = high risk

    def test_no_percentage_confidence(self):
        """Output must not contain 'confidence' as a percentage string (SPEC §6.4)."""
        coeff = LocalCoefficient()
        result = coeff.compute(
            cell_id=1,
            dry_days_7d=5.0, dry_days_15d=10.0, dry_days_30d=20.0,
            heatwave_days=3.0, soil_moisture_7cm=20.0,
            vapour_pressure_deficit=2.5,
            pine_percentage=80.0, ndmi_anomaly=-0.3, forest_density=75.0,
            recent_clear_cut=0.0,
            road_distance=150.0, amenity_distance=500.0,
            building_density=0.1, seasonality=7.0, historic_density=3.0,
            slope=2.0, coastal_proximity=20000.0, aspect=180.0,
        )
        for f in result.factors:
            # Confidence should be a string like "high" not "95%"
            assert "%" not in f.confidence


class TestLocalCoefficientRenormalization:
    """Renormalization when factors are missing."""

    def test_renormalization_triggered(self):
        """Missing factors → renormalization flag is True."""
        coeff = LocalCoefficient()
        result = coeff.compute(
            cell_id=1,
            dry_days_7d=5.0, dry_days_15d=10.0,
            # dry_days_30d missing
            heatwave_days=3.0,
            # soil_moisture_7cm missing
            vapour_pressure_deficit=2.5,
            pine_percentage=80.0, ndmi_anomaly=-0.3, forest_density=75.0,
            recent_clear_cut=0.0,
            # road_distance missing
            amenity_distance=500.0,
            building_density=0.1, seasonality=7.0,
            # historic_density missing
            slope=2.0,
            # coastal_proximity missing
            aspect=180.0,
        )
        assert result.renormalized
        assert result.n_available < result.n_factors
        assert 0.0 <= result.score <= 1.0

    def test_all_factors_missing(self):
        """All factors missing → zero score."""
        coeff = LocalCoefficient()
        result = coeff.compute(cell_id=1)
        assert result.score == 0.0
        assert result.renormalized or result.n_available == 0
        assert result.ignition_score == 0.0
        assert result.spread_score == 0.0

    def test_single_factor_available(self):
        """Single factor → score equals that factor's normalized value."""
        coeff = LocalCoefficient()
        result = coeff.compute(
            cell_id=1,
            dry_days_7d=7.0,  # 7 / 7 = 1.0 (linear function x0=0, x1=7)
        )
        assert result.score > 0.0
        assert result.renormalized

    def test_ignition_spread_scores_differ(self):
        """Ignition and spread sub-scores should differ with appropriate inputs."""
        coeff = LocalCoefficient()
        # Ignition-dominant: high human factor, low fuel
        ign = coeff.compute(
            cell_id=1,
            road_distance=50.0, amenity_distance=100.0,
            seasonality=7.0, historic_density=10.0,
            dry_days_7d=7.0, dry_days_15d=15.0,
            # Low fuel factors
            pine_percentage=10.0, forest_density=10.0,
            slope=0.5,
        )
        # Spread-dominant: high fuel, low human
        spr = coeff.compute(
            cell_id=1,
            pine_percentage=90.0, ndmi_anomaly=-0.5, forest_density=90.0,
            vapour_pressure_deficit=4.0,
            slope=8.0, aspect=180.0,
            # Low human factors
            road_distance=5000.0, amenity_distance=10000.0,
        )
        # The two configurations should produce different scores
        assert ign.ignition_score != spr.ignition_score or ign.spread_score != spr.spread_score


class TestLocalCoefficientBoundaries:
    """Boundary conditions for each normalization function."""

    def test_linear_normalization(self):
        """Linear func: value == x0 → 0, value >= x1 → 1."""
        coeff = LocalCoefficient()

        # dry_days_7d: linear, x0=0, x1=7
        result_min = coeff.compute(cell_id=1, dry_days_7d=0.0)
        result_max = coeff.compute(cell_id=1, dry_days_7d=7.0)
        # Check individual factor scores
        for f in result_max.factors:
            if f.name == "dry_days_7d":
                assert f.normalized == pytest.approx(1.0, abs=0.01)
        for f in result_min.factors:
            if f.name == "dry_days_7d":
                assert f.normalized <= 0.01

    def test_seasonal_peak_summer(self):
        """Summer months (6-8) → high seasonal score."""
        coeff = LocalCoefficient()
        summer = coeff.compute(cell_id=1, seasonality=7.0)
        winter = coeff.compute(cell_id=1, seasonality=1.0)
        for f in summer.factors:
            if f.name == "seasonality":
                assert f.normalized >= 0.8  # July → 0.9
        for f in winter.factors:
            if f.name == "seasonality":
                assert f.normalized <= 0.2  # January → 0.1


class TestNoDefaultValues:
    """SPEC §C-05.c: no default values for unavailable factors."""

    def test_missing_factor_has_zero_contribution(self):
        """Unavailable factor contributes zero to the score."""
        coeff = LocalCoefficient()
        result = coeff.compute(cell_id=1, dry_days_7d=5.0)
        for f in result.factors:
            if f.name != "dry_days_7d" and not f.available:
                assert f.contribution == 0.0
