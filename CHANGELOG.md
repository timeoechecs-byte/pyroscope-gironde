# Changelog

Toutes les modifications notables de PyroScope 33 sont documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/),
et le projet suit [Semantic Versioning](https://semver.org/).

---

## [0.7.0] — 2026-07-27 — PHASE 7 — Pérennité et ouverture

### Ajouté
- Export GeoJSON, CSV, JSON des couches risque, FWI, hotspots, météo, végétation
  (`/api/v1/export/{layer}.{format}`)
- Composant `ExportPanel` avec sélecteur de couche et format
- `docs/METHODOLOGY.md` : documentation complète de la chaîne de calcul
- `docs/LIMITATIONS.md` : limitations fondamentales, données, modèle et opérationnelles
- `LICENSE` (AGPL-3.0)
- `CONTRIBUTING.md` et `CODE_OF_CONDUCT.md`
- `docs/REVIEWS.md` : template pour revue externe
- Bandeau « Arrêt propre » : alerte si données non mises à jour depuis > 7 jours
- Responsive : sidebar repliable sur mobile, filtres adaptatifs, contrôles tactiles

### Modifié
- `README.md` : licence AGPL-3.0, badges CI, statut PHASE 7
- `docs/BACKLOG.md` : §2 critères d'arbitrage renforcés, §5 radiation à 6 mois
- `src/pages/Dashboard.tsx` : responsive mobile, export panel, arrêt propre

### Technique
- Backend `routers/export.py` : GeoJSON/CSV/JSON avec attribution obligatoire
- Attribution légale dans chaque export (header `X-Attribution`)
- Métriques Prometheus complétées pour toutes les sources

---

## [0.6.0] — 2026-07-27 — PHASE 6 — Mise en production

### Ajouté
- PWA : manifest, service worker (cache-first assets, network-first API)
- Mode crise : toggle API, bannière prioritaire, désactivation des couches coûteuses
- Alertes utilisateur : cellules surveillées avec seuils, notifications, repli RSS
- Vector tiles MVT : `/api/v1/tiles/{layer}/{z}/{x}/{y}.mvt`
- API publique v1 : version, health, OpenAPI 3.1, Swagger UI
- Rate limiting : 100 req/min par IP sur `/api/v1/`
- `docs/LICENSING.md`, `docs/RUNBOOK.md`, `docs/COSTS.md`

### Technique
- 5 nouveaux routers backend insérés
- Cache Redis avec invalidation pilotée par ingestion
- Métriques Prometheus : data_age, ingestion, quota, coverage

---

## [0.5.0] — 2026-07-27 — PHASE 5 — Machine Learning (conditionnel)

### Ajouté
- Pipeline ML complet : dataset, sampling, baselines, trainer, drift
- `app/ml/dataset.py` : assemblage + feature engineering (31 features)
- `app/ml/sampling.py` : matched-pair spatio-temporel (5+5+10% uniforme)
- `app/ml/baselines.py` : FWI-only + FWI+coeff_local
- `app/ml/trainer.py` : XGBoost, LightGBM, CatBoost + ensemble + SHAP
- `app/ml/drift.py` : PSI, alerte > 0.2, réentraînement annuel
- `tests/ml/test_sampling.py` : 12 tests fuite temporelle/spatiale
- `tests/ml/test_drift.py` : 4 tests détection de dérive

### Note
- Pas de modèle entraîné — pipeline prêt pour exécution locale

---

## [0.4.0] — 2026-07-27 — PHASE 4 — Propagation et score

### Ajouté
- Moteur FBP complet : ROS, Byram intensity, flame length, crown fire
- Moteur Rothermel secondaire : Scott & Burgan 40 modèles
- Ellipses de propagation : Alexander 1985, per-epoch wind 1/3/6/12h
- Coefficient local Gironde : 14 facteurs depuis YAML éditable
- Score de risque séparé ignition/spread avec décomposition
- Mode simulation : clic → allumage → propagation → curseur temporel
- `docs/VALIDATION_2022.md` : rétrospective Landiras + La Teste-de-Buch
- 61 tests unitaires PHASE 4

---

## [0.3.0] — 2026-07-27 — PHASE 3 — Végétation et terrain

### Ajouté
- Connecteur Copernicus CDSE : OAuth2, Sentinel-2 L2A, NDVI/NDMI/NBR
- Connecteur IGN Géoplateforme : BD Forêt V2, RGE ALTI, Copernicus DEM
- Connecteur CORINE Land Cover : 5 classes clés Gironde
- Connecteur Overpass API : routes, campings, parkings, bâti
- Mapping combustible : BD Forêt → SB-40 + FBP
- API vegetation : fuel, species, elevation, ndvi, human endpoints
- Composants VegetationLayer, TerrainLayer

---

## [0.2.0] — 2026-07-27 — PHASE 2 — Moteur FWI

### Ajouté
- Moteur CFFWIS complet : FFMC, DMC, DC, ISI, BUI, FWI, DSR
- Tests sur cas publiés Van Wagner 1985 (18 tests)
- Persistance TimescaleDB : hypertable fwi_state
- API FWI : `/api/fwi/current`, `/api/fwi/series`
- Composants FWICurve (30j) et FWIMapLayer (classes EFFIS)

---

## [0.1.0] — 2026-07-27 — PHASE 1 — MVP visualisation

### Ajouté
- Connecteur NASA FIRMS : 4 produits, cache 15 min
- Connecteur Open-Meteo : AROME HD, grille 40-60 points
- Endpoints : `/api/hotspots`, `/api/weather/grid`, `/api/weather/point`
- Carte MapLibre : fond OSM, Gironde centré
- Points chauds : FRP/confidence, popup, filtres période/confiance/FRP
- Vent animé en particules, isothermes
- Bandeau légal, clair/sombre, responsive

---

## [0.0.0] — 2026-07-26 — Initialisation

### Ajouté
- Squelette du dépôt
- Spécification `docs/SPEC.md`
- Plan de phasage `docs/PHASE_PLAN.md`
- Catalogue des sources `docs/SOURCES.md`
- Architecture doc `docs/ARCHITECTURE.md`
