"""
Fuel model mapping — attribue un modèle de combustible à chaque cellule.

Deux systèmes supportés :
1. Scott & Burgan (2005) — 40 modèles de combustible standard (Rothermel)
2. FBP C-6 Conifer Plantation / C-7 — types de combustible canadiens (FBP)

La correspondance BD Forêt V2 / CORINE → modèle de combustible est une
hypothèse d'expert documentée, marquée `confidence: low|medium|high`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FuelModel:
    """Fuel model assignment for a cell."""

    cell_id: int
    species: str  # from BD Forêt or CORINE

    # Scott & Burgan model
    sb_code: int  # 1-40
    sb_name: str

    # FBP fuel type
    fbp_code: str  # "C-6", "C-7", "M-1", "M-2", "D-1", etc.
    fbp_name: str

    # Fuel characteristics
    fuel_load_1h: float  # tons/hectare (1-hr fuels)
    fuel_load_10h: float
    fuel_load_100h: float
    fuel_load_live_herb: float
    fuel_load_live_woody: float
    savr: float  # Surface area to volume ratio (m²/m³)
    fuel_depth_cm: float
    moisture_of_extinction: float  # %

    # Quality
    confidence: str  # "low" | "medium" | "high"
    source: str  # "bd_foret_v2" | "corine" | "default"


# ── FBP fuel type descriptions ───────────────────────────────────────
# Forestry Canada Fire Danger Group (1992)

FBP_FUEL_TYPES: dict[str, dict] = {
    "C-6": {
        "name": "Conifer Plantation (dense, regular, maritime pine analogue)",
        "description": "Dense planted conifer stand, regular structure, "
                       "low to moderate understory — structurally analogous "
                       "to the Landes de Gascogne pin maritime plantation.",
        "cfl": 0.8,  # Crown fuel load (kg/m²)
        "confidence": "medium",
    },
    "C-7": {
        "name": "Pinus ponderosa / Pseudotsuga menziesii",
        "description": "Open mature conifer — fallback for young/regenerating stands.",
        "cfl": 0.5,
        "confidence": "medium",
    },
    "M-1": {
        "name": "Mixed boreal — conifer + deciduous",
        "description": "Mixed forest with moderate crown closure.",
        "cfl": 0.4,
        "confidence": "low",
    },
    "D-1": {
        "name": "Deciduous leafless (hardwood)",
        "description": "Broadleaf forest in dormant season — low flammability.",
        "cfl": 0.1,
        "confidence": "medium",
    },
    "O-1": {
        "name": "Grass / non-forested",
        "description": "Open grassland, agricultural land — low intensity surface fire.",
        "cfl": 0.0,
        "confidence": "high",
    },
}

# ── Scott & Burgan 40 standard models ───────────────────────────────
# Andrews, P.L. (2018). The Rothermel surface fire spread model and
# associated developments: A comprehensive explanation.
# USDA Forest Service, RMRS-GTR-371.

SB_MODELS: dict[int, dict] = {
    1: {
        "name": "Short grass (1 ft)",
        "load_1h": 0.74, "load_10h": 0.0, "load_100h": 0.0,
        "load_lh": 0.0, "load_lw": 0.0,
        "savr": 3500, "depth_cm": 30.0, "mo_extinction": 12.0,
    },
    2: {
        "name": "Timber — grass and understory",
        "load_1h": 2.0, "load_10h": 1.0, "load_100h": 0.5,
        "load_lh": 0.5, "load_lw": 0.0,
        "savr": 2000, "depth_cm": 30.0, "mo_extinction": 15.0,
    },
    5: {
        "name": "Low brush (1-2 ft)",
        "load_1h": 1.0, "load_10h": 0.5, "load_100h": 0.0,
        "load_lh": 2.0, "load_lw": 0.0,
        "savr": 1800, "depth_cm": 60.0, "mo_extinction": 20.0,
    },
    8: {
        "name": "Closed timber litter (compact)",
        "load_1h": 2.7, "load_10h": 1.0, "load_100h": 1.5,
        "load_lh": 0.0, "load_lw": 0.0,
        "savr": 1600, "depth_cm": 6.0, "mo_extinction": 25.0,
    },
    9: {
        "name": "Hardwood litter (long needle pine)",
        "load_1h": 2.9, "load_10h": 1.4, "load_100h": 0.6,
        "load_lh": 0.0, "load_lw": 0.0,
        "savr": 1800, "depth_cm": 6.0, "mo_extinction": 25.0,
    },
    10: {
        "name": "Timber — litter and understory",
        "load_1h": 3.5, "load_10h": 1.9, "load_100h": 1.3,
        "load_lh": 0.5, "load_lw": 0.0,
        "savr": 1400, "depth_cm": 8.0, "mo_extinction": 20.0,
    },
    # Default agricultural/non-fuel
    99: {
        "name": "Non-burnable / agricultural",
        "load_1h": 0.0, "load_10h": 0.0, "load_100h": 0.0,
        "load_lh": 0.0, "load_lw": 0.0,
        "savr": 1.0, "depth_cm": 1.0, "mo_extinction": 0.0,
    },
}


# ── Species / land cover → Fuel model mapping ───────────────────────
# This is an EXPERT HYPOTHESIS, marked as such.
# Each entry: (species_or_landcover) → (sb_code, fbp_code, confidence)

FUEL_MAP: dict[str, tuple[int, str, str]] = {
    # Maritime pine plantation (dominant in Landes de Gascogne)
    "pin_maritime": (10, "C-6", "medium"),
    # Mixed forest
    "mixte": (9, "M-1", "low"),
    # Deciduous (oak, chestnut, poplar)
    "feuillus": (9, "D-1", "low"),
    # Non-forest (agriculture, urban, water)
    "non_foret": (99, "O-1", "high"),
    # Other unknown
    "autre": (99, "O-1", "low"),

    # CORINE codes
    "foret_coniferes": (10, "C-6", "low"),
    "foret_feuillus": (9, "D-1", "low"),
    "foret_mixte": (9, "M-1", "low"),
    "landes": (5, "C-7", "low"),
    "maquis": (5, "C-7", "low"),
    "pelouses": (1, "O-1", "medium"),
    "terres_arables": (99, "O-1", "medium"),
    "vignobles": (5, "O-1", "low"),
    "urbain_discontinu": (99, "O-1", "high"),
    "urbain_continu": (99, "O-1", "high"),
}


def get_fuel_model(species: str, cell_id: int = 0) -> FuelModel:
    """Map species/land cover to a FuelModel."""
    canonical = species.lower().replace(" ", "_")

    # Try direct lookup
    if canonical in FUEL_MAP:
        sb_code, fbp_code, confidence = FUEL_MAP[canonical]
    else:
        sb_code, fbp_code, confidence = (99, "O-1", "low")

    # Get SB model details
    sb = SB_MODELS.get(sb_code, SB_MODELS[99])
    fbp = FBP_FUEL_TYPES.get(fbp_code, FBP_FUEL_TYPES["O-1"])

    return FuelModel(
        cell_id=cell_id,
        species=species,
        sb_code=sb_code,
        sb_name=sb["name"],
        fbp_code=fbp_code,
        fbp_name=fbp["name"],
        fuel_load_1h=sb["load_1h"],
        fuel_load_10h=sb["load_10h"],
        fuel_load_100h=sb["load_100h"],
        fuel_load_live_herb=sb["load_lh"],
        fuel_load_live_woody=sb["load_lw"],
        savr=sb["savr"],
        fuel_depth_cm=sb["depth_cm"],
        moisture_of_extinction=sb["mo_extinction"],
        confidence=confidence,
        source="fuel_map_lookup",
    )
