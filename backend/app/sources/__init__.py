"""PyroScope 33 — Data source connectors."""

from app.sources.base import BaseSource, SourceError, SourceStatus
from app.sources.firms import FirmsSource, Hotspot, get_firms_source
from app.sources.open_meteo import (
    OpenMeteoSource,
    WeatherGrid,
    WeatherPoint,
    WeatherSeries,
    get_open_meteo_source,
)
from app.sources.copernicus import (
    CopernicusSource,
    SentinelScene,
    VegetationIndices,
    compute_ndvi,
    compute_ndmi,
    compute_nbr,
    get_copernicus_source,
)
from app.sources.ign_geoplateforme import (
    IGNSource,
    ForestPlot,
    TerrainData,
    get_ign_source,
)
from app.sources.corine import (
    CorineSource,
    LandCover,
    get_corine_source,
)
from app.sources.overpass import (
    OverpassSource,
    Road,
    Amenity,
    HumanFactors,
    get_overpass_source,
)

__all__ = [
    "BaseSource",
    "SourceError",
    "SourceStatus",
    # FIRMS
    "FirmsSource",
    "Hotspot",
    "get_firms_source",
    # Open-Meteo
    "OpenMeteoSource",
    "WeatherGrid",
    "WeatherPoint",
    "WeatherSeries",
    "get_open_meteo_source",
    # Copernicus CDSE
    "CopernicusSource",
    "SentinelScene",
    "VegetationIndices",
    "compute_ndvi",
    "compute_ndmi",
    "compute_nbr",
    "get_copernicus_source",
    # IGN
    "IGNSource",
    "ForestPlot",
    "TerrainData",
    "get_ign_source",
    # CORINE
    "CorineSource",
    "LandCover",
    "get_corine_source",
    # Overpass OSM
    "OverpassSource",
    "Road",
    "Amenity",
    "HumanFactors",
    "get_overpass_source",
]
