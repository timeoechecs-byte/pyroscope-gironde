# Architecture PyroScope 33

Ce document accompagne [`docs/SPEC.md`](SPEC.md) et décrit la **structure cible** du projet
PyroScope 33. L'état courant du dépôt reprend le template Freebuff (React + Vite + Convex +
VlyToolbar) ; la **migration** du template vers la cible est planifiée en
[`docs/PHASE_PLAN.md`](PHASE_PLAN.md) PHASE 2.

PHASE 1 ne touche que la documentation. Aucun fichier runtime n'est modifié.

---

## 1. Vue d'ensemble cible

```
.
├── backend/                # Python 3.12 + FastAPI (NON exécuté dans la preview Freebuff)
│   ├── app/
│   │   ├── api/            # routes FastAPI (endpoints REST, OpenAPI 3.1)
│   │   ├── sources/        # connecteurs NASA FIRMS, Open-Meteo, Copernicus, IGN, OSM…
│   │   ├── science/        # CFFWIS, Rothermel, coefficient Gironde, score final
│   │   ├── db/             # modèles SQLAlchemy + migrations Alembic sur PG/PostGIS+TimescaleDB
│   │   ├── cache/          # wrappers Redis (cache + rate limiting)
│   │   ├── scheduler/      # APScheduler (ingestion périodique des sources)
│   │   ├── settings.py     # Pydantic Settings (env vars, .env.example)
│   │   └── main.py         # FastAPI app, healthcheck /healthz, OpenAPI exposé
│   ├── tests/              # pytest, dont cas de référence Van Wagner & Pickett 1985
│   ├── pyproject.toml      # ruff, mypy strict, pytest config
│   ├── Dockerfile
│   └── README.md
├── frontend/               # React 19 + TS strict + Vite + shadcn/ui
│   │                        # (= contenu actuel de src/ lors de la bascule PHASE 2)
│   ├── src/
│   │   ├── pages/          # Landing, MapPage, Auth (optionnel), Dashboard (optionnel)
│   │   ├── components/     # LegalBanner (fixe, non masquable), MapView, LayerToggles, DataStatusBadge…
│   │   ├── hooks/          # useApiQuery (typed), useBackendHealth, useDegradedMode…
│   │   ├── lib/            # client API typé (généré depuis OpenAPI), utils
│   │   ├── stores/         # état global léger (zustand ou context seul)
│   │   └── main.tsx
│   ├── public/
│   └── vite.config.ts
├── infra/
│   ├── docker-compose.yml        # postgres + postgis + timescaledb + redis + backend
│   ├── docker-compose.dev.yml    # variante dev avec hot-reload
│   ├── Caddyfile                 # reverse-proxy production (HTTPS + headers sécurité)
│   └── README.md
├── docs/                   # la documentation (SPEC, ARCHITECTURE, PHASE_PLAN, SOURCES)
│   ├── SPEC.md
│   ├── ARCHITECTURE.md     # le présent document
│   ├── PHASE_PLAN.md
│   └── SOURCES.md
├── README.md               # bandeau légal + statut PHASE
├── LICENSE                 # AGPL-3.0 (à confirmer)
├── package.json
├── tsconfig.json
└── pyproject.toml          # éventuel, outils communs (ruff, mypy)
```

**Note Freebuff** : la racine du dépôt contient aujourd'hui `src/`, `convex/`, `index.html`,
`package.json`. Le dossier `frontend/` de la cible **absorbera** le contenu actuel de `src/`
au début de la **PHASE 2**. La migration Convex → FastAPI/Postgres est découpée en commits
atomiques, documentés dans `docs/PHASE_PLAN.md`.

---

## 2. Backend Python (`backend/`)

### Pourquoi FastAPI + Pydantic v2

- **Typed-first** : les modèles Pydantic v2 sont sérialisables en JSON Schema, partagés
  avec le frontend via OpenAPI généré.
- Asynchrone via `uvicorn` : un seul worker suffit pour la charge Gironde.
- Écosystème géospatial mature côté Python (`shapely`, `pyproj`, `geopandas`,
  `rasterio`, `xarray`) — pas de dépendance native exotique côté base.

### Pourquoi PostgreSQL 16 + PostGIS + TimescaleDB

