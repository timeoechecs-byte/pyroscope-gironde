"""
PyroScope 33 — Settings and configuration.

Loaded from environment variables with Pydantic Settings + ``SecretStr``.

🔒 POLITIQUE (audit 2026-07-28) :
  - Tous les secrets sont ``SecretStr`` : ``repr()`` les masque.
  - ``require()`` refuse de servir une valeur vide.
  - ``firms_map_key`` est lu côté backend UNIQUEMENT.
  - ``cdse_client_id`` est public (peut transiter via le frontend après rotation).
  - ``cdse_client_secret`` et ``cds_api_token`` ne quittent JAMAIS le serveur.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Secrets (jamais loggés, jamais dans le bundle) ───────────────
    firms_map_key: SecretStr = SecretStr("")
    openaq_api_key: SecretStr | None = None
    cdse_client_id: SecretStr | None = None
    cdse_client_secret: SecretStr | None = None
    cds_api_token: SecretStr | None = None

    # ── Configuration publique (pas des secrets) ────────────────────
    cdse_token_url: str = Field(
        default=(
            "https://identity.dataspace.copernicus.eu"
            "/auth/realms/CDSE/protocol/openid-connect/token"
        ),
    )
    cdse_base_url: str = Field(default="https://sh.dataspace.copernicus.eu")

    # ── Bounding boxes (SPEC §1) ─────────────────────────────────────
    BBOX_DEPARTEMENT_LON_MIN: float = -1.35
    BBOX_DEPARTEMENT_LAT_MIN: float = 44.15
    BBOX_DEPARTEMENT_LON_MAX: float = 0.35
    BBOX_DEPARTEMENT_LAT_MAX: float = 45.60

    BBOX_CALCUL_LON_MIN: float = -1.55
    BBOX_CALCUL_LAT_MIN: float = 43.97
    BBOX_CALCUL_LON_MAX: float = 0.60
    BBOX_CALCUL_LAT_MAX: float = 45.78

    BBOX_INGESTION_LON_MIN: float = -1.70
    BBOX_INGESTION_LAT_MIN: float = 43.80
    BBOX_INGESTION_LON_MAX: float = 0.95
    BBOX_INGESTION_LAT_MAX: float = 45.95

    # ── Grid ─────────────────────────────────────────────────────────
    GRID_SIZE_M: int = 250
    GRID_EPSG: int = 2154
    DISPLAY_EPSG: int = 4326

    # ── Environment ───────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Database ──────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://pyroscope:pyroscope@localhost:5432/pyroscope"

    # ── Redis ─────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── CORS (proxy → frontend) ──────────────────────────────────────
    # Liste blanche explicite. Le CORS n'est pas une mesure de sécurité :
    # il protège le navigateur, pas le serveur. Cf. ARCHITECTURE_PROXY.md §4.
    CORS_ALLOWED_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:4173",
        ],
    )

    # ── Rate limiting ────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE_DEFAULT: int = 60
    RATE_LIMIT_PER_MINUTE_TILES: int = 20

    # ── Prometheus ────────────────────────────────────────────────────
    METRICS_ENABLED: bool = True

    # ── Garde-fou de démarrage ───────────────────────────────────────
    def require(self, name: str) -> str:
        """Renvoie la valeur d'un secret, ou lève RuntimeError si absent."""
        value: SecretStr | None = getattr(self, name)
        if value is None or not value.get_secret_value().strip():
            raise RuntimeError(
                f"Secret manquant : {name.upper()}. Définis-le dans .env "
                f"ou dans les variables d'environnement du backend. "
                f"Voir docs/SECURITY.md §Procédure de rotation."
            )
        return value.get_secret_value()

    def public_status(self) -> dict[str, bool]:
        """Statut public des sources — exposé par /api/v1/status.

        AUCUNE valeur de secret — uniquement des booléens.
        Le frontend ne peut pas distinguer une clé valide d'une clé révoquée,
        c'est volontaire : cette information appartient au backend.
        """
        return {
            "firms_configured": bool(
                self.firms_map_key.get_secret_value().strip()
            ),
            "openaq_configured": bool(
                (self.openaq_api_key.get_secret_value() if self.openaq_api_key else "").strip()
            ),
            "cdse_configured": bool(
                (self.cdse_client_id.get_secret_value() if self.cdse_client_id else "").strip()
                and (self.cdse_client_secret.get_secret_value() if self.cdse_client_secret else "").strip()
            ),
            "cds_configured": bool(
                (self.cds_api_token.get_secret_value() if self.cds_api_token else "").strip()
            ),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Singleton (back-compat avec imports existants)
settings = get_settings()

# Convenience tuples for API responses
BBOX_DEPARTEMENT = (
    settings.BBOX_DEPARTEMENT_LON_MIN,
    settings.BBOX_DEPARTEMENT_LAT_MIN,
    settings.BBOX_DEPARTEMENT_LON_MAX,
    settings.BBOX_DEPARTEMENT_LAT_MAX,
)
BBOX_CALCUL = (
    settings.BBOX_CALCUL_LON_MIN,
    settings.BBOX_CALCUL_LAT_MIN,
    settings.BBOX_CALCUL_LON_MAX,
    settings.BBOX_CALCUL_LAT_MAX,
)
BBOX_INGESTION = (
    settings.BBOX_INGESTION_LON_MIN,
    settings.BBOX_INGESTION_LAT_MIN,
    settings.BBOX_INGESTION_LON_MAX,
    settings.BBOX_INGESTION_LAT_MAX,
)
