"""
Échantillonnage négatif — stratégie matched-pair spatio-temporel.

Stratégie (documentée dans docs/PHASE5_FEASIBILITY.md §4) :
- 5 négatifs spatiaux : même jour, cellules voisines non brûlées (même FWI & météo)
- 5 négatifs temporels : même cellule, J-30, J-60, J-90 (même saison, conditions sèches)
- 10 % de garde : tirage uniforme sur l'espace × temps

La fréquence de base réelle (~10⁻⁴) n'est pas récupérable dans ce cadrage
cas-témoins. La sortie est un SCORE conditionnel, jamais une probabilité.
"""

from __future__ import annotations

import random
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Callable
import numpy as np

logger = logging.getLogger("pyroscope.ml.sampling")

SEED = 42
random.seed(SEED)
np.random.seed(SEED)


@dataclass
class SampledCellDay:
    """A cell-day sample with its label and source."""

    cell_id: int
    date: date
    latitude: float
    longitude: float
    label: bool  # True = fire occurred
    source: str = "positive"  # "positive" | "negative_spatial" | "negative_temporal" | "negative_uniform"
    weight: float = 1.0


class NegativeSampler:
    """Matched-pair negative sampling.

    Usage:
        sampler = NegativeSampler(get_cell_fn, n_cells=4500)
        positives = [...]  # list of SampledCellDay with label=True
        all_samples = sampler.sample(positives)
    """

    def __init__(
        self,
        get_cell_fn: Callable[[int], tuple[float, float] | None] | None = None,
        n_cells: int = 4500,
        n_spatial: int = 5,
        n_temporal: int = 5,
        uniform_frac: float = 0.10,
    ):
        """
        Args:
            get_cell_fn: Function: cell_id → (lat, lon) or None
            n_cells: Total number of grid cells
            n_spatial: Number of spatial negatives per positive
            n_temporal: Number of temporal negatives per positive
            uniform_frac: Fraction of total samples to draw uniformly
        """
        self.get_cell = get_cell_fn or (lambda cid: (44.5 + cid * 0.0003, -0.5 + cid * 0.0003))
        self.n_cells = n_cells
        self.n_spatial = n_spatial
        self.n_temporal = n_temporal
        self.uniform_frac = uniform_frac

    def _neighbor_cells(self, cell_id: int, radius_cells: int = 3) -> list[int]:
        """Return IDs of cells within `radius_cells` cells (≈ 750m)."""
        neighbors = []
        for dx in range(-radius_cells, radius_cells + 1):
            for dy in range(-radius_cells, radius_cells + 1):
                if dx == 0 and dy == 0:
                    continue
                nid = cell_id + dx * 100 + dy  # approximate 2D indexing
                if 0 <= nid < self.n_cells:
                    neighbors.append(nid)
        return random.sample(neighbors, min(self.n_spatial, len(neighbors)))

    def sample(
        self,
        positives: list[SampledCellDay],
        all_dates: list[date] | None = None,
    ) -> list[SampledCellDay]:
        """Generate the full training set with negative sampling.

        Args:
            positives: Known fire cell-day observations
            all_dates: All dates in the dataset (for uniform sampling)

        Returns:
            List of all samples (positives + negatives), shuffled.
        """
        samples: list[SampledCellDay] = list(positives)
        positive_set: set[tuple[int, int, int]] = set()

        for p in positives:
            key = (p.cell_id, p.date.year, p.date.timetuple().tm_yday)
            positive_set.add(key)

        # ── Spatial negatives ──────────────────────────────────────
        for p in positives:
            neighbors = self._neighbor_cells(p.cell_id)
            for nid in neighbors:
                key = (nid, p.date.year, p.date.timetuple().tm_yday)
                if key not in positive_set:
                    lat, lon = self.get_cell(nid)
                    samples.append(SampledCellDay(
                        cell_id=nid,
                        date=p.date,
                        latitude=lat,
                        longitude=lon,
                        label=False,
                        source="negative_spatial",
                        weight=1.0,
                    ))

        # ── Temporal negatives ──────────────────────────────────────
        temporal_offsets = [-30, -60, -90, -180, -365]
        for p in positives:
            for offset in temporal_offsets:
                tdate = p.date + timedelta(days=offset)
                if tdate.year < 2006 or tdate > date(2024, 12, 31):
                    continue
                key = (p.cell_id, tdate.year, tdate.timetuple().tm_yday)
                if key not in positive_set:
                    lat, lon = self.get_cell(p.cell_id)
                    samples.append(SampledCellDay(
                        cell_id=p.cell_id,
                        date=tdate,
                        latitude=lat,
                        longitude=lon,
                        label=False,
                        source="negative_temporal",
                        weight=1.0,
                    ))

        # ── Uniform negatives (10% guard) ────────────────────────────
        n_uniform = int(len(samples) * self.uniform_frac / (1 - self.uniform_frac))
        all_dates_list = all_dates or [
            date(year, 7, 15) for year in range(2006, 2025)
        ]

        attempts = 0
        while len([s for s in samples if s.source == "negative_uniform"]) < n_uniform and attempts < n_uniform * 5:
            attempts += 1
            cid = random.randint(0, self.n_cells - 1)
            d = random.choice(all_dates_list)
            key = (cid, d.year, d.timetuple().tm_yday)
            if key not in positive_set:
                lat, lon = self.get_cell(cid)
                samples.append(SampledCellDay(
                    cell_id=cid,
                    date=d,
                    latitude=lat,
                    longitude=lon,
                    label=False,
                    source="negative_uniform",
                    weight=1.0,
                ))

        # Shuffle
        random.shuffle(samples)

        logger.info(
            "sampling.done",
            n_positives=len(positives),
            n_total=len(samples),
            n_spatial=len([s for s in samples if s.source == "negative_spatial"]),
            n_temporal=len([s for s in samples if s.source == "negative_temporal"]),
            n_uniform=len([s for s in samples if s.source == "negative_uniform"]),
        )

        return samples


# ── Data leakage tests ──────────────────────────────────────────────────


def test_temporal_leakage(
    train_dates: list[date], test_dates: list[date]
) -> bool:
    """Vérifie qu'aucune date de test n'est antérieure à la dernière date d'entraînement.

    Retourne True si le test passe (pas de fuite).
    """
    max_train = max(train_dates) if train_dates else date.min
    min_test = min(test_dates) if test_dates else date.max
    return min_test >= max_train


def test_spatial_leakage(
    train_cells: set[int], test_cells: set[int], buffer_cells: int = 3
) -> bool:
    """Vérifie qu'aucune cellule de test n'est dans le buffer spatial des cellules d'entraînement.

    buffer_cells: nombre de cellules de garde (~750m)."""
    for tc in train_cells:
        for dx in range(-buffer_cells, buffer_cells + 1):
            for dy in range(-buffer_cells, buffer_cells + 1):
                neighbor = tc + dx * 100 + dy
                if neighbor in test_cells:
                    return False
    return True


def test_fwi_leakage(training_fwi: np.ndarray, test_fwi: np.ndarray) -> bool:
    """Vérifie que le FWI de test n'est pas identique au FWI d'entraînement
    (ce qui indiquerait une fuite par jointure incorrecte)."""
    overlap = np.isin(test_fwi, training_fwi)
    return float(overlap.mean()) < 0.5  # moins de 50% de valeurs identiques = OK


ALL_LEAKAGE_TESTS = [
    ("temporal", test_temporal_leakage),
    ("spatial", test_spatial_leakage),
    ("fwi", test_fwi_leakage),
]
