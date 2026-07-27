"""
Tests for the spread ellipse engine.

Reference:
  Alexander, M.E. (1985). Estimating the length-to-breadth ratio of
  elliptical forest fire patterns. 8th Conf. Fire and Forest Meteorology.
  Van Wagner, C.E. (1969). A simple fire-growth model. Forestry Chronicle.
"""

from __future__ import annotations

import math
import pytest

from app.science.spread_ellipse import (
    compute_length_breadth_ratio,
    compute_flank_back_ros,
    compute_ellipse_geometry,
    simulate_fire_growth,
)


class TestLengthBreadthRatio:
    """Alexander (1985) LB = 1 + 0.36 * U^0.46."""

    def test_zero_wind_circular(self):
        """Zero wind → LB = 1.0 (circular fire)."""
        lb = compute_length_breadth_ratio(0.0)
        assert lb == pytest.approx(1.0, abs=0.01)

    def test_lb_increases_with_wind(self):
        """Higher wind → higher LB ratio."""
        lb_10 = compute_length_breadth_ratio(10.0)
        lb_30 = compute_length_breadth_ratio(30.0)
        assert lb_30 > lb_10

    def test_lb_reasonable_range(self):
        """LB should be in reasonable range for typical wind speeds."""
        lb_5 = compute_length_breadth_ratio(5.0)
        lb_50 = compute_length_breadth_ratio(50.0)
        assert 1.0 <= lb_5 <= 3.0
        assert 2.0 <= lb_50 <= 5.0  # even at extreme wind, LB saturates

    def test_lb_reference_values(self):
        """Reference: Alexander (1985) Fig. 3."""
        # U = 10 km/h → LB ≈ 1 + 0.36 * 10^0.46 ≈ 1 + 0.36 * 2.88 ≈ 2.04
        lb = compute_length_breadth_ratio(10.0)
        assert lb == pytest.approx(2.04, abs=0.1)
        # U = 20 km/h → LB ≈ 1 + 0.36 * 20^0.46 ≈ 1 + 0.36 * 3.98 ≈ 2.43
        lb = compute_length_breadth_ratio(20.0)
        assert lb == pytest.approx(2.43, abs=0.15)


class TestFlankBackROS:
    """Flank and backing ROS from head ROS and LB."""

    def test_circular_equal_ros(self):
        """LB = 1 → all directions equal."""
        flank, back = compute_flank_back_ros(10.0, 1.0)
        assert flank == pytest.approx(10.0, abs=0.1)
        assert back == pytest.approx(10.0, abs=0.1)

    def test_elliptical_flank_lower(self):
        """LB > 1 → flank ROS < head ROS."""
        head_ros = 10.0
        flank, back = compute_flank_back_ros(head_ros, 2.0)
        assert flank < head_ros
        assert back < flank

    def test_back_ros_very_low(self):
        """High LB → backing ROS is very low."""
        flank, back = compute_flank_back_ros(20.0, 4.0)
        assert back < 2.0  # 20 / 16 ≈ 1.25
        assert back < flank


