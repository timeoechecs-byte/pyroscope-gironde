"""
Base connector — retry, timeout, rate-limit, Redis cache.

Every source connector (FIRMS, Open-Meteo, Copernicus, etc.) inherits from
BaseSource and exposes a typed function.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, TypeVar

import httpx

logger = logging.getLogger("pyroscope.sources")

T = TypeVar("T")


@dataclass
class SourceStatus:
    """Status of a data source for quality tracking."""

    source: str
    available: bool
    data_age_seconds: float
    latency_seconds: float
    quota_used: int
    quota_limit: int
    error: str | None = None


class SourceError(Exception):
    """Raised when a source connector fails permanently."""

    def __init__(self, source: str, message: str, status: SourceStatus | None = None):
        self.source = source
        self.status = status
        super().__init__(f"[{source}] {message}")


class BaseSource(ABC):
    """Abstract base source connector.

    Features:
    - Exponential retry (3 attempts, 1s/2s/4s backoff)
    - HTTP timeout (15s default)
    - Redis cache with TTL
    - Rate-limit awareness
    - Prometheus metrics scaffolding
    """

    def __init__(
        self,
        name: str,
        base_url: str,
        timeout: float = 15.0,
        max_retries: int = 3,
        cache_ttl: int = 300,
        rate_per_second: float = 10.0,
    ):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.cache_ttl = cache_ttl
        self.rate_per_second = rate_per_second
        self._last_call: float = 0.0
        self._quota_used = 0
        self._quota_limit = 0

    # ── Cache helpers ────────────────────────────────────────────────
    def _cache_key(self, *parts: str) -> str:
        raw = f"{self.name}:{':'.join(parts)}"
        return hashlib.sha256(raw.encode()).hexdigest()

    async def _cache_get(self, key: str) -> Any | None:
        """Placeholder — Redis integration in PHASE 1+."""
        return None

    async def _cache_set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Placeholder — Redis integration in PHASE 1+."""
        pass

    # ── Rate limiter ─────────────────────────────────────────────────
    async def _throttle(self):
        """Ensure we don't exceed rate_per_second."""
        elapsed = time.monotonic() - self._last_call
        min_interval = 1.0 / self.rate_per_second
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_call = time.monotonic()

    # ── HTTP call with retry ──────────────────────────────────────────
    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        **kwargs,
    ) -> dict[str, Any] | list[Any]:
        """Make an HTTP request with exponential retry and timeout."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        last_error: Exception | None = None

        for attempt in range(self.max_retries):
            try:
                await self._throttle()
                start = time.monotonic()
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.request(
                        method, url, params=params, headers=headers, **kwargs
                    )
                latency = time.monotonic() - start

                # Track quota (extract from response headers if available)
                self._quota_used += 1

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", "60"))
                    logger.warning(
                        "rate_limited",
                        source=self.name,
                        retry_after=retry_after,
                    )
                    await asyncio.sleep(retry_after)
                    continue

                resp.raise_for_status()
                return resp.json()

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_error = e
                wait = 2**attempt
                logger.warning(
                    "request_retry",
                    source=self.name,
                    attempt=attempt + 1,
                    wait=wait,
                    error=str(e),
                )
                await asyncio.sleep(wait)

            except httpx.HTTPStatusError as e:
                last_error = e
                if e.response.status_code < 500:
                    # Client error — don't retry
                    break
                wait = 2**attempt
                await asyncio.sleep(wait)

        raise SourceError(
            self.name,
            f"Request failed after {self.max_retries} attempts: {last_error}",
        )

    def _build_status(self, available: bool, latency: float) -> SourceStatus:
        return SourceStatus(
            source=self.name,
            available=available,
            data_age_seconds=0.0,
            latency_seconds=round(latency, 2),
            quota_used=self._quota_used,
            quota_limit=self._quota_limit,
            error=None if available else "Source unavailable",
        )

    @abstractmethod
    async def fetch(self, **kwargs) -> Any:
        """Fetch data from source. Implemented by subclasses."""
        ...
