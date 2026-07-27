# PyroScope 33

> ⚠️ **Outil expérimental à visée informative et pédagogique. Les détections satellite sont des anomalies thermiques, pas des incendies confirmés. Ne jamais utiliser pour une décision opérationnelle ou de sécurité. En cas d'incendie : 18 / 112. Sources officielles : SDIS 33, Préfecture de la Gironde, Météo-France (Météo des Forêts).**

Application web **open source** de suivi et d'évaluation du **risque d'incendie de forêt**
sur le département de la **Gironde** (France).

**Statut :** PHASE 1 — spécifications & ossature uniquement. Aucune donnée d'incendie n'est
ingérée à ce stade. Voir [`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md).

---

## Emprise géographique

- `lon_min = -1.35`, `lon_max =  0.35`
- `lat_min = 44.15`, `lat_max = 45.60`
- Grille de calcul : cellules de **250 m** en `EPSG:2154` (Lambert-93)
- Affichage : reprojection en `EPSG:4326`

Toute donnée hors emprise est ignorée.

## Stack technique (socle non négociable)

| Couche | Choix imposé |
| --- | --- |
| Backend | Python 3.12 · FastAPI · Pydantic v2 |
| Tâches planifiées | APScheduler (pas de Celery en phase 1) |
| Base de données | PostgreSQL 16 + PostGIS + TimescaleDB |
| Cache | Redis |
| Calcul géospatial | xarray · rasterio · geopandas · shapely · pyproj · numpy |
| ML (phases tardives) | scikit-learn · XGBoost · LightGBM · CatBoost · PyTorch |
| Frontend | React · TypeScript · Vite |
| Cartographie | MapLibre GL JS + tuiles OSM / IGN Géoplateforme (WMTS gratuit) |
| Graphiques | Recharts |
| Tests | pytest · vitest |
| Qualité | ruff · mypy strict · eslint |
| Déploiement | Docker · docker compose |

**Interdits** : Mapbox, Google Maps, toute clé de carte payante, toute API LLM propriétaire,
toute valeur inventée oumockée pour combler un trou.

## Trois modes d'exécution

| Mode | Usage | Ce qui tourne réellement |
| --- | --- | --- |
| **A. Preview Freebuff** (frontend seul) | Itinérance du projet, démo visuelle, lecture du code | React/Vite uniquement. Tuiles OSM/IGN statiques. Backend **absent** → bandeau « données indisponibles » sur les panneaux dynamiques. |
| **B. Dev local « full »** | Développement backend + frontend | `docker compose up` (Postgres + PostGIS + TimescaleDB + Redis + FastAPI) puis Vite en local. |
| **C. Production** | Mise en service | Même stack que B derrière un reverse-proxy (Caddy / Traefik), sauvegardes Postgres, monitoring. |

> Le mode A est **structurellement dégradé** par construction : la prévisualisation Freebuff est
> un environnement **Node + navigateur** et ne peut exécuter ni Python, ni PostgreSQL, ni
> Docker. C'est précisément ce que la spec §2 appelle le « mode dégradé officiel » — aucune
> valeur fabriquée, signalement explicite de la donnée manquante.

## Plan

| Phase | Périmètre | État |
| --- | --- | --- |
| **PHASE 1** | Spécifications, ossature monorepo, structure backend + frontend, moteur CFFWIS avec tests de référence | **En cours** |
| PHASE 2 | Sources temps réel : NASA FIRMS (points chauds), Open-Meteo (météo/prévisions) | Planifiée |
| PHASE 3 | Copernicus Data Space (NDVI/NDMI), IGN BD Forêt, OSM/Overpass, IGN RGE ALTI | Planifiée |
| PHASE 4 | Coefficient Gironde, Rothermel, score de risque 0-100 + décomposition + indicateur de qualité | Planifiée |
| PHASE 5+ | Composante ML : entraînement sur historique validé, recalibrage | Planifiée |

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — sections 1 à 6 de la spécification, intégrales en français.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — structure monorepo, limites preview Freebuff, mode dégradé.
- [`docs/PHASE_PLAN.md`](docs/PHASE_PLAN.md) — découpage PHASE 1 → N et critères de sortie.
- [`docs/SOURCES.md`](docs/SOURCES.md) — catalogue des sources de données et statut d'intégration.

## Avertissement légal (rappel obligatoire)

Cette application est un **outil expérimental à visée informative et pédagogique**.
Les détections satellite sont des **anomalies thermiques**, pas des incendies confirmés.
**Ne jamais utiliser pour une décision opérationnelle ou de sécurité.**

En cas d'incendie réel : **18** (pompiers) ou **112** (urgences européennes).

Sources officielles :

- **SDIS 33** — Service départemental d'incendie et de secours de la Gironde
- **Préfecture de la Gironde** — http://www.gironde.gouv.fr
- **Météo-France** — Météo des Forêts — https://meteofrance.com/meteo-des-forets

Ce bandeau apparaîtra également en clair, sans scrollable, dans l'interface web (composant
figé, z-index maximum, non masquable).

## Licence

À confirmer. Choix par défaut proposé : **AGPL-3.0** (cohérent avec la redistribution de
données Copernicus, IGN et OpenStreetMap). Une décision est attendue avant le commit de
la phase 2.

## Licence des données cartographiques affichées

- Tuiles OpenStreetMap : © OpenStreetMap contributors, **ODbL**.
- Tuiles IGN Géoplateforme : © IGN, **licence ouverte** (autorisation avec mention).
- Données Copernicus : **libres et gratuites** avec attribution.
- Données NASA FIRMS : utilisation non commerciale (mention exigée).
- Données Open-Meteo / ERA5 : **usage non commercial**.
