# Plan de phasage PyroScope 33

Linéarisation du travail respectant la [`docs/SPEC.md`](SPEC.md) §1-6, les contraintes
absolues §C-01..C-05 et l'avertissement légal §3. Chaque phase a un **critère de sortie
testable** et un **lot de commits atomiques** prévu.

## Conventions

- Les commits sont **atomiques et regroupés par phase** (jamais de mélange entre
  phases). Un commit réversible ne doit pas franchir une frontière de phase.
- La spec reste vraie **après** chaque phase : tout ajout à la spec pendant une phase
  est documenté dans [`docs/SPEC.md`](SPEC.md) §8 (« Décisions de phase »).
- **Aucune fabrication de données** : tout ce qui n'est pas issu d'une source réelle est
  affiché « indisponible » dans l'UI (cf. §C-05).
- **Aucune dépendance payante** ajoutée silencieusement : chaque `requirements.txt` ou
  `package.json` doit être revu pour vérifier le respect de §C-01.

---

## PHASE 0 — bootstrap template (déjà faite)

L'environnement Freebuff a livré un template React + Vite + Convex + VlyToolbar.
Statut : frontend uniquement, sans modification.

*(déjà faite, non couverte par ce plan.)*

---

## PHASE 1 — documentation & ossature (**en cours**)

### Livrables

