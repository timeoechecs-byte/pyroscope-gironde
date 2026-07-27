"""
OpenStreetMap Overpass API — routes, campings, parkings, bâti.

Données quasi-statiques — cache local (rafraîchissement mensuel).
Licence ODbL (OpenStreetMap © contributeurs).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.sources.base import BaseSource

logger = logging.getLogger("pyroscope.sources.overpass")

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Fallback (if rate-limited)
OVERPASS_FALLBACK = "https://overpass.kumi.systems/api/interpreter"

# Gironde (33) INSEE code
GIRONDE_RELATION_ID = 7401  # OSM relation for département 33

# BBOX for Gironde with margin
BBOX = (-1.55, 43.97, 0.60, 45.78)


@dataclass
class Road:
    """OSM road segment near a cell."""

    osm_id: int
    name: str | None
    highway: str  # motorway, trunk, primary, secondary, tertiary, track, path
    distance_m: float  # distance from cell center to road
    geometry: str  # WKT linestring

    @property
    def weight(self) -> float:
        """Access weight for fire risk (higher = more human access)."""
        weights = {
            "motorway": 0.2,
            "trunk": 0.3,
            "primary": 0.4,
            "secondary": 0.5,
            "tertiary": 0.6,
            "unclassified": 0.7,
            "residential": 0.8,
            "track": 0.4,
            "path": 0.3,
            "footway": 0.2,
        }
        return weights.get(self.highway, 0.3)


@dataclass
class Amenity:
    """OSM point of interest (camping, parking, leisure area)."""

    osm_id: int
    name: str | None
    amenity_type: str  # "camp_site", "parking", "picnic_site", "beach", etc.
    latitude: float
    longitude: float


@dataclass
class HumanFactors:
    """Human activity factors for a cell."""

    cell_id: int
    nearest_road_distance_m: float | None
    nearest_road_type: str | None
    nearest_amenity_distance_m: float | None
    nearest_amenity_type: str | None
    building_density: float | None  # 0-1
    road_density_km_per_km2: float | None
    n_amenities_1km: int = 0


class OverpassSource(BaseSource):
    """OpenStreetMap Overpass API connector.

    Runs Overpass QL queries against the free Overpass API endpoint.
    Results are cached locally with 30-day TTL (data is quasi-static).
    """

    def __init__(self):
        super().__init__(
            name="overpass_osm",
            base_url=OVERPASS_URL,
            cache_ttl=86400 * 30,  # 30 days
            rate_per_second=1.0,  # Overpass is sensitive to rate
        )
        self._quota_limit = 10000  # OSM generous but rate-limited

    async def query(self, overpass_ql: str) -> dict[str, Any] | list[Any]:
        """Execute an Overpass QL query.

        Args:
            overpass_ql: Raw Overpass QL query string.

        Returns:
            Parsed GeoJSON-like response.
        """
        cache_key = self._cache_key("query", overpass_ql[:50])
        cached = await self._cache_get(cache_key)
        if cached:
            return cached

        data = await self._request(
            "POST",
            "",
            data={"data": overpass_ql},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        await self._cache_set(cache_key, data, self.cache_ttl)
        return data

    async def get_roads_near_point(
        self, latitude: float, longitude: float, radius_m: int = 500
    ) -> list[Road]:
        """Find road segments within `radius_m` of a point."""
        ql = f"""
        [out:json][timeout:15];
        (
          way["highway"](around:{radius_m},{latitude},{longitude});
        );
        out body geom;
        """

        try:
            data = await self.query(ql)
        except Exception as e:
            logger.warning("overpass.roads_error", error=str(e))
            return []

        roads: list[Road] = []
        if isinstance(data, dict):
            elements = data.get("elements", [])
            for el in elements:
                if el.get("type") != "way":
                    continue
                props = el.get("tags", {})
                # Calculate distance from point to road centroid
                geom = el.get("geometry", [])
                if geom:
                    cents = [g for g in geom if "lat" in g and "lon" in g]
                    if cents:
                        road_lat = sum(g["lat"] for g in cents) / len(cents)
                        road_lon = sum(g["lon"] for g in cents) / len(cents)
                        dist = ((road_lat - latitude) ** 2 + (road_lon - longitude) ** 2) ** 0.5 * 111320
                    else:
                        dist = 0.0
                else:
                    dist = 0.0

                roads.append(Road(
                    osm_id=el.get("id", 0),
                    name=props.get("name"),
                    highway=props.get("highway", "unclassified"),
                    distance_m=round(dist, 1),
                    geometry="",
                ))

        return sorted(roads, key=lambda r: r.distance_m)

    async def get_amenities_near_point(
        self, latitude: float, longitude: float, radius_m: int = 2000
    ) -> list[Amenity]:
        """Find amenities (campings, parkings, etc.) near a point."""
        ql = f"""
        [out:json][timeout:15];
        (
          node["tourism"="camp_site"](around:{radius_m},{latitude},{longitude});
          node["amenity"="parking"](around:{radius_m},{latitude},{longitude});
          node["tourism"="picnic_site"](around:{radius_m},{latitude},{longitude});
          node["leisure"="beach_resort"](around:{radius_m},{latitude},{longitude});
          node["amenity"="bench"](around:{radius_m},{latitude},{longitude});
        );
        out body;
        """

        try:
            data = await self.query(ql)
        except Exception as e:
            logger.warning("overpass.amenities_error", error=str(e))
            return []

        amenities: list[Amenity] = []
        if isinstance(data, dict):
            elements = data.get("elements", [])
            for el in elements:
                if el.get("type") != "node":
                    continue
                tags = el.get("tags", {})
                amenities.append(Amenity(
                    osm_id=el.get("id", 0),
                    name=tags.get("name") or tags.get("tourism") or tags.get("amenity"),
                    amenity_type=(
                        tags.get("tourism") or tags.get("amenity") or tags.get("leisure", "unknown")
                    ),
                    latitude=el.get("lat", latitude),
                    longitude=el.get("lon", longitude),
                ))

        return amenities

    async def get_human_factors(self, latitude: float, longitude: float) -> HumanFactors:
        """Compute human factors for a single cell."""
        # Nearest road
        roads = await self.get_roads_near_point(latitude, longitude)
        nearest_road = roads[0] if roads else None

        # Nearest amenity
        amenities = await self.get_amenities_near_point(latitude, longitude)
        nearest_amenity = amenities[0] if amenities else None

        n_amenities_1km = sum(
            1 for a in amenities
            if ((a.latitude - latitude) ** 2 + (a.longitude - longitude) ** 2) ** 0.5 * 111320 < 1000
        )

        return HumanFactors(
            cell_id=0,
            nearest_road_distance_m=nearest_road.distance_m if nearest_road else None,
            nearest_road_type=nearest_road.highway if nearest_road else None,
            nearest_amenity_distance_m=None if nearest_amenity is None else (
                ((nearest_amenity.latitude - latitude) ** 2 +
                 (nearest_amenity.longitude - longitude) ** 2) ** 0.5 * 111320
            ),
            nearest_amenity_type=nearest_amenity.amenity_type if nearest_amenity else None,
            building_density=None,
            road_density_km_per_km2=None,
            n_amenities_1km=n_amenities_1km,
        )

    async def fetch(self, **kwargs) -> Any:
        return await self.get_human_factors(
            kwargs.get("latitude", 44.9),
            kwargs.get("longitude", -0.5),
        )


_overpass_instance: OverpassSource | None = None


def get_overpass_source() -> OverpassSource:
    global _overpass_instance
    if _overpass_instance is None:
        _overpass_instance = OverpassSource()
    return _overpass_instance
