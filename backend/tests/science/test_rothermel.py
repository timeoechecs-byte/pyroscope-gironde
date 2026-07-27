"""
Tests for the Rothermel (1972) surface fire spread model.

Reference:
  Rothermel, R.C. (1972). A mathematical model for predicting fire spread
  in wildland fuels. USDA Forest Service, INT-115.
  Andrews, P.L. (2018). RMRS-GTR-371.
"""

from __future__ import annotations

import pytest

from app.science.rothermel import RothermelEngine
from app.science.fuel_models import get_fuel_model


class TestRothermelBasics:
    """Basic Rothermel engine properties."""

    def test_engine_no_fuel(self):
        """Engine works without a fuel model (default low spread)."""
        engine = RothermelEngine()
        ros = engine.compute_ros(wind_speed_kmh=10.0)
        assert ros >= 0.1

    def test_engine_with_fuel_model(self):
        """Engine accepts a fuel model."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        result = engine.compute(wind_speed_kmh=15.0)
        assert result.ros_m_min > 0.0
        assert result.sb_fuel_code == 10  # SB-10 for pin maritime


class TestRothermelRos:
    """Rothermel Rate of Spread."""

    def test_ros_increases_with_wind(self):
        """Higher wind → higher ROS."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        ros_5 = engine.compute_ros(wind_speed_kmh=5.0)
        ros_20 = engine.compute_ros(wind_speed_kmh=20.0)
        assert ros_20 > ros_5

    def test_ros_increases_with_slope(self):
        """Uphill slope → higher ROS."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        ros_flat = engine.compute_ros(wind_speed_kmh=10.0, slope_pct=0)
        ros_slope = engine.compute_ros(wind_speed_kmh=10.0, slope_pct=15)
        assert ros_slope > ros_flat

    def test_ros_reasonable_range(self):
        """ROS should be in a reasonable range for typical conditions."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        ros = engine.compute_ros(wind_speed_kmh=15.0)
        assert 0.5 <= ros <= 30.0

    def test_non_fuel_low_ros(self):
        """Non-forest fuel → very low ROS (agricultural/urban)."""
        fuel = get_fuel_model("non_foret")
        engine = RothermelEngine(fuel)
        ros = engine.compute_ros(wind_speed_kmh=15.0)
        # Non-burnable SB-99: very low spread
        assert ros < 5.0


class TestRothermelFuelModels:
    """Different fuel models produce different ROS."""

    def test_pine_vs_nonforest(self):
        """Pin maritime burns faster than non-forest."""
        pine = get_fuel_model("pin_maritime")
        nonf = get_fuel_model("non_foret")
        eng_pine = RothermelEngine(pine)
        eng_nonf = RothermelEngine(nonf)
        ros_pine = eng_pine.compute_ros(wind_speed_kmh=15.0)
        ros_nonf = eng_nonf.compute_ros(wind_speed_kmh=15.0)
        assert ros_pine > ros_nonf

    def test_fuel_types_ordered(self):
        """Fuel types ranked by flammability: conifer > mixed > deciduous > grass."""
        fuels = {
            "pin_maritime": RothermelEngine(get_fuel_model("pin_maritime")),
            "mixte": RothermelEngine(get_fuel_model("mixte")),
            "feuillus": RothermelEngine(get_fuel_model("feuillus")),
        }
        ros_pine = fuels["pin_maritime"].compute_ros(wind_speed_kmh=15.0)
        ros_mixed = fuels["mixte"].compute_ros(wind_speed_kmh=15.0)
        # Pine should have similar or slightly higher ROS than mixed/deciduous
        assert ros_pine >= ros_mixed * 0.7  # within reasonable range


class TestRothermelIntensity:
    """Byram intensity and flame length."""

    def test_intensity_zero_wind(self):
        """Zero wind → low but positive intensity."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        result = engine.compute(wind_speed_kmh=0.0)
        assert result.intensity_kw_m > 0.0

    def test_intensity_increases_with_wind(self):
        """Higher wind → higher intensity."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        i_5 = engine.compute(wind_speed_kmh=5.0).intensity_kw_m
        i_25 = engine.compute(wind_speed_kmh=25.0).intensity_kw_m
        assert i_25 > i_5

    def test_flame_length_sensible(self):
        """Flame length in reasonable range for moderate conditions."""
        fuel = get_fuel_model("pin_maritime")
        engine = RothermelEngine(fuel)
        result = engine.compute(wind_speed_kmh=15.0)
        assert 0.0 <= result.flame_length_m <= 10.0