- **PostgreSQL 16** : base relationnelle standard, mature, sauvegardable avec `pg_dump`.
- **PostGIS** : calculs géospatiaux en SQL (`ST_Intersects`, `ST_Distance`, index GiST).
  Indispensable pour : distance à la route la plus proche, au camping le plus proche,
  intersection avec BD Forêt, etc.
- **TimescaleDB** : hypertables pour les séries temporelles (points chauds FIRMS,
  observations météo, séries CFFWIS, séries Rothermel). Compression native et rétention
  configurable (ex. downsampling après 90 jours).

### Pourquoi APScheduler (pas Celery) en phase initiale

- Pas de broker externe à gérer.
- Suffisant pour :
  - FIRMS toutes les 30 minutes,
  - Open-Meteo toutes les heures,
  - Sentinel-2 quotidien,
  - NDVI hebdomadaire.
- Migration vers **Celery + Redis broker + workers séparés** envisageable si la charge
  dépasse un seul nœud (PHASE 5+).

### Pourquoi Redis

- Cache des appels FIRMS / Open-Meteo (économie de quota API).
- Compteurs de rate limit par source.
- Plus tard : broker Celery (optionnel).

### Mode dégradé backend

Toute erreur d'un connecteur est capturée par le wrapper commun
`backend/app/sources/base.py` et renvoie un payload structuré :

```json
{
  "data": null,
  "error": "firms_unreachable",
  "message": "NASA FIRMS API non joignable (HTTP 503)",
  "fetched_at": "2025-07-27T12:00:00Z",
  "next_retry_at": "2025-07-27T12:05:00Z"
}
```

Le frontend distingue cet état via un **discriminated union** (`status`:
`loading | fresh | stale | unavailable`) et affiche un panneau « donnée indisponible »
plutôt que de fabriquer un substitut (cf. §3).

---

## 3. Frontend React (`frontend/`)

### Pourquoi MapLibre GL JS (pas Mapbox, pas Google)

