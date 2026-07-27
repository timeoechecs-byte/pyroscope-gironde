"""
Copernicus Data Space Ecosystem — Sentinel-2 L2A connector.

Compte gratuit requis : https://dataspace.copernicus.eu
API : OData + STAC, avec OAuth2 client credentials.

Accès :
- Sentinel-2 L2A (BOA reflectance) → NDVI, NDMI, NBR
- Masque nuages (SCL / MSK_CLOUD)
- Sentinel-3 SLSTR (température de surface) — optionnel
- Sentinel-1 GRD (radar, traverse les nuages) — optionnel
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from app.sources.base import BaseSource, SourceError, SourceStatus

logger = logging.getLogger("pyroscope.sources.copernicus")

# ── OAuth2 endpoints ───────────────────────────────────────────────────
AUTH_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
API_BASE = "https://catalogue.dataspace.copernicus.eu"

# BBOX of interest (BBOX_CALCUL widened for ingestion margin)
BBOX = (-1.55, 43.97, 0.60, 45.78)


@dataclass
class SentinelScene:
    """Single Sentinel-2 L2A acquisition tile."""

    scene_id: str
    acquisition_date: datetime
    cloud_cover: float  # percentage
    tile_id: str  # e.g. "30TXT"
    processing_level: str  # "S2MSI2A"
    s3_path: str  # S3 URL for direct download (optional)
    download_url: str  # OData download URL

    @property
    def usable(self) -> bool:
        """Scene usable if cloud cover < threshold."""
        return self.cloud_cover < 80.0


@dataclass
class VegetationIndices:
    """NDVI, NDMI, NBR values for a single grid cell."""

    cell_id: int
    latitude: float
    longitude: float
    ndvi: float | None = None
    ndmi: float | None = None
    nbr: float | None = None
    cloud_cover: float | None = None
    scene_date: str | None = None
    valid: bool = True
    error: str | None = None


# ── Band definitions for Sentinel-2 L2A ──────────────────────────────
# Resolution 10m/20m, BOA reflectance (scaled by 10000)

# NDVI = (NIR - Red) / (NIR + Red)
# B8 (NIR, 842nm) — 10m
# B4 (Red, 665nm) — 10m

# NDMI = (NIR - SWIR1) / (NIR + SWIR1)
# B8 (NIR, 842nm) — 10m
# B11 (SWIR1, 1610nm) — 20m

# NBR = (NIR - SWIR2) / (NIR + SWIR2)
# B8 (NIR, 842nm) — 10m
# B12 (SWIR2, 2190nm) — 20m

# Band names in Sentinel-2 L2A products
BAND_MAP = {
    "B4": "Red",
    "B8": "NIR",  # narrow NIR
    "B11": "SWIR1",
    "B12": "SWIR2",
}


def compute_ndvi(nir: float, red: float) -> float:
    """Normalized Difference Vegetation Index."""
    if nir + red == 0:
        return 0.0
    return round((nir - red) / (nir + red), 4)


def compute_ndmi(nir: float, swir1: float) -> float:
    """Normalized Difference Moisture Index."""
    if nir + swir1 == 0:
        return 0.0
    return round((nir - swir1) / (nir + swir1), 4)


def compute_nbr(nir: float, swir2: float) -> float:
    """Normalized Burn Ratio."""
    if nir + swir2 == 0:
        return 0.0
    return round((nir - swir2) / (nir + swir2), 4)


class CopernicusSource(BaseSource):
    """Copernicus Data Space Ecosystem connector.

    Uses OAuth2 client credentials to obtain a bearer token.
    The token is cached and automatically refreshed.
    """

    def __init__(self, client_id: str, client_secret: str):
        super().__init__(
            name="copernicus_cdse",
            base_url=API_BASE,
            cache_ttl=86400,  # 24h — scenes don't change rapidly
            rate_per_second=4.0,
        )
        self.client_id = client_id
        self.client_secret = client_secret
        self._token: str | None = None
        self._token_expiry: datetime = datetime.min
        self._quota_limit = 5000  # CDSE: 5000 req/day typical

    async def _ensure_token(self) -> str:
        """Obtain or refresh OAuth2 bearer token."""
        if self._token and datetime.now(timezone.utc) < self._token_expiry:
            return self._token

        logger.info("copernicus.token_refresh")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                AUTH_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            self._token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=expires_in - 60
            )
            return self._token

    async def search_scenes(
        self,
        bbox: tuple[float, float, float, float] = BBOX,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        max_cloud: float = 80.0,
        max_results: int = 50,
    ) -> list[SentinelScene]:
        """
        Search for Sentinel-2 L2A scenes in the bounding box.

        Uses the Copernicus STAC API.
        """
        token = await self._ensure_token()
        lon_min, lat_min, lon_max, lat_max = bbox

        # STAC query parameters
        params: dict[str, Any] = {
            "collections[]": ["SENTINEL-2"],
            "bbox": f"{lon_min},{lat_min},{lon_max},{lat_max}",
            "limit": max_results,
            "filter": f"eo:cloud_cover < {max_cloud}",
        }
        if start_date:
            params["datetime"] = start_date.isoformat() + "/" + (
                end_date or datetime.now(timezone.utc)
            ).isoformat()

        headers = {"Authorization": f"Bearer {token}"}

        try:
            data = await self._request(
                "GET",
                "/stac/search",
                params=params,
                headers=headers,
            )
        except Exception as e:
            logger.error("copernicus.search_error", error=str(e))
            return []

        scenes: list[SentinelScene] = []
        if isinstance(data, dict):
            features = data.get("features", [])
            for feat in features:
                props = feat.get("properties", {})
                scene = SentinelScene(
                    scene_id=feat.get("id", ""),
                    acquisition_date=datetime.fromisoformat(
                        props.get("datetime", "").replace("Z", "+00:00")
                    ),
                    cloud_cover=props.get("eo:cloud_cover", 100.0),
                    tile_id=props.get("s2:tile_id", ""),
                    processing_level=props.get("s2:processing_level", ""),
                    s3_path=props.get("s3_path", ""),
                    download_url=feat.get("assets", {})
                    .get("download_url", {})
                    .get("href", ""),
                )
                if scene.processing_level == "S2MSI2A" and scene.usable:
                    scenes.append(scene)

        return scenes

    async def fetch_vegetation_indices(
        self,
        cell_lat: float,
        cell_lon: float,
        max_cloud: float = 50.0,
        days_lookback: int = 30,
    ) -> VegetationIndices:
        """
        Compute NDVI/NDMI/NBR for a single cell.

        PHASE 3 stub — returns None for indices (actual band math requires
        downloading and processing GeoTIFF rasters from CDSE, which is
        implemented in the full CDSE pipeline).

        Returns the scene availability status and cloud cover.
        """
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days_lookback)

        scenes = await self.search_scenes(
            bbox=(cell_lon - 0.01, cell_lat - 0.01, cell_lon + 0.01, cell_lat + 0.01),
            start_date=start,
            end_date=end,
            max_cloud=max_cloud,
            max_results=5,
        )

        if not scenes:
            return VegetationIndices(
                cell_id=0,
                latitude=cell_lat,
                longitude=cell_lon,
                error="No usable Sentinel-2 scenes found in period",
                valid=False,
            )

        # Use the least cloudy scene
        best_scene = min(scenes, key=lambda s: s.cloud_cover)

        return VegetationIndices(
            cell_id=0,
            latitude=cell_lat,
            longitude=cell_lon,
            scene_date=best_scene.acquisition_date.isoformat(),
            cloud_cover=best_scene.cloud_cover,
            # Actual NDVI/NDMI/NBR require raster download and band math
            # PHASE 3+ full implementation (GeoTIFF → xarray → compute)
            ndvi=None,
            ndmi=None,
            nbr=None,
            valid=True,
        )

    async def fetch(self, **kwargs) -> Any:
        """Generic fetch — search scenes for the given parameters."""
        return await self.search_scenes(
            bbox=kwargs.get("bbox", BBOX),
            start_date=kwargs.get("start_date"),
            end_date=kwargs.get("end_date"),
            max_cloud=kwargs.get("max_cloud", 80.0),
            max_results=kwargs.get("max_results", 10),
        )


# ── Module-level factory ────────────────────────────────────────────────
_copernicus_instance: CopernicusSource | None = None


def get_copernicus_source(
    client_id: str | None = None, client_secret: str | None = None
) -> CopernicusSource:
    global _copernicus_instance
    if _copernicus_instance is None:
        if not client_id or not client_secret:
            raise ValueError("CDSE_CLIENT_ID and CDSE_CLIENT_SECRET are required")
        _copernicus_instance = CopernicusSource(client_id, client_secret)
    return _copernicus_instance
