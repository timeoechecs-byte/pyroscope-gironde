# Plan de phasage PyroScope 33

Linéarisation du travail respectant [`docs/SPEC.md`](SPEC.md) §1-6, les contraintes
absolues §C-01..C-05 et l'avertissement légal §3.

**Règle absolue** : une phase à la fois. Chaque phase se termine par *application qui
démarre + tests verts + commit*. Aucune phase suivante n'est engagée sans accord
explicite. **Le numéro de phase compte moins que ses portes d'entrée / sortie.**

## Conventions

- Commits atomiques et regroupés par phase (jamais de mélange).
- La spec reste vraie **après** chaque phase ; toute déviation documentée dans
  [`docs/SPEC.md`](SPEC.md) §8.
- Aucune fabrication de données ; toute valeur « non disponible » est exposée comme
  telle dans l'UI (§C-05).
- Aucune dépendance payante ; chaque ajout `pyproject.toml` ou `package.json` est
  revu pour §C-01.
- Trois bboxes distinctes ([§1 du SPEC](SPEC.md#1-r%C3%B4le-et-contexte)) :
  `BBOX_DEPARTEMENT` (affichage), `BBOX_CALCUL` (scientifique),
  `BBOX_INGESTION` (ingestion large).
- Métriques Prometheus — **noyau non négociable** (cf. §10 des décisions) :
  - `data_age_seconds{source}` — âge de la donnée la plus récente, pas l'heure du dernier appel ;
  - `ingestion_total{source,status}` — succès/échec par connecteur ;
  - `external_api_duration_seconds{source}`, `external_api_quota_used{source}`, `external_api_quota_limit{source}` ;
  - `fwi_recursion_gap_days{source}` — jours manquants dans la chaîne récursive (alerte de corruption silencieuse des indices) ;
  - `grid_coverage_ratio{layer}` — part de cellules avec donnée valide.
  - **Pattern quota/rate-limit instancié dès PHASE 1** (FIRMS et Open-Meteo ont un cap).
    CDSE et Sentinel s'y branchent en PHASE 3 sans nouveau pattern. **Découvrir le quota
    épuisé au moment où on commence à le consommer = déjà trop tard.**

---

## Phase Pré-0 — Spécifications & décisions (déjà livrée, en cours d'intégration)

**Livrables** : `README.md` (bandeau légal + stack + plan), [`docs/SPEC.md`](SPEC.md),
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md), le présent `PHASE_PLAN.md`,
[`docs/SOURCES.md`](SOURCES.md).

**Hors périmètre** : aucun code applicatif, aucune dépendance ajoutée, aucune
modification du template Freebuff.

**Critères de sortie** :
- [x] Toutes les contraintes §C-01..C-05 représentées (avec reformulation §C-05.a à
      §C-05.d appliquée depuis la décision §8).
- [x] Avertissement légal §3 au début du `README.md`.
- [x] Toutes les sources §5 ont au moins une entrée de statut dans [`docs/SOURCES.md`](SOURCES.md).
- [x] Décisions §1-§10 intégrées dans la spec (notamment 3 bboxes, 5 métriques
      Prometheus core, condition PHASE 5 reformulée, webcams hors-périmètre v1,
      garde-fou PWA, fallback Open-Meteo).
- [ ] `bun tsc -b --noEmit` toujours vert (sanity check).

---

## PHASE 0 — Fondations

Squelette du dépôt, infrastructure Docker et outillage. Pas de données scientifiques
ni de calcul encore.

**Périmètre** :
- Monorepo `backend/`, `frontend/`, `infra/`, `docs/` à la racine.
- `docker-compose.yml` : services **api**, **worker**, **postgis+timescale**, **redis**, **front**.
- Configuration par variables d'environnement, `.env.example` (jamais de valeurs).
- Migrations **Alembic** (première révision vide ou une table ultra-simple d'audit).
- `GET /healthz` (FastAPI) — répond OK si DB et Redis répondent, retourne la version.
- **Scaffold `/metrics`** (Prometheus `prometheus_fastapi_instrumentator`) avec
  les 5 métriques core **déjà enregistrées à 0** (les compteurs existeront avant
  d'avoir du sens).
- Logging structuré JSON (`run_id`, `source_id`).
- CI GitHub Actions : ruff + mypy strict + pytest côté backend, eslint + tsc + vitest
  côté frontend.
- README avec bandeau d'avertissement légal.

**Hors périmètre** : aucun connecteur de source réelle, aucune ingestion.

**Critères d'entrée** :
- [ ] `Phase Pré-0` validée par l'équipe (README, SPEC, ARCHITECTURE, PHASE_PLAN, SOURCES intégrés).
- [ ] L'arborescence [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) §1 actée par l'équipe.

**Critères de sortie** :
- [ ] `docker compose up` démarre les 5 services ; `curl localhost:8000/healthz` répond
      `{"status":"ok"}`.
- [ ] `curl localhost:8000/metrics` expose les 5 métriques core à zéro.
- [ ] `ruff check` + `mypy strict` + `pytest` verts en CI sur skeleton vide.
- [ ] `eslint` + `tsc -b --noEmit` + `vitest` verts côté frontend.
- [ ] Le bandeau légal reste dans le README et dans le composant (créé ou stubbé).
- [ ] `tsc -b --noEmit` vert post-création.

---

## PHASE 1 — MVP visualisation

**Objectif** : un premier produit utilisable rapidement.

**Périmètre** :
- **Connecteur `sources/firms.py`** : NASA FIRMS (les 4 produits `VIIRS_SNPP_NRT`,
  `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT`). Récupération par bbox +
  fenêtre glissante. Champs canoniques (cf. SPEC §5.1). Retry exponentiel, timeout,
  rate limit, cache Redis.
- **Connecteur `sources/open_meteo.py`** : Open-Meteo Forecast API, **modèle `meteofrance_arome_france_hd` seul** pour cette phase. Variables horaire listées SPEC §5.2.
  Échantillonnage sur **BBOX_INGESTION** (~40-60 points), interpolation spatiale sur
  `BBOX_CALCUL` selon §C-05.a.
- **Ingestion planifiée** : **FIRMS toutes les 15 min** (`@apscheduler.cron_job('*/15')`)
  + **Open-Meteo toutes les heures**.
- **Migrations** : tables `firms_hotspots`, `weather_grid`, `weather_series`
  (TimescaleDB hypertable pour `weather_series`).
- **Endpoints** :
  - `GET /api/healthz`
  - `GET /api/hotspots?bbox=...&period_hours=24|48|168&min_confidence=...&min_frp=...`
  - `GET /api/weather/grid?bbox=...&variable=...`
  - `GET /api/weather/point?lon=...&lat=...&variable=...`
- Frontend :
  - Carte MapLibre centrée sur `BBOX_DEPARTEMENT`, fonds IGN/OSM selon disponibilité clé.
  - **Points chauds colorés par FRP + niveau de confiance**, popup détaillée au clic.
  - **Filtres** : période 24 h / 48 h / 7 j, confiance, seuil FRP, toggle visible/caché.
  - **Couche vent animée** (particules) et **isothermes de température** par interpolation §C-05.a.
  - **Bandeau légal** (composant `LegalBanner.tsx`, fixé, non masquable).
  - **Sélecteur clair/sombre** et **responsive mobile**.
  - **Mode dégradé** : toute source absente est signalée explicitement (badge, pas
    de valeur par défaut).

**Hors périmètre** : CFFWIS, Rothermel, coefficient Gironde, score final, ML.

**Critères d'entrée** :
- [ ] PHASE 0 terminée (CI verte, compose up OK).
- [ ] Comptes créés : **NASA Earthdata / FIRMS** (CSV + Map key), **aucun pour Open-Meteo**.

**Critères de sortie** :
- [ ] 24 h continues d'ingestion FIRMS sans crash. Idem Open-Meteo.
- [ ] Endpoints testés via `pytest` avec cassettes VCR (jamais d'appel direct).
- [ ] `/metrics` rapporte `data_age_seconds{source="firms"}` et `...{source="open_meteo"}`,
      `ingestion_total{source=...,status="success|error"}`,
      `external_api_duration_seconds{source=...}`,
      `external_api_quota_used{source=...}` / `external_api_quota_limit{source=...}`
      (FIRMS et Open-Meteo remontent un quota même s'il est élevé).
- [ ] UI cartographie l'emprise `BBOX_DEPARTEMENT`, popup détaillée, filtres
      fonctionnels.
- [ ] Coupe-connectivité FIRMS → bascule en `status: unavailable` en < 5 s sans crash ; badge UI.
- [ ] Aucune valeur affichée sans horodatage réel (`data_age_seconds`).
- [ ] Bandeau légal visible sur toutes les routes, non masquable.

---

## PHASE 2 — Moteur FWI (CFFWIS complet)

**Périmètre** :
- Import de l'historique **ERA5** via Open-Meteo Historical : ≥ **60 jours** minimum,
  privilégiant ≥ 1 an pour stabilité des chaînes récursives.
- Implémentation complète du **CFFWIS** (FFMC, DMC, DC, ISI, BUI, FWI, DSR) avec
  équations **Van Wagner & Pickett (1985)** documentées dans le code.
- Persistance de l'état quotidien par cellule dans une hypertable TimescaleDB
  (`fwi_state`).
- **Endpoints** : `GET /api/fwi/current`, `GET /api/fwi/series?cell_id=...`.
- **Couche « FWI par cellule »** sur la carte (classe EFFIS très faible → extrême).
- **Courbe d'évolution des indices sur 30 jours** pour la cellule sélectionnée
  (clic sur une cellule → composant `FWICurve.tsx`).
- Tests unitaires sur **cas publiés Van Wagner 1985** (cf. `tests/science/test_cffwis.py`).
- Métrique **`fwi_recursion_gap_days{source}`** instanciée : tout trou > 1 jour dans
  la chaîne récursive doit déclencher une alerte Prometheus avant l'affichage.

**Hors périmètre** : coefficient local Gironde, score final, ML.

**Critères d'entrée** :
- [ ] PHASE 1 terminée, ingestion stable.
- [ ] Historique ERA5 chargé (job `seed_cffwis_history.py`).
- [ ] Cas publiés Van Wagner documentés (annexe dans `tests/science/reference_cases/`).

**Critères de sortie** :
- [ ] Tests `tests/science/test_cffwis.py` verts sur **cas publiés** (FFMC, DMC, DC,
      ISI, BUI, FWI, DSR avec tolérance ± 0.01).
- [ ] Endpoint validé sur ≥ 100 cellules-jour historiques.
- [ ] `/metrics` rapporte `fwi_recursion_gap_days{source="open_meteo"} = 0` sur les
      30 derniers jours ; alerte écrite en cas de gap > 1 j.
- [ ] UI affiche courbe FWI 30 j avec horodatages réels, classe EFFIS, sans interpolation
      temporelle (§C-05.b).

---

## PHASE 3 — Végétation et terrain

**Périmètre** :
- Ingestion **BD Forêt® V2** (essences), **RGE ALTI®** ou Copernicus DEM GLO-30 en
  secours (cf. décision §4.3) — préférence pour **RGE ALTI® 5 m** sur Copernicus DEM
  30 m quand la volumétrie tient.
- **CORINE Land Cover**, via Copernicus LMS ou WMS public.
- Calcul **NDVI / NDMI** Sentinel-2 L2A avec **masque nuages** explicite ; valeur
  par cellule sur la grille de calcul. CDN CDSE rate-limit instrumenté dès que la
  première requête est faite.
- Attribution d'un **modèle de combustible** par cellule (Anderson 13 ou Scott & Burgan 40).
- Couches cartographiques : **essences**, **stress hydrique** (NDMI/NDVI vs médiane
  saisonnière), **pente/exposition**.
- Mode dégradé Sentinel-2 : couverture nuageuse > seuil → « NDVI indisponible — couverture nuages X % ».

**Hors périmètre** : propagation (Rothermel), ML, coefficient Gironde.

**Critères d'entrée** :
- [ ] PHASE 2 terminée, FWI stable, historique chargé.
- [ ] Compte **CDSE** créé (cf. SPEC §2 comptes), token CDSE généré.

**Critères de sortie** :
- [ ] `copernicus_bytes_downloaded_total` (Prometheus) instrumenté et conforme au
      quota gratuit CDSE.
- [ ] Couches végétation/essences/pente affichées et cliquables.
- [ ] Mode dégradé Sentinel-2 validé (test manuel).

---

## PHASE 4 — Propagation et coefficient local

**Périmètre** :
- Modèle de **Rothermel (1972)** : ROS, longueur de flamme **Byram**, ellipse
  **Van Wagner/Alexander**.
- **Cônes de propagation à 1 / 3 / 6 / 12 heures** par cellule, calculés sur la
  prévision de vent correspondante (jamais sur vent figé).
- Coefficient de danger local Gironde — **8 facteurs** avec pondérations chargées
  depuis `backend/app/science/coefficients.yaml` (éditable, pas en dur).
- **Score de risque final** sur **échelle 0-100 + classe EFFIS**, sortie structurée
  avec **décomposition des contributions** (facteur × poids) et **indicateur de
  qualité de donnée**.
- **Mode simulation** : l'utilisateur pose un point de départ fictif sur la carte et
  visualise le cône correspondant sans prétendre à un incendie réel.

**Hors périmètre** : ML, entraînement supervisé.

**Critères d'entrée** :
- [ ] PHASE 3 terminée, végétation+terrain disponibles.
- [ ] `coefficients.yaml` initialisé et revu.

**Critères de sortie** :
- [ ] Tests `tests/science/test_rothermel.py` et `test_gironde_factor.py` verts sur
      cas publiés.
- [ ] `GET /api/risk/cells` : score borné [0, 100], décomposition présente, qualité
      présente.
- [ ] Mode simulation joue sans warning ; aucune valeur sortie n'est appelée
      « probabilité ».
- [ ] **Aucune formule « confiance : X % »** n'apparaît dans l'UI. L'incertitude est
      rendue via intervalle ou dispersion inter-modèles.

---

## PHASE 5 — Machine learning (conditionnée)

**Condition d'entrée impérative** (porte bloquante — décision §5 reformulée) :

> La PHASE 5 **ne démarre pas** sans (a) un jeu d'allumages **géolocalisé** à une
> résolution compatible avec la grille de calcul ; (b) une **stratégie d'échantillonnage
> négatif** documentée ; (c) une **validation temporelle par blocs** battant le
> baseline FWI. **L'échec de l'un des trois annule la phase.**

La provenance du dataset (BDIFF hébergée par l'IGN, partenariat SDIS 33, autre) est
indifférente. Limites connues :

- La **BDIFF** centralise les informations sur les feux de forêt en France (causes,
  surfaces brûlées), alimentée par SDIS / DDT(M) / ONF / DRAAF, **agrégée à la
  commune** — trop grossier pour cellules de 1,5 km ou 250 m. La consultation
  détaillée peut affiner ; **à vérifier avant de s'engager.**
- **L'année en cours n'est pas diffusée** sur BDIFF.

Baseline :

- **Aucune approche ML n'est conservée si elle ne bat pas** un baseline = **FWI seul**
  en validation temporelle par blocs.

**Périmètre (sous condition)** :
- Constitution du dataset (jointure ERA5 / FIRMS / BD Forêt / vérité-terrain).
- Baseline FWI seul.
- Modèles : XGBoost / LightGBM / CatBoost, **validation par blocs temporels et
  spatiaux** (jamais de split aléatoire — fuite d'information du futur).
- **Calibration Platt / isotonique** des probabilités (processus **interne**, jamais
  affiché à l'utilisateur final — voir §6.4).
- **SHAP** pour l'explicabilité, rendu directement dans l'UI.
- Métriques honnêtes : **AUC-PR** (pas AUC-ROC seule, classe déséquilibrée),
  **Brier score**, **courbe de calibration**.
- **Ensemble** par moyenne pondérée sur la performance en validation ; **intervalles
  de confiance** issus de la dispersion entre modèles.

**Critères de sortie (sous condition)** :
- [ ] Baseline FWI seul documenté + battu.
- [ ] AUC-PR > baseline (test statistique sur folds temporels).
- [ ] Calibration : diagramme de fiabilité ≤ eps ; Brier score documenté.
- [ ] SHAP local visible dans le panneau « détail d'une cellule ».
- [ ] **Aucun chiffre « probabilité d'incendie : X % »** dans l'UI — seulement
      score 0-100 + intervalle.

---

## PHASE 6 — Optionnel

**Périmètre minimal** (objets utiles, à arbitrer au cas par cas) :

- **Alertes par cellule surveillée** : opt-out, valeur de score ≥ seuil configurable
  par l'utilisateur.
- **PWA + notifications push** : **avec garde-fou explicite** :
  - « Notifications **informatives**, sans garantie de délivrance — pour l'alerte,
    18 / 112 et les canaux officiels ».
  - iOS : web push fonctionnel uniquement pour PWA installée sur l'écran d'accueil ;
    couverture Apple limitée documentée.
  - **Repli** : email ou flux RSS explicitement proposés en plus du push, jamais
    comme alternative *« silencieuse »*.
- **Export GeoJSON / CSV** des couches affichées.
- **API publique documentée** (OpenAPI 3.1 publique, OAuth ou clé d'API limitée).
- **Vision par ordinateur (YOLO / RT-DETR) sur webcams publiques** :
  **HORS PÉRIMÈTRE v1**. Trois blocages rédhibitoires : droits sur le flux,
    RGPD (personnes identifiables sur des webcams publiques), précision de détection
    faible → surtout des faux positifs. **Ne sera réintroduit que sur cas d'usage
    précis et validation juridique explicite.**

**Critères d'entrée** : PHASES 0 à 4 (et condition PHASE 5 si retenue) terminées.

---

## Hors-phasage (figé)

| Sujet | Statut | Décision attendue |
| --- | --- | --- |
| Licence définitive | AGPL-3.0 proposé | Avant finalisation du `LICENSE` |
| Authentification | Pas requise pour consultation ; admin/rapportage à concevoir | Avant PHASE 6 admin |
| Cams vidéo publiques + ML | **Hors périmètre v1** | Réintroduction sur cas d'usage précis |
| Communication vers grand public | Notification PWA + RSS + email | Avant PHASE 6 |
