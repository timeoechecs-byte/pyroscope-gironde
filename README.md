# PyroScope 33

> ⚠️ **Outil expérimental à visée informative et pédagogique. Les détections satellite sont des anomalies thermiques, pas des incendies confirmés. Ne jamais utiliser pour une décision opérationnelle ou de sécurité. En cas d'incendie : 18 / 112. Sources officielles : SDIS 33, Préfecture de la Gironde, Météo-France (Météo des Forêts).**

Application web **open source** de suivi et d'évaluation du **risque d'incendie de forêt**
sur le département de la **Gironde** (France).

**Statut :** Phase Pré-0 + PHASE 0 livrées (spec, doc, CI, mode dégradé doc-only).
PHASE 1 → PHASE 5 spécifiées (connecteurs, CFFWIS, FBP + Rothermel, coefficient Gironde,
ML conditionnée avec gate validé sur données). PHASE 6 + PHASE 7 spécifiées (mise en
production, pérennité). **La feuille de route s'arrête à PHASE 7 — il n'y a pas de
phase 8.** Tout ce qui suit relève du backlog : [`docs/BACKLOG.md`](docs/BACKLOG.md).

---

## Emprise géographique — trois bboxes

Une seule bbox polyvalente conduit à des artefacts (cônes tronqués, surcoût d'ingestion,
affichage incohérent). Trois bboxes distinctes sont imposées :

| Bbox | Usage | Valeur typique (lon_min, lat_min, lon_max, lat_max) |
| --- | --- | --- |
| `BBOX_DEPARTEMENT` | **Affichage, attribution, périmètre annoncé.** | (-1.35, 44.15, 0.35, 45.60) |
| `BBOX_CALCUL` | **Calcul scientifique** (FWI, Rothermel, coefficient Gironde). `BBOX_DEPARTEMENT.expand(20_km)`. | ≈ (-1.55, 43.97, 0.60, 45.78) |
| `BBOX_INGESTION` | **Ingestion large** (FIRMS, Open-Meteo, Copernicus). `BBOX_DEPARTEMENT.expand(45_km)`. | ≈ (-1.70, 43.80, 0.95, 45.95) |

- Grille de calcul : cellules de **250 m** en `EPSG:2154` (Lambert-93).
- Affichage : reprojection en `EPSG:4326`.
- Toute donnée hors `BBOX_DEPARTEMENT` est étiquetée `hors_périmètre: true` ou filtrée
  avant affichage utilisateur.

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
| --- | --- | ---|
| **Phase Pré-0** | Spécifications, ossature docs, arbre de décisions | **Livrée** |
| **PHASE 0** | Fondations : docker compose, Alembic, healthcheck `/healthz`, scaffold `/metrics`, CI, README | **Démarrable** |
| **PHASE 1** | MVP visualisation : NASA FIRMS + Open-Meteo (AROME HD), carte MapLibre | Planifiée |
| **PHASE 2** | Moteur FWI : CFFWIS complet + ERA5 historique + persistance TimescaleDB | Planifiée |
| **PHASE 3** | Végétation & terrain : BD Forêt V2, RGE ALTI, CORINE, NDVI/NDMI Sentinel-2 | Planifiée |
| **PHASE 4** | Propagation Rothermel + coefficient Gironde (YAML) + score 0-100 + mode simulation | Planifiée |
| **PHASE 5** | ML **conditionnée** : jeu d'allumages géolocalisé + validation temporelle par blocs battant le baseline FWI | **Conditionnée** |
| **PHASE 6** | Mise en production, diffusion et résilience. Performance (MVT, Redis, Brotli), observabilité étendue, alerting technique distinct des notifications utilisateur, surveillance de zone avec avertissement de non-garantie, PWA + hors-ligne avec âge visible, API publique versionnée, accessibilité WCAG AA, mode crise activable manuellement, posture réglementaire (différenciation explicite de la vigilance officielle). | Planifiée |
| **PHASE 7** | Pérennité, ouverture et extension. `METHODOLOGY.md` + `LIMITATIONS.md`, notebooks de reproduction, ouverture du code (licence consciente), revue externe à 3 regards (scientifique INRAE, opérationnel SDIS 33/DFCI, technique), extension géographique 33 → 33+40+47 conditionnée à un socle solide, plan de continuité, décision tranchée **personnel / avec utilisateurs**. | Planifiée |
| **Clôture** | **La feuille de route s'arrête à PHASE 7. Pas de phase 8.** Tout ce qui suit est dans [`docs/BACKLOG.md`](docs/BACKLOG.md), avec critères d'arbitrage stricts et tableau permanent des éléments volontairement retirés. | **Scellée** |

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

## Licence des données cartographiques et météo

- Tuiles OpenStreetMap : © OpenStreetMap contributors, **ODbL**.
- Tuiles IGN Géoplateforme : © IGN, **licence ouverte** (autorisation avec mention).
- Données Copernicus : **libres et gratuites** avec attribution.
- Données NASA FIRMS : utilisation non commerciale (mention exigée).

### Open-Meteo — usage non commercial, 4 conditions cumulatives

Open-Meteo est fourni sous licence **non commerciale**. Le projet PyroScope 33 s'engage
sur les **quatre conditions cumulatives** suivantes :

1. **Open source** (AGPL-3.0 à confirmer avant finalisation du `LICENSE`).
2. **Pas de publicité, pas d'abonnement, pas de monétisation** directe ou indirecte.
3. **Attribution CC BY 4.0** visible : pied de page de l'application + page « Sources ».
4. La redistribution des **données météo** Open-Meteo (et NOAA / ECMWF / DWD sous-jacents)
   est mentionnée à chaque visualisation.

**Fallback défini maintenant, pas plus tard** : si le projet devient un jour commercial,
ou dépasse le plafond du tier non commercial, l'option de repli est
**l'auto-hébergement du serveur Open-Meteo** (image Docker officielle open source :
https://github.com/open-meteo/open-meteo). La bascule vers le serveur auto-hébergé
n'introduit pas de dépendance payante ; elle reste conforme à §C-01.