- [x] `README.md` remplacé (bandeau légal, statut, stack, emprise, modes).
- [x] [`docs/SPEC.md`](SPEC.md) (sections 1-6 + périmètre PHASE 1).
- [x] [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (structure monorepo + Freebuff limits + contrats).
- [x] [`docs/PHASE_PLAN.md`](PHASE_PLAN.md) (le présent document).
- [x] [`docs/SOURCES.md`](SOURCES.md) (catalogue avec statut par source).
- [ ] `bun tsc -b --noEmit` vert (sanity check : aucune régression côté frontend existant).

### Hors périmètre (strict)

- aucune donnée ingérée depuis une source externe ;
- aucun modèle entraîné ou exécuté ;
- aucune dépendance Python ajoutée ;
- **aucune suppression du template Convex** (la migration est planifiée en PHASE 2) ;
- aucune modification de `package.json`, `vite.config.ts`, `src/main.tsx`, `index.html`
  ou du dossier `convex/`.

### Critères de sortie

- [x] Toutes les contraintes §C-01..C-05 sont représentées dans la spec.
- [x] L'avertissement §3 figure au début du `README.md`.
- [x] Toutes les sources citées §5 ont au moins une entrée « statut » dans
      [`docs/SOURCES.md`](SOURCES.md).
- [x] Toutes les composantes CFFWIS §6.1 ont au moins une **définition** (signature +
      noms d'équations) dans [`docs/SPEC.md`](SPEC.md), même si l'implémentation n'est
      pas livrée.
- [ ] `bun tsc -b --noEmit` reste vert.

---

## PHASE 2 — socle backend Python + bascule Convex → FastAPI

### Périmètre

**Backend Python (squelette complet)**

- `backend/app/main.py` (FastAPI, healthcheck `/healthz`, exposition `/openapi.json`).
- `backend/app/settings.py` (Pydantic v2 Settings, validation env vars).
- `backend/app/db/` (modèles SQLAlchemy, configuration async, `alembic.ini`).
- `backend/app/cache/` (wrapper Redis async).
- `backend/app/scheduler/` (APScheduler configuré mais vide).
- `backend/app/sources/base.py` (interface commune + wrapper retry/timeout/cache).
- `backend/app/api/` (routeurs versionnés, scaffolds stubs).
- `backend/tests/` minimal (healthcheck, settings, interfaces stubs).
- `backend/Dockerfile` + `backend/pyproject.toml` (uv, ruff, mypy strict, pytest).
- `infra/docker-compose.yml` (postgres image `postgis/postgis:16-3.4` + extension
  TimescaleDB + redis + backend).
- `infra/.env.example` documentant les noms de variables (jamais de valeurs).
- `infra/Caddyfile` esquisse.

**Front : suppression Convex et bascule auth**

- Suppression (commits séparés, **réversibles**) de :
  - `ConvexAuthProvider` + `ConvexReactClient` dans `src/main.tsx` ;
  - `convex/_generated/` + `convex/*.ts` ;
  - hook `src/hooks/use-auth.ts` remplacé par `use-api-status.ts` ;
  - `convex-vendor` chunk retiré de `vite.config.ts` ;
  - `convex` et `@convex-dev/auth` retirés de `package.json`.
- Réécriture de `RequireAuth.tsx` → **no-op en PHASE 2** (pas d'auth requise pour lire
  la carte ; seules les actions d'admin / signalement requerront auth, conçue plus tard).
- Page `/carte` squelette :
  - **MapLibre GL JS** + tuiles OSM (Phaser 0 : IGN plus tard si clé obtenue) ;
  - composant `LegalBanner` (fixe, z-index max, non masquable) ;
  - `DataStatusBadge` global : « données indisponibles » tant que le backend n'est pas
    connecté à la preview.

### Critères de sortie

- `docker compose up` démarre la stack complète, `localhost:8000/healthz` répond OK ;
- `bun tsc -b --noEmit` vert après suppression de Convex ;
- la page `/carte` affiche tuiles OSM + bandeau légal + badge « données indisponibles » ;
- les tests `tests/api/test_healthz.py` et `tests/test_settings.py` passent.

---

## PHASE 3 — moteur scientifique CFFWIS (Van Wagner & Pickett 1985)

### Périmètre

- Implémentation des 6 composantes + DSR + (DSR → FWI affine) dans
  `backend/app/science/cffwis.py`, **pure / stateless** (pas d'effet de bord).
- Recursive state initialisé depuis ≥ 60 jours ERA5 (PHASE 3 = fixtures, ingestion
  réelle en PHASE 4).
- Endpoint `GET /api/v1/fwi/current` (entrée : bbox + modèle météo).
- Endpoint `GET /api/v1/fwi/series` (entrée : `cell_id`).
- Tests sur **cas publiés Van Wagner 1985** (annexes des publications originales).
- Classes EFFIS étiquetées côté frontend (`<Badge>` shadcn `very_low` → `extreme`).

### Critères de sortie

- Tests `tests/science/test_cffwis.py` verts (FFMC ± 0.01, DMC ± 0.01, etc.) ;
- endpoint OpenAPI validé sur 3 cellules-jour ;
- légende danger EFFECT affichée sans substitution en cas de `status: unavailable`.

---

## PHASE 4 — sources réelles (NASA FIRMS + Open-Meteo forecast)

### Périmètre

- `backend/app/sources/firms.py` : types stricts Pydantic v2, retry exponentiel (3
  tentatives, backoff 1s/3s/9s), timeout 30 s, rate limit, cache Redis.
- `backend/app/sources/open_meteo.py` : modèles paramétrables, multi-coordonnées.
- Migrations **Alembic** : tables `firms_hotspots`, `weather_grid`, `weather_series`
  (hypertables TimescaleDB).
- APScheduler : FIRMS toutes les 30 min, Open-Meteo toutes les heures.
- Endpoints `/api/v1/hotspots`, `/api/v1/weather/current`, `/api/v1/weather/forecast`.
- UI : badge d'état par source, toggle afficher/masquer chaque couche, indicateur
  `fetched_at` + latence.
- **Validation mode dégradé** : test d'intégration coupant FIRMS (mock HTTP 503) ;
  l'UI bascule en `status: unavailable` en < 5 s sans crash.

### Critères de sortie

- 24 h continues d'ingestion sans crash ;
- tests `tests/sources/test_firms.py`, `tests/sources/test_open_meteo.py` verts contre
  cassettes VCR-like (jamais d'appel direct pendant les tests) ;
- mode dégradé validé ;
- avertissement légal visible en permanence, **non masquable** (test automatisé).

---

## PHASE 5 — Copernicus Data Space + IGN + OSM

### Périmètre

- `backend/app/sources/copernicus.py` : Sentinel-2 (NDVI/NDMI/NBR), Sentinel-3 (LST).
- `backend/app/sources/ign.py` : BD Forêt® V2, RGE ALTI® (key IGN obtenue par l'opérateur).
- `backend/app/sources/osm_overpass.py` + cache local mensuel.
- Tables `vegetation_static`, `topography_static`, `osm_features`.
- Endpoints `/api/v1/vegetation`, `/api/v1/topography`, `/api/v1/proximity`.

### Critères de sortie

- Données statiques persistées et requêtables ;
- tests d'intégration contre fixtures STAC (Earth Search Copernicus) ;
- UI : indicateurs végétation/pente/exposition par cellule ;
- Sentinel-1 GRD activable derrière feature flag (optionnel).

---

## PHASE 6 — coefficient Gironde + Rothermel + score final

### Périmètre

- `backend/app/science/gironde_factor.py` : 8 facteurs §6.3, pondérations chargées
  depuis `backend/app/science/coefficients.yaml` (**éditable**, jamais en dur).
- `backend/app/science/rothermel.py` : ROS, longueur de flamme Byram, ellipse Van
  Wagner / Alexander, cône 1 h / 3 h / 6 h / 12 h avec **vent prévu**, pas vent figé.
- `backend/app/science/risk.py` : `risque = f(FWI_norm, coef_local, ROS, humain)` ;
  sortie structurée incluant **décomposition des contributions**.
- Endpoint `GET /api/v1/risk/cells` : score 0-100 + décomposition + qualité de donnée.
- UI : panneau d'info au clic sur une cellule, contributions visibles.

### Critères de sortie

- Score 0-100 strictement borné ;
- **Aucune valeur de probabilité** affichée (cf. §6.4) ;
- décomposition visible au clic (`xᵢ = 12, poids = 0.18`) ;
- indicateur de qualité (sources actives, latence, dernière MAJ) ;
- tests `tests/science/test_gironde_factor.py`, `tests/science/test_rothermel.py`,
  `tests/science/test_risk.py` verts.

---

## PHASE 7 — composante ML (optionnelle après PHASE 6)

### Périmètre

- Ingestion ERA5 long terme (≥ 20 ans de données météo + incendies validés SDIS 33).
- Modèle de calibration du coefficient Gironde basé sur observations passées vérifiées.
- Modèle de prévision court-terme (24 h) du score 0-100 avec intervalles de confiance.
- Modèle XGBoost / LightGBM ONNX-compatible, exécutable en local (cf. §C-02).

### Condition d'entrée

Disposer d'un **jeu de données validé** et signé « utilisable ML » par l'équipe
(SDIS 33 ou équivalent). Sans ce jeu, **PHASE 7 ne démarre pas** (cf. §C-02 :
« tout calcul doit être reproductible en local avec des modèles open source »).

---

## Dépendances inter-phases

```
PHASE 1 ─► PHASE 2 ─► PHASE 3 ─► PHASE 4 ─► PHASE 5 ─► PHASE 6 ─► PHASE 7
  docs     backend    CFFWIS     sources    copernicus coef local   ML
           scaffold   tests      réelles    IGN/OSM    Rothermel
           bascule                                          score final
           Convex
```

PHASE 3 peut démarrer **en parallèle de PHASE 2** : le moteur scientifique ne dépend
ni du HTTP ni de Postgres tant qu'on manipule des fixtures. Le code reste rangé sous
`backend/app/science/` mais les tests peuvent tourner sur des entrées statiques.

---

## Hors-phasage (à arbitrer)

| Sujet | Statut | Décision attendue |
| --- | --- | --- |
| Licence définitive | AGPL-3.0 proposé | Avant PHASE 2 |
| Authentification | Pas requise pour la consultation ; admin/rapportage à concevoir | Avant PHASE 6 |
| Mode multi-utilisateurs / rapports citoyens | « Signalement non-incendie » ? | Avant PHASE 6 |
| Notifications push | Pas de backend Firebase / APNs compatible §C-01 | PHASE 6+ si retenu |
