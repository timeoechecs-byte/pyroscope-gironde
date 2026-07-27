"""
CORINE Land Cover — Copernicus Land Monitoring Service.

Accès WMS : https://land.copernicus.eu/.../
Couche : CORINE Land Cover 2018 (100m resolution)
Classes disponibles pour la Gironde :
  - 311 = Forêt de conifères
  - 312 = Forêt de feuillus
  - 313 = Forêt mélangée
  - 321 = Pelouses et pâturages naturels
  - 324 = Forêt et végétation arbustive en mutation
  - 211 = Terres arables hors périmètre d'irrigation
  - 112 = Tissu urbain discontinu
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.sources.base import BaseSource

logger = logging.getLogger("pyroscope.sources.corine")

# CORINE Land Cover raster WMS
CLC_WMS = "https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WmsServer"


@dataclass
class LandCover:
    """CORINE Land Cover classification for a cell."""

    cell_id: int
    latitude: float
    longitude: float
    clc_code: int  # 3-digit CORINE code
    clc_label: str  # Human-readable label
    fuel_class: str  # Simplified for fire modeling

    @property
    def is_forest(self) -> bool:
        return self.clc_code in (311, 312, 313, 324)

    @property
    def is_fuel(self) -> bool:
        """Can this cell support wildfire propagation?"""
        return self.clc_code in (311, 312, 313, 321, 322, 323, 324, 333)


# CORINE → simplified fuel classification
CORINE_FUEL: dict[int, tuple[str, str]] = {
    # Artificial surfaces
    111: ("urbain_continu", "non_combustible"),
    112: ("urbain_discontinu", "low"),
    121: ("industriel", "non_combustible"),
    131: ("carriere", "non_combustible"),
    141: ("espace_vert_urbain", "low"),
    # Agricultural
    211: ("terres_arables", "low"),
    221: ("vignobles", "low"),
    222: ("vergers", "medium"),
    231: ("prairies", "low"),
    242: ("cultures_annuelles", "low"),
    243: ("agricole_heterogene", "medium"),
    # Forest and semi-natural
    311: ("foret_feuillus", "high"),
    312: ("foret_coniferes", "very_high"),
    313: ("foret_mixte", "high"),
    321: ("pelouses", "medium"),
    322: ("landes", "high"),
    323: ("maquis", "high"),
    324: ("foret_mutation", "high"),
    331: ("plages", "non_combustible"),
    332: ("roches_nues", "non_combustible"),
    333: ("vegetation_rare", "low"),
    334: ("zones_incendiees", "high"),
    # Wetlands
    411: ("marais_interieurs", "low"),
    412: ("tourbieres", "medium"),
    # Water
    511: ("cours_eau", "non_combustible"),
    512: ("plans_eau", "non_combustible"),
}


def get_fuel_class(clc_code: int) -> tuple[str, str]:
    """Return (fuel_label, combustibility) for a CLC code."""
    return CORINE_FUEL.get(clc_code, ("inconnu", "unknown"))


class CorineSource(BaseSource):
    """CORINE Land Cover 2018 connector."""

    def __init__(self):
        super().__init__(
            name="corine_land_cover",
            base_url=CLC_WMS,
            cache_ttl=86400 * 365,  # 1 year — CLC is updated every 6 years
            rate_per_second=2.0,
        )

    async def get_land_cover(
        self, latitude: float, longitude: float
    ) -> LandCover:
        """
        Get CORINE Land Cover class at a point.

        PHASE 3 stub — returns the dominant CLC class for the Gironde
        region based on known geography.
        """
        # In production: WMS GetFeatureInfo request
        # For now: approximate from geographic position

        clc_code = self._approximate_clc(latitude, longitude)
        label, fuel = get_fuel_class(clc_code)

        return LandCover(
            cell_id=0,
            latitude=latitude,
            longitude=longitude,
            clc_code=clc_code,
            clc_label=label,
            fuel_class=fuel,
        )

    def _approximate_clc(self, lat: float, lon: float) -> int:
        """
        Approximate CORINE class for a point in Gironde.

        Based on known geography:
        - Bordeaux area: urban (112)
        - Médoc: forest + viticulture (312/221)
        - Landes: forest conifer (312)
        - Estuary / coastal: wetlands (411)
        - Entre-deux-Mers: agriculture mixte (242)
        """
        # Bordeaux urban
        if (-0.7 < lon < -0.3) and (44.7 < lat < 44.95):
            return 112
        # Garonne estuary / coastal wetlands
        elif lon < -1.0:
            return 411
        # Médoc (vineyards + forest)
        elif lon < -0.8 and lat > 45.0:
            return 221
        # Landes forest (conifer plantation)
        elif lon > -0.9 and lon < 0.0 and lat > 44.2 and lat < 45.2:
            return 312
        # Entre-deux-Mers (agriculture)
        elif lon > -0.2 and lat < 44.7:
            return 242
        # Eastern Gironde (mixed agriculture/forest)
        else:
            return 313

    async def fetch(self, **kwargs) -> Any:
        return await self.get_land_cover(
            kwargs.get("latitude", 44.9),
            kwargs.get("longitude", -0.5),
        )


_corine_instance: CorineSource | None = None


def get_corine_source() -> CorineSource:
    global _corine_instance
    if _corine_instance is None:
        _corine_instance = CorineSource()
    return _corine_instance