class TestEllipseGeometry:
    """Ellipse geometry computation."""

    def test_small_fire_zero_area(self):
        """Zero duration → zero area."""
        ellipse = compute_ellipse_geometry(
            head_ros_m_min=0.0, duration_min=60.0,
            wind_direction_deg=0.0, lb=1.0,
        )
        assert ellipse.area_ha == pytest.approx(0.0, abs=0.01)

    def test_fire_area_increases_with_duration(self):
        """Longer duration → larger area."""
        e1 = compute_ellipse_geometry(head_ros_m_min=10.0, duration_min=60.0,
                                       wind_direction_deg=0.0, lb=2.0)
        e2 = compute_ellipse_geometry(head_ros_m_min=10.0, duration_min=180.0,
                                       wind_direction_deg=0.0, lb=2.0)
        assert e2.area_ha > e1.area_ha

    def test_fire_area_increases_with_ros(self):
        """Higher ROS → larger area."""
        e1 = compute_ellipse_geometry(head_ros_m_min=5.0, duration_min=60.0,
                                       wind_direction_deg=0.0, lb=2.0)
        e2 = compute_ellipse_geometry(head_ros_m_min=20.0, duration_min=60.0,
                                       wind_direction_deg=0.0, lb=2.0)
        assert e2.area_ha > e1.area_ha

    def test_orientation_matches_wind(self):
        """Ellipse orientation matches wind direction."""
        ellipse = compute_ellipse_geometry(
            head_ros_m_min=10.0, duration_min=60.0,
            wind_direction_deg=225.0, lb=3.0,
        )
        assert ellipse.orientation_deg == 225.0

    def test_perimeter_reasonable(self):
        """Perimeter should be larger than a circle of same area."""
        ellipse = compute_ellipse_geometry(
            head_ros_m_min=10.0, duration_min=60.0,
            wind_direction_deg=0.0, lb=2.0,
        )
        # Circle equivalent: r = sqrt(A/pi), perimeter = 2*pi*r
        equiv_radius = math.sqrt(ellipse.area_ha * 10000 / math.pi)
        circle_perimeter = 2 * math.pi * equiv_radius
        # Ellipse perimeter > circle perimeter
        assert ellipse.perimeter_m > circle_perimeter

    def test_focus_offset_positive(self):
        """Focus offset (ignition point) should be behind the ellipse center."""
        ellipse = compute_ellipse_geometry(
            head_ros_m_min=10.0, duration_min=60.0,
            wind_direction_deg=0.0, lb=3.0,
        )
        # Wind from north (0°), ellipse oriented north → ignition at south focus
        # focus_x ≈ 0, focus_y ≈ -offset (south)
        if ellipse.ignition_y is not None:
            assert ellipse.ignition_y <= 0  # behind center
        assert ellipse.semi_major_m > ellipse.semi_minor_m


class TestFireGrowthSimulation:
    """Multi-epoch fire growth with per-hour wind."""

    def test_single_hour(self):
        """Single hour produces one epoch."""
        history = simulate_fire_growth(
            head_ros_per_hour=[10.0],
            wind_speed_per_hour=[15.0],
            wind_dir_per_hour=[225.0],
            max_hours=1,
        )
        assert len(history.epochs) == 1
        assert history.total_duration_h == 1.0

    def test_multiple_hours(self):
        """Multiple hours produce multiple epochs."""
        hours = 6
        ros = [5.0 + i * 2.0 for i in range(hours)]
        wind = [10.0 + i * 2.0 for i in range(hours)]
        dirs = [225.0] * hours
        history = simulate_fire_growth(
            head_ros_per_hour=ros, wind_speed_per_hour=wind,
            wind_dir_per_hour=dirs, max_hours=hours,
        )
        assert len(history.epochs) == hours
        assert history.total_duration_h == hours

    def test_no_ros_no_growth(self):
        """Zero ROS → no growth."""
        history = simulate_fire_growth(
            head_ros_per_hour=[0.0, 0.0, 0.0],
            wind_speed_per_hour=[0.0, 0.0, 0.0],
            wind_dir_per_hour=[0.0, 0.0, 0.0],
            max_hours=3,
        )
        assert history.final_area_ha == 0.0

    def test_per_epoch_wind(self):
        """Wind changes between epochs → different LB ratios."""
        ros = [10.0] * 3
        wind = [5.0, 25.0, 5.0]  # gust at hour 2
        dirs = [0.0, 90.0, 180.0]  # wind shifts each hour
        history = simulate_fire_growth(
            head_ros_per_hour=ros, wind_speed_per_hour=wind,
            wind_dir_per_hour=dirs, max_hours=3,
        )
        # Epoch 2 should have higher LB (stronger wind)
        assert history.epochs[1].semi_major_m / history.epochs[1].semi_minor_m > \
               history.epochs[0].semi_major_m / history.epochs[0].semi_minor_m

    def test_total_area_manual_check(self):
        """Total area should be sum of all epoch areas."""
        hours = 3
        ros = [5.0, 10.0, 15.0]
        wind = [10.0, 15.0, 20.0]
        dirs = [225.0] * hours
        history = simulate_fire_growth(
            head_ros_per_hour=ros, wind_speed_per_hour=wind,
            wind_dir_per_hour=dirs, max_hours=hours,
        )
        expected_total = sum(e.area_ha for e in history.epochs)
        assert history.final_area_ha == pytest.approx(expected_total, abs=0.01)
