"""
NASA FIRMS — Fire Information for Resource Management System.

🔒 La clé FIRMS est lue depuis ``Settings.firms_map_key`` (``SecretStr``).
Le constructeur n'accepte plus de clé en argument : la sécurité ne dépend
plus de la diligence de l'appelant.

Products: VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT.
Quota: 2 000 req/jour gratuit via firms.modaps.eosdis.nasa.gov/api/map_key.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.settings import get_settings

logger = logging.getLogger("pyroscope.sources.firms")

FIRMS_PRODUCTS = frozenset(
    {"VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"}
)


@dataclass
class Hotspot:
    """Détection FIRMS typée."""

    latitude: float
    longitude: float
    acq_date: str
    acq_time: int
    satellite: str
    confidence: str
    frp: float
    daynight: str
    bright_ti4: float | None = None
    bright_ti5: float | None = None

    def __post_init__(self) -> None:
        if not -90 <= self.latitude <= 90 or not -180 <= self.longitude <= 180:
            raise ValueError(f"Hors plage : lat={self.latitude} lon={self.longitude}")

    @property
    def acquired_at(self) -> datetime:
        hour = self.acq_time // 100
        minute = self.acq_time % 100
        return datetime.strptime(self.acq_date, "%Y-%m-%d").replace(
            hour=hour, minute=minute, tzinfo=timezone.utc
        )

    @property
    def age_hours(self) -> float:
        return (datetime.now(timezone.utc) - self.acquired_at).total_seconds() / 3600


class FirmsSource:
    """Connecteur FIRMS singleton.

    ⚠️ Cette classe ne reçoit plus la clé en argument : elle lit
    ``Settings.firms_map_key``. Un dépassement de quota reste possible
    si l'appelant boucle ; mitigation : cache Redis côté router.
    """

    BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
    QUOTA_LIMIT_DAILY = 2_000

    def __init__(self) -> None:
        # Source d'autorité unique pour la clé : ``Settings``.
        self._key = get_settings().require("firms_map_key")
        self._quota_used = 0

    @property
    def quota_used(self) -> int:
        return self._quota_used

    @classmethod
    def from_settings(cls) -> "FirmsSource":
        """Factory back-compat avec les appels existants."""
        return cls()

    def build_url(
        self, sensor: str, bbox: tuple[float, float, float, float], days: int
    ) -> str:
        """Compose l'URL. La méthode existe pour les tests : JAMAIS
        ``log.info(url=...)`` ailleurs, la clé est dans le path.
        """
        if sensor not in FIRMS_PRODUCTS:
            raise ValueError(f"Capteur inconnu : {sensor}")
        w, so, e, n = bbox
        return f"{self.BASE_URL}/{self._key}/{sensor}/{w},{so},{e},{n}/{days}"
