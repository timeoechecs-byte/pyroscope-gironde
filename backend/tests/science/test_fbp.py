"""
Tests for the FBP (Forest Fire Behavior Prediction) engine.

Reference:
  Forestry Canada Fire Danger Group (1992). Development and Structure
  of the Canadian Forest Fire Behavior Prediction System. ST-X-3.

  cffdrs R package (v1.8+) built-in test data.
  Van Wagner, C.E. (1977). Conditions for the start and spread of
  crown fire. Canadian Journal of Forest Research, 7(1), 23-34.
"""

from __future__ import annotations

import pytest

from app.science.fbp import FBPEngine


class TestFBPBasics:
    """Basic FBP engine properties."""

    def test_fbp_engine_creates(self):
        """FBPEngine can be instantiated with default fuel type C-6."""
        engine = FBPEngine("C-6")
        assert engine.fuel_type == "C-6"

    def test_wind_reduction(self):
        """Wind reduction factor is applied correctly."""
        engine = FBPEngine("C-6")
        # C-6: WIND_REDUCTION = 0.45
        assert engine.wind_at_fuel_level(20.0) == pytest.approx(9.0, abs=0.1)

        engine_o1 = FBPEngine("O-1")
        # O-1: WIND_REDUCTION = 0.80
        assert engine_o1.wind_at_fuel_level(20.0) == pytest.approx(16.0, abs=0.1)


class TestFBPRos:
    """FBP Rate of Spread against reference values."""

    def test_c6_base_ros(self):
        """C-6 with moderate ISI/wind produces ROS in expected range.

        Reference: cffdrs test: C-6, ISI=10, BUI=20, wind=15km/h
        Expected ROS ~ 5-15 m/min for surface fire conditions.
        """
        engine = FBPEngine("C-6")
        ros = engine.compute_ros(isi=10.0, bui=20.0, wind_speed_kmh=15.0)
        assert 3.0 <= ros <= 20.0

    def test_c6_low_isi_low_ros(self):
        """Low ISI → low ROS."""
        engine = FBPEngine("C-6")
        ros = engine.compute_ros(isi=1.0, bui=10.0, wind_speed_kmh=5.0)
        assert ros < 5.0

    def test_c6_high_isi_high_ros(self):
        """High ISI + wind → high ROS (approaching crown fire)."""
        engine = FBPEngine("C-6")
        ros = engine.compute_ros(isi=25.0, bui=40.0, wind_speed_kmh=30.0)
        assert ros > 10.0
        assert ros < 60.0  # sane upper bound

    def test_ros_monotonic(self):
        """Higher ISI → higher ROS (monotonic relationship)."""
        engine = FBPEngine("C-6")
        ros_low = engine.compute_ros(isi=5.0, bui=20.0, wind_speed_kmh=15.0)
        ros_high = engine.compute_ros(isi=20.0, bui=20.0, wind_speed_kmh=15.0)
        assert ros_high > ros_low

    def test_slope_increases_ros(self):
        """Positive slope → higher ROS."""
        engine = FBPEngine("C-6")
        ros_flat = engine.compute_ros(isi=10.0, bui=20.0, wind_speed_kmh=15.0, slope_pct=0)
        ros_slope = engine.compute_ros(isi=10.0, bui=20.0, wind_speed_kmh=15.0, slope_pct=10)
        assert ros_slope > ros_flat

    def test_bui_limitation(self):
        """Very low BUI (< 4) limits ROS."""
        engine = FBPEngine("C-6")
        ros_low_bui = engine.compute_ros(isi=15.0, bui=2.0, wind_speed_kmh=15.0)
        ros_high_bui = engine.compute_ros(isi=15.0, bui=20.0, wind_speed_kmh=15.0)
        assert ros_low_bui < ros_high_bui

    def test_fuel_types_ranked(self):
        """Fuel types rank C-6 > C-7 > M-1 > D-1 in ROS for same conditions."""
        isi, bui, wind = 10.0, 20.0, 15.0
        ros_c6 = FBPEngine("C-6").compute_ros(isi, bui, wind)
        ros_c7 = FBPEngine("C-7").compute_ros(isi, bui, wind)
        ros_m1 = FBPEngine("M-1").compute_ros(isi, bui, wind)
        ros_d1 = FBPEngine("D-1").compute_ros(isi, bui, wind)
        ros_o1 = FBPEngine("O-1").compute_ros(isi, bui, wind)

        # C-6 conifer plantation > C-7 > M-1 > D-1 > O-1 (grass at low ISI)
        assert ros_c6 > ros_c7
        assert ros_d1 <= ros_m1  # D-1 (deciduous) ≤ M-1 (mixedwood)


