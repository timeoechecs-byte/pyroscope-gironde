"""
NASA FIRMS — Fire Information for Resource Management System.

Products: VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT.
Free API key via firms.modaps.eosdis.nasa.gov.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.sources.base import BaseSource, SourceStatus

# ── Data models ─────────────────────────────────────────────────────────


@dataclass
class Hotspot:
    """Single fire detection point from FIRMS."""

    latitude: float
    longitude: float
    acq_date: str  # YYYY-MM-DD
    acq_time: int  # HHMM
    satellite: str
    confidence: str  # low / nominal / high
    frp: float  # Fire Radiative Power (MW)
    daynight: str  # D / N
    bright_ti4: float | None = None  # K, VIIRS channel I-4
    bright_ti5: float | None = None  # K, VIIRS channel I-5

    @property
    def acquired_at(self) -> datetime:
        """Parse acq_date + acq_time into a datetime."""
        hour = self.acq_time // 100
        minute = self.acq_time % 100
        return datetime.strptime(self.acq_date, "%Y-%m-%d").replace(
            hour=hour, minute=minute, tzinfo=timezone.utc
        )

    @property
    def age_hours(self) -> float:
        """Age in hours relative to now."""
        return (datetime.now(timezone.utc) - self.acquired_at).total_seconds() / 3600


@dataclass
class FirmsResponse:
    """Typed FIRMS API response."""

    hotspots: list[Hotspot]
    source: SourceStatus
    raw_count: int


# ── Connector ────────────────────────────────────────────────────────────


class FirmsSource(BaseSource):
    """NASA FIRMS hotspot connector."""

    FIRMS_PRODUCTS = [
        "VIIRS_SNPP_NRT",
        "VIIRS_NOAA20_NRT",
        "VIIRS_NOAA21_NRT",
        "MODIS_NRT",
    ]

    def __init__(self, api_key: str):
        super().__init__(
            name="firms",
            base_url="https://firms.modaps.eosdis.nasa.gov/api/area/csv",
            cache_ttl=900,  # 15 min — matches ingestion cadence
            rate_per_second=5.0,
        )
        self.api_key = api_key
        self._quota_limit = 2000  # FIRMS Map Key: 2000 req/day

    async def fetch(
        self,
        bbox: tuple[float, float, float, float],
        days: int = 7,
        products: list[str] | None = None,
    ) -> FirmsResponse:
        """
        Fetch hotspots across specified products.

        Args:
            bbox: (lon_min, lat_min, lon_max, lat_max)
            days: Number of days to look back (max 30 for NRT)
            products: Which products to query (default: all 4)
        """
        products = products or self.FIRMS_PRODUCTS
        lon_min, lat_min, lon_max, lat_max = bbox

        all_hotspots: list[Hotspot] = []

        for product in products:
            cache_key = self._cache_key(
                product, str(lon_min), str(lat_min), str(lon_max), str(lat_max), str(days)
            )

            # Try cache first
            cached = await self._cache_get(cache_key)
            if cached:
                hotspots = [Hotspot(**h) for h in cached]
                all_hotspots.extend(hotspots)
                continue

            # Fetch from API
            params = {
                "api_key": self.api_key,
                "area": f"{lon_min},{lat_min},{lon_max},{lat_max}",
                "days": str(days),
            }

            try:
                data = await self._request("GET", f"{product}/1", params=params)

                # FIRMS CSV returns a list of dicts
                if isinstance(data, list):
                    for row in data:
                        try:
                            hotspot = Hotspot(
                                latitude=float(row.get("latitude", 0)),
                                longitude=float(row.get("longitude", 0)),
                                acq_date=row.get("acq_date", ""),
                                acq_time=int(row.get("acq_time", 0)),
                                satellite=row.get("satellite", ""),
                                confidence=row.get("confidence", "low"),
                                frp=float(row.get("frp", 0)),
                                daynight=row.get("daynight", "D"),
                                bright_ti4=(
                                    float(row["bright_ti4"])
                                    if row.get("bright_ti4")
                                    else None
                                ),
                                bright_ti5=(
                                    float(row["bright_ti5"])
                                    if row.get("bright_ti5")
                                    else None
                                ),
                            )
                            all_hotspots.append(hotspot)
                        except (ValueError, KeyError) as e:
                            logger.warning(
                                "firms.parse_error",
                                product=product,
                                error=str(e),
                            )

                # Cache the result
                await self._cache_set(
                    cache_key, [h.__dict__ for h in all_hotspots], self.cache_ttl
                )

            except Exception as e:
                logger.error("firms.fetch_error", product=product, error=str(e))

        return FirmsResponse(
            hotspots=all_hotspots,
            source=self._build_status(available=len(all_hotspots) > 0, latency=0),
            raw_count=len(all_hotspots),
        )


# ── Module-level factory ────────────────────────────────────────────────
_firms_instance: FirmsSource | None = None


def get_firms_source(api_key: str | None = None) -> FirmsSource:
    """Singleton factory for FirmsSource."""
    global _firms_instance
    if _firms_instance is None:
        if not api_key:
            raise ValueError("NASA_FIRMS_API_KEY is required")
        _firms_instance = FirmsSource(api_key)
    return _firms_instance