- **Libre** (BSD-3), fork open source de Mapbox SDK v1.x sans télémétrie.
- Compatible avec :
  - tuiles **raster OpenStreetMap** (ODbL) ;
  - tuiles **WMTS IGN Géoplateforme** (licence ouverte, gratuit avec clé d'inscription).
- Style éditable en JSON (`/style.json`) via Maputnik.

### Pourquoi React 19 + TS strict + Vite

- Compatible avec la prévisualisation Freebuff (le template fournit déjà React 19,
  Vite 7, alias `@/`).
- TS strict : le frontend importe des schémas **Zod générés depuis OpenAPI** et
  reçoit des erreurs typées — pas de `any`, pas d'inférence paresseuse.
- Vite : dev server rapide, intégré nativement par Freebuff.

### Pourquoi shadcn/ui + Tailwind v4

- Déjà présents dans le template, zéro coût d'adoption.
- Système de tokens cohérent pour les légendes de danger (très faible → extrême), à
  porter dans `src/index.css` au début de PHASE 2.

### Mode dégradé frontend

L'API client expose un statut discriminé par hook :

```ts
type QueryStatus =
  | { status: "loading" }
  | { status: "fresh"; data: T; fetched_at: string }
  | { status: "stale"; data: T; fetched_at: string; age_s: number }
  | { status: "unavailable"; reason: string; fetched_at?: string };
```

Exemple d'usage dans un panneau :

```tsx
const hotspots = useFirmsHotspots();

switch (hotspots.status) {
  case "loading":      return <Spinner />;
  case "unavailable":  return <DataUnavailable source="NASA FIRMS" reason={hotspots.reason} />;
  case "stale":        return <HotspotMap data={hotspots.data} staleSince={hotspots.age_s} />;
  case "fresh":        return <HotspotMap data={hotspots.data} />;
}
```

Chaque panneau dynamique de l'UI reçoit un badge explicite — les utilisateurs
comprennent d'où viennent les chiffres et pourquoi certaines couches n'apparaissent
pas.

---

## 4. Intégration à la prévisualisation Freebuff — pourquoi ça tient debout

Freebuff exécute le frontend **dans un environnement Node + navigateur**. Il **ne**
peut pas exécuter Python, PostgreSQL, PostGIS, TimescaleDB, Redis ni Docker. Cette
limite n'est pas détournée : elle est **assumée** comme mode dégradé officiel.

| Élément | Comportement attendu | État PHASE 1 |
| --- | --- | --- |
| `src/main.tsx` (Vite + React) | Inchangé, sert toujours le frontend. | Conservé tel quel. |
| Tuiles OSM / IGN via MapLibre (futures) | Servent en statique, fonctionnent sans backend. | Activables dès que la page `/carte` existera (PHASE 2). |
| Dossier `convex/` | Inert tant que `ConvexAuthProvider` n'est pas démonté. | Conservé en PHASE 1, démonté en PHASE 2. |
| VlyToolbar / VlyPlugin | Indépendant du backend. | Conservé tel quel. |
| Backend Python | **Pas exécutable** dans la preview. | Hors preview dès PHASE 1. |
| Postgres + PostGIS | **Pas exécutable** dans la preview. | Hors preview dès PHASE 1. |
| Ingestion FIRMS / Open-Meteo | Injoignable depuis la preview. | Hors preview dès PHASE 1. |

**Conséquence PHASE 1** : la page `/` documente la cible, affiche le bandeau légal
(`LegalBanner.tsx`), et toute page `/carte` affichera la carte OSM/IGN en mode
**« données indisponibles »** tant que le backend n'est pas connecté. Aucun pixel de
donnée n'est fabriqué : c'est la conformité §C-04 + §C-05.

---

## 5. Contrats API (frontend ↔ backend)

- Backend expose **OpenAPI 3.1** sur `/openapi.json`.
- À chaque `make openapi-client` (PHASE 2), un script Python génère des schémas
  **Zod** (puis TypeScript types) côté frontend.
- Le frontend n'**invente jamais** de payload : si une route échoue, le hook
  `useApiQuery` retourne `status: "unavailable"` documenté §3.

Liste initiale des routes (esquisse — PHASE 2+) :

| Méthode | URL | Description |
| --- | --- | --- |
| `GET` | `/healthz` | Healthcheck du backend (latence Redis, Postgres OK, version). |
| `GET` | `/api/v1/hotspots` | Points chauds NASA FIRMS sur l'emprise, fenêtre glissante configurable. |
| `GET` | `/api/v1/weather/current` | Météo courante interpolée sur la grille. |
| `GET` | `/api/v1/weather/forecast` | Prévisions multi-modèles sur fenêtre allant jusqu'à 7 jours. |
| `GET` | `/api/v1/fwi/current` | FWI par cellule (EFFIS ou recalculé). |
| `GET` | `/api/v1/fwi/series` | Séries temporelles FWI par cellule (entrée : `cell_id`). |
| `GET` | `/api/v1/risk/cells` | Score 0-100 par cellule + décomposition contributions + qualité donnée. |
| `GET` | `/api/v1/risk/series` | Séries temporelles du risque. |
| `GET` | `/api/v1/prefectoral` | Lecture seule des arrêtés préfectoraux (table manuelle). |

---

## 6. Configuration

### Constantes géométriques (trois bboxes, cf. SPEC §1)

| Constante | Calcul | Usage |
| --- | --- | --- |
| `BBOX_DEPARTEMENT` | constante | (-1.35, 44.15, 0.35, 45.60) — affichage, attribution |
| `BBOX_CALCUL` | `BBOX_DEPARTEMENT.expand(20_km)` | calculs scientifiques (FWI, Rothermel, GIRONDE_FACTOR) |
| `BBOX_INGESTION` | `BBOX_DEPARTEMENT.expand(45_km)` | requêtes FIRMS, Open-Meteo, Copernicus |

Les trois bboxes sont dérivées à la construction de l'app via
`backend/app/geo/bbox.py` (`pyproj.Geod` pour la distance métrique). Aucune n'est
codée en dur dans la logique métier.

### Convention de bbox par service

Chaque provider attend un **ordre différent** des bornes de la bbox. C'est une source
classique de bug d'intégration : trois conventions cohabitent dans ce projet.

| Service | Ordre attendu | Format effectif |
| --- | --- | --- |
| NASA FIRMS | `ouest,sud,est,nord` | inline URL : `/api/area/csv/[MAP_KEY]/[SOURCE]/W,S,E,N/[jours]` |
| Copernicus CDS / CDSE Process API | `nord,ouest,sud,est` | param `area=[N,W,S,E]` |
| OpenStreetMap / Overpass | `sud,ouest,nord,est` | coords `(S,W,N,E)` dans la query |
| IGN Géoplateforme (WFS) | `nord,sud,est,ouest` ou `minx,miny,maxx,maxy` selon la capacité | selon `GetCapabilities` |
| Open-Meteo | lat+lon en **params distincts** (pas de bbox) | `latitude=...&longitude=...` accepte plusieurs valeurs séparées par virgules |

Un utilitaire unique `backend/app/geo/bbox.py` expose

```python
def bbox_for(service: str) -> tuple[float, float, float, float]:
    """Retourne la bbox dans la convention exacte du service appelé."""
```

qu'aucune couche métier ne contourne. Cette fonction est testée contre chacun des
cinq providers dans `tests/geo/test_bbox.py` (round-trip vers la valeur attendue).

### Variables d'environnement — frontend

| Variable | Défaut | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000` | URL du backend FastAPI. |
| `VITE_MAP_STYLE_URL` | `/style.json` | Style MapLibre (tuiles OSM/IGN). |
| `VITE_ANALYTICS_DISABLED` | `true` | Aucune télémétrie externe par défaut. |

### Variables d'environnement — backend (`settings.py` Pydantic v2)

| Variable | Défaut | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://pyroscope:pyroscope@postgres:5432/pyroscope` | Postgres+PostGIS+TimescaleDB. |
| `REDIS_URL` | `redis://redis:6379/0` | Redis. |
| `FIRMS_MAP_KEY` | (vide) | **Clé FIRMS unique** (32 caractères hex) — sert à la fois la CSV API et le Map Server. Obtenue immédiatement par e-mail depuis https://firms.modaps.eosdis.nasa.gov/api/map_key. **Quota : 5 000 transactions / 10 min** (compteur réinitialisé). Au plan d'ingestion PHASE 1 (15 min × 4 capteurs) ≈ 16 transac/h, très loin du plafond. **FIRMS peut renvoyer une erreur HTTP 200 avec un texte brut** : valider le contenu, pas seulement le statut. |
| `OPEN_METEO_URL` | `https://api.open-meteo.com/v1` | Base URL Open-Meteo Forecast. **PHASE 1 = `meteofrance_arome_france_hd` seul.** Quotas : 10 000 / jour, 5 000 / heure, 600 / minute. Une requête sur > 10 variables ou plusieurs points compte pour plusieurs appels : **regrouper les 40-60 points de la grille en quelques requêtes multi-coordonnées**. |
| `OPEN_METEO_ARCHIVE_URL` | `https://archive-api.open-meteo.com/v1/archive` | Base URL Open-Meteo Historical (PHASE 2). **Source ERA5 par défaut** pour l'init CFFWIS. CDS en repli si variables manquantes. |
| `OPEN_METEO_AIR_URL` | `https://air-quality-api.open-meteo.com/v1` | Base URL Open-Meteo Air Quality (CAMS). |
| `CDSE_CLIENT_ID` | (vide) | Identifiant OAuth client Copernicus Data Space (PHASE 3). Issu de User Settings → OAuth clients du tableau de bord CDSE. |
| `CDSE_CLIENT_SECRET` | (vide) | Secret OAuth — **affiché une seule fois** à la création du client ; à stocker immédiatement. Si perdu, recréer un client. |
| `CDSE_TOKEN_URL` | `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token` | Endpoint token (grant `client_credentials`, refresh automatique, validité ≈ 1 h). |
| `CDSE_BASE_URL` | `https://sh.dataspace.copernicus.eu` | Endpoint **Sentinel Hub Process API** propre à CDSE (≠ services.sentinel-hub.com commercial). Statistical API pour NDMI/NDVI par polygone. |
| `CDSE_QUOTA_PU_LIMIT_MONTH` | (vide) | Limite mensuelle **Processing Units** CDSE, source de `external_api_quota_limit{source="copernicus"}`. Doc : documentation.dataspace.copernicus.eu/Quotas.html. |
| `OPENAQ_API_KEY` | (vide) | Clé OpenAQ via `https://explore.openaq.org/register`. **Auth = en-tête `X-API-Key`**, **pas** Bearer, **pas** param URL. PHASE 4 à valider (couverture Gironde à mesurer avant). |
| `ENABLE_BLITZORTUNG` | `false` | Feature flag foudre — **désactivé par défaut** (Blitzortung : pas d'API publique stable, conditions restrictives,rediffusion limitée). |
| `LOG_LEVEL` | `INFO` | Logging structuré JSON. |

Les secrets ne sont **jamais** commités : un `infra/.env.example` documente les noms.
Les valeurs sont gérées via `docker compose --env-file` côté production et via le
panneau **Keys / API keys** de Freebuff côté preview (cf. règle Freebuff : ne pas
éditer `.env`).

---

## 7. Tests

### Backend (`pytest`)

- `tests/science/test_cffwis.py` — validation des 6 composantes (FFMC, DMC, DC, ISI,
  BUI, FWI, DSR) contre des **cas publiés Van Wagner & Pickett 1985**.
- `tests/science/test_rothermel.py` — ROS, longueur de flamme Byram, sur cas
  Anderson 13.
- `tests/science/test_gironde_factor.py` — recomposition correcte du coefficient et
  respect des bornes [0,1].
- `tests/api/test_*.py` — contrat OpenAPI stable par endpoint.
- `tests/sources/test_*.py` — connecteurs avec `httpx_mock` et cassettes rejouées
  (VCR-like, jamais en accès direct).

### Frontend (`vitest` + Testing Library)

- `MapView.test.tsx` — rendu en mode dégradé.
- `LegalBanner.test.tsx` — présence, non masquable.
- `useApiQuery.test.tsx` — gestion des 4 statuts (`loading | fresh | stale | unavailable`).
- `Landing.test.tsx` — bandeau et CTA visibles.

---

## 8. Qualité

| Outil | Cible | Commande |
| --- | --- | --- |
| ruff | format + lint Python | `ruff check .` / `ruff format .` |
| mypy strict | typage Python | `mypy backend/app` |
| eslint | lint TypeScript | `eslint .` |
| tsc | types TypeScript | `tsc -b --noEmit` |
| pytest | tests Python | `pytest -q` |
| vitest | tests TypeScript | `vitest run` |

L'environnement Freebuff fournit `tsc -b --noEmit` via Bun. Le reste de la CI est
libre (GitHub Actions envisageable hors preview).

### Métriques Prometheus — noyau non négociable

Cinq métriques exposed par `/metrics` sont imposées par la spec, **instanciées dès
PHASE 0** (à zéro) et **renseignées dès que la source existe** :

| Nom | Labels | Sens |
| --- | --- | --- |
| `data_age_seconds` | `source` | Âge de la donnée **la plus récente** ingérée. **C'est l'âge, pas l'heure du dernier appel** : si FIRMS a été appelé il y a 1 minute mais sa donnée date d'il y a 30 min, la métrique vaut 1800. |
| `ingestion_total` | `source`, `status` | Compteur succès/échec par connecteur (`status="success|error|timeout|..."`). |
| `external_api_duration_seconds` | `source` | Histogramme durée des appels sortants (P50/P95/P99). |
| `external_api_quota_used` | `source` | Compteur cumulatif des unités consommées du quota. |
| `external_api_quota_limit` | `source` | Quota total sur la fenêtre de référence (mensuel/selon API). |
| `fwi_recursion_gap_days` | `source` | Jours manquants dans la chaîne récursive CFFWIS. Toute valeur > 1 jour doit déclencher une alerte Prometheus et bloquer l'affichage de la classe FWI. **Métrique de détection de corruption silencieuse des indices.** |
| `grid_coverage_ratio` | `layer` | Part de cellules avec une donnée valide pour la couche donnée (0 à 1). |

**Pattern quota/rate-limit** instancié dès **PHASE 1** sur FIRMS et Open-Meteo (qui
ont un cap, fût-il élevé). Quand Copernicus CDSE arrive en PHASE 3, le même pattern
se branche sans nouveau code. **Découvrir le quota épuisé au moment où on commence à
le consommer est déjà trop tard.**

Métriques supplémentaires discutables : les sept ci-dessus sont non négociables.

---

## 9. Migrations

- **Base de données** : **Alembic** dans `backend/`, premier script en PHASE 2.
- **Schéma OpenAPI → frontend** : script Python `make openapi-client`.
- **Template → cible** : `docs/PHASE_PLAN.md` décrit l'ordre de démontage Convex et
  la migration vers monorepo. **Aucun changement structurel en PHASE 1.**