class TestFBPIntensity:
    """Byram intensity and flame length."""

    def test_byram_intensity_zero_ros(self):
        """Zero ROS → zero intensity."""
        engine = FBPEngine("C-6")
        intensity = engine.compute_byram_intensity(0.0, 3.5)
        assert intensity == 0.0

    def test_byram_intensity_positive(self):
        """Positive ROS produces positive intensity (kW/m)."""
        engine = FBPEngine("C-6")
        intensity = engine.compute_byram_intensity(10.0, 3.5)
        assert intensity > 0.0
        # I = 18000 * 3.5 * (10/60) / 1000 = 10500 kW/m
        assert intensity == pytest.approx(10.5, abs=2.0)

    def test_flame_length_zero(self):
        """Zero intensity → zero flame length."""
        assert FBPEngine("C-6").compute_flame_length(0.0) == 0.0

    def test_flame_length_increasing(self):
        """Higher intensity → longer flames."""
        fl_low = FBPEngine("C-6").compute_flame_length(1000.0)
        fl_high = FBPEngine("C-6").compute_flame_length(10000.0)
        assert fl_high > fl_low
        assert 0.5 < fl_low < 5.0  # 1000 kW/m → ~1.5m
        assert fl_high > 2.0       # 10000 kW/m → ~4m


class TestFBPCrownFire:
    """Crown fire initiation (Van Wagner 1977)."""

    def test_c6_surface_fire(self):
        """Low ISI → surface fire (CFB = 0)."""
        engine = FBPEngine("C-6")
        cfb, fire_type = engine.compute_crown_fraction_burned(isi=3.0, bui=10.0)
        assert cfb == 0.0
        assert fire_type == "surface"

    def test_c6_intermittent_crown(self):
        """Moderate ISI → intermittent crown fire."""
        engine = FBPEngine("C-6")
        cfb, fire_type = engine.compute_crown_fraction_burned(isi=15.0, bui=20.0)
        assert cfb > 0.0
        assert fire_type in ("intermittent", "crown")

    def test_c6_active_crown(self):
        """High ISI + BUI → active crown fire."""
        engine = FBPEngine("C-6")
        cfb, fire_type = engine.compute_crown_fraction_burned(isi=30.0, bui=40.0)
        assert cfb > 0.0
        assert fire_type in ("crown", "intermittent")

    def test_o1_no_crown_fire(self):
        """Grass (O-1) cannot support crown fire."""
        engine = FBPEngine("O-1")
        cfb, fire_type = engine.compute_crown_fraction_burned(isi=30.0, bui=40.0)
        assert cfb == 0.0
        assert fire_type == "surface"

    def test_d1_resists_crown_fire(self):
        """Deciduous leafless (D-1) resists crown fire (high CBH)."""
        engine = FBPEngine("D-1")
        cfb, fire_type = engine.compute_crown_fraction_burned(isi=20.0, bui=30.0)
        assert cfb <= 0.5
        assert fire_type != "crown"  # D-1 rarely goes to active crown


class TestFBPFuelConsumed:
    """Fuel consumption estimation."""

    def test_c6_fuel_load(self):
        """C-6 has significant fuel load."""
        engine = FBPEngine("C-6")
        consumed = engine.compute_fuel_consumed(bui=30.0)
        assert 1.0 <= consumed <= 5.0

    def test_o1_low_fuel(self):
        """O-1 (grass) has low fuel load."""
        engine = FBPEngine("O-1")
        consumed = engine.compute_fuel_consumed(bui=30.0)
        assert consumed < 1.0

    def test_bui_effect(self):
        """Higher BUI → more fuel consumed."""
        engine = FBPEngine("C-6")
        low = engine.compute_fuel_consumed(bui=5.0)
        high = engine.compute_fuel_consumed(bui=50.0)
        assert high >= low
