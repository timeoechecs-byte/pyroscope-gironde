"""
PyroScope 33 — Database models.

TimescaleDB hypertables for:
- fwi_state: daily CFFWIS values per cell
"""

from __future__ import annotations

import datetime

from sqlalchemy import (
    Column,
    Integer,
    Float,
    Text,
    DateTime,
    JSON,
    Index,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class FWIStateModel(Base):
    """
    Daily CFFWIS state per grid cell (TimescaleDB hypertable).

    Stores the recursive state of all six FWI components.
    The `date` column is used as the time dimension for TimescaleDB.
    """

    __tablename__ = "fwi_state"

    cell_id = Column(Integer, primary_key=True)
    date = Column(DateTime(timezone=True), primary_key=True)

    # CFFWIS components
    ffmc = Column(Float, nullable=True)
    dmc = Column(Float, nullable=True)
    dc = Column(Float, nullable=True)
    isi = Column(Float, nullable=True)
    bui = Column(Float, nullable=True)
    fwi = Column(Float, nullable=True)
    dsr = Column(Float, nullable=True)

    # Input values
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    wind_speed = Column(Float, nullable=True)
    rain = Column(Float, nullable=True)

    # Metadata
    model = Column(Text, default="cffwis_v1")  # version tracking
    computed_at = Column(DateTime(timezone=True), default=datetime.datetime.now)
    quality = Column(JSON, default=dict)

    def __repr__(self):
        return f"<FWIState(cell={self.cell_id}, date={self.date.date()}, fwi={self.fwi})>"


class WeatherSeriesModel(Base):
    """
    Raw weather data per cell (TimescaleDB hypertable).

    PHASE 1: stores ingested Open-Meteo data before FWI computation.
    """

    __tablename__ = "weather_series"

    cell_id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), primary_key=True)
    temperature = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    wind_speed = Column(Float, nullable=True)
    wind_direction = Column(Float, nullable=True)
    wind_gusts = Column(Float, nullable=True)
    precipitation = Column(Float, nullable=True)
    soil_moisture = Column(Float, nullable=True)
    source = Column(Text, default="open_meteo_arome_hd")
    ingested_at = Column(DateTime(timezone=True), default=datetime.datetime.now)


# Migration helper: converts regular table to hypertable
MAKE_HYPERTABLE_SQL = """
SELECT create_hypertable('{table}', '{time_column}',
    if_not_exists => TRUE,
    migrate_data => TRUE,
    chunk_time_interval => INTERVAL '1 day');
"""
