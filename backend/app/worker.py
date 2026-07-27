"""
PyroScope 33 — Scheduled task worker.

PHASE 0: scaffold only.
PHASE 1+: FIRMS every 15 min, Open-Meteo every hour, Sentinel daily.
"""

from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("pyroscope.worker")


# ── Placeholder tasks (PHASE 1+) ────────────────────────────────────────
async def ingest_firms():
    """Ingest hotspots from NASA FIRMS."""
    logger.info("firms.ingest", status="not_implemented")


async def ingest_open_meteo():
    """Ingest weather forecast from Open-Meteo."""
    logger.info("open_meteo.ingest", status="not_implemented")


async def ingest_sentinel():
    """Ingest Sentinel-2 imagery (PHASE 3)."""
    logger.info("sentinel.ingest", status="not_implemented")


# ── Runner ──────────────────────────────────────────────────────────────
def main():
    """Start the APScheduler worker."""
    scheduler = AsyncIOScheduler()

    # FIRMS: every 15 min
    scheduler.add_job(
        ingest_firms,
        CronTrigger(minute="*/15"),
        id="firms_every_15min",
        replace_existing=True,
    )

    # Open-Meteo: hourly
    scheduler.add_job(
        ingest_open_meteo,
        CronTrigger(minute="5"),
        id="open_meteo_hourly",
        replace_existing=True,
    )

    # Sentinel: daily at 08:00
    scheduler.add_job(
        ingest_sentinel,
        CronTrigger(hour="8", minute="0"),
        id="sentinel_daily",
        replace_existing=True,
    )

    logger.info("worker.start")
    scheduler.start()

    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        logger.info("worker.stop")
        scheduler.shutdown()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
