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

---## PHASE 4 — Propagation et coefficient local

**Statut** : phase **en cours**. Spec figée, code moteur gelé tant que la
relecture des docs n'est pas validée par l'équipe-projet.

**Périmètre** (Scope B validé — [`docs/FBP_VS_ROTHERMEL.md`](FBP_VS_ROTHERMEL.md)) :

- **FBP primaire** (CFFWIS / Van Wagner 1987) : `cffdrs` Python ou réimplémentation
  testée contre `cffdrs::test_fbp_*`. Type par défaut C-6 *Conifer Plantation*,
  fallback C-7. ROS, intensité Byram, longueur de flamme, type de feu, transition
  surface/intermittent/cime.
- **Rothermel secondaire** : `pyrolog` ou réimplémentation testée contre
  BehavePlus / Andrews 2018 RMRS-GTR-371.
- **Bande d'incertitude inter-modèle** : `ROS_FBP / ROS_Roth` affichée en UI.
- **Cônes de propagation à 1 / 3 / 6 / 12 h** par cellule, **vent par échéance**,
  pas figé.
- **Coefficient local Gironde** — **14 facteurs** en 4 catégories, pondérations
  chargées depuis [``config/local_coefficient.yaml`](../config/local_coefficient.yaml)
  (éditable, valeurs expert, `confidence: high|medium|low`, **jamais de défaut
  implicite**).
- **Score de risque = deux scores séparés** : `ignition_risk` + `spread_risk`, cf.
  [`docs/RISK_SCORE.md`](RISK_SCORE.md).
- **Mode simulation** : l'utilisateur pose un point d'allumage fictif, visualise la
  progression cellule à cellule.

**Hors périmètre** : ML, entraînement supervisé.

**Critères d'entrée** :

- [ ] PHASE 3 terminée, végétation+terrain disponibles.
- [ ] Decisions documents validés : FBP_VS_ROTHERMEL.md, RISK_SCORE.md,
      config/local_coefficient.yaml.

**Critères de sortie** :

- [ ] `tests/science/test_local_coefficient.py` vert : somme des poids = 1.0,
      renormalisation si facteur manquant, **jamais de default implicite**,
      **aucun "confidence: X %" en sortie**.
- [ ] `tests/science/test_fbp.py` : cas de référence `cffdrs` rejoués avec
      tolérance 1e-4 ; C-6 par défaut + fallback C-7 vérifié.
- [ ] `tests/science/test_rothermel.py` : Rothermel-Scott&Burgan testé contre
      `pyrolog` ou BehavePlus 6-series.
- [ ] `GET /api/risk/cells` : deux scores `ignition_risk` et `spread_risk`
      toujours distincts ; décomposition présente ; qualité propagée ;
      `ros_dispersion_ratio` présent si Scope B actif.
- [ ] Mode simulation avec encart non masquable.
- [ ] **`docs/VALIDATION_2022.md`** rédigé : rétrospective Landiras + La Teste-de-Buch
      avec écarts documentés (sous-estimation explicite attendue — limites du
      domaine de validité du modèle).

---

## PHASE 5 — Machine learning (conditionnée)

**Statut (2026-07-27)** : **gate en cours**. [`docs/PHASE5_FEASIBILITY.md`](PHASE5_FEASIBILITY.md)
rédigé. Inventaire des labels effectué (BDIFF, FIRMS, Sarrau & Yagoub 2025, EFFIS,
Prométhée, GIP ATGeRi). **Décision** : **PURSUE conditionnel** — option A
(cellule-jour 1,5 km, FIRMS + Sarrau ∪ EFFIS polygones), sous trois conditions
bloquantes (cf. FEASIBILITY §8.2). **Aucun code ML tant que l'équipe n'a pas validé
le gate.**

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

## PHASE 6 — Mise en production, diffusion et résilience

**Statut** : phase définie. Code à écrire après PHASE 0–5 validées (et PHASE 5
soit close, soit documentée par `docs/PHASE5_OUTCOME.md`).

**Objectif** : rendre l'application utilisable par d'autres, de façon fiable,
**y compris le jour où elle compte** — c'est-à-dire précisément le jour où un
grand feu se déclare et où tout le monde s'y connecte en même temps.

### 6.1 Performance et mise en cache

- **Vector tiles (MVT)** pré-générées pour toutes les couches de grille, servies
  depuis un cache. Le GeoJSON à la volée sur 160 000 cellules ne tient pas la charge.
- Cache Redis par couche et par horizon, **invalidation pilotée par le pipeline
  d'ingestion**, pas par un TTL aveugle.
- Compression **Brotli**, en-têtes `Cache-Control` corrects, ETag sur les
  endpoints stables.
- **Budget de performance mesuré et tenu** : premier rendu utile < 2 s sur 4G
  moyenne ; interaction carte fluide sur téléphone de milieu de gamme d'il y a
  quatre ans. **Test sur vrai appareil modeste, pas sur le poste de développement.**
- **Test de charge** (`k6` ou `locust`) à **50× le trafic nominal**. Documenter
  le point de rupture, ne pas se contenter de « ça tient ».

### 6.2 Observabilité

Reprendre le noyau Prometheus déjà arrêté et compléter par :

- `data_age_seconds{source}`, `ingestion_total{source,status}`,
  `external_api_duration_seconds{source}`, `external_api_quota_used/limit{source}`,
  `fwi_recursion_gap_days{source}`, `grid_coverage_ratio{layer}` ;
- latence des endpoints par **quantile**, taux 5xx, occupation disque et base,
  âge du dernier calcul de risque.

**Alerting technique** (Alertmanager ou équivalent) : source silencieuse au-delà
de son délai attendu ; trou dans la récursion FWI ; quota externe > 80 % ;
disque > 85 %.

**Ces alertes sont pour l'exploitant. Elles n'ont rien à voir avec les alertes
utilisateur du §6.3.** Ne jamais mélanger les deux canaux.

### 6.3 Surveillance de zone par l'utilisateur

Un utilisateur enregistre une ou plusieurs zones et reçoit une notification
quand le niveau de danger y franchit un seuil.

**Contraintes non négociables** (déjà arbitrées) :

- **Jamais présentée comme un canal d'alerte de sécurité.** Formulation UI :
  *« notifications informatives, sans garantie de délivrance — pour l'alerte,
  18 / 112 et les canaux officiels »*.
- **Repli e-mail ou flux RSS** obligatoire (push web inégalement fiable, en
  particulier iOS qui exige une PWA installée sur l'écran d'accueil).
- **Anti-rebond** : pas de notification répétée pour un même franchissement,
  fenêtre de silence configurable.
- **Données personnelles réduites au strict minimum** : zone géographique +
  point de contact. Pas de compte si un jeton anonyme suffit.
- Politique de confidentialité rédigée ; purge automatique des inactifs.

### 6.4 PWA

Manifeste, service worker, installation sur écran d'accueil, **mode hors-ligne
affichant la dernière donnée reçue avec son âge bien visible**. Une carte
hors-ligne qui n'affiche pas clairement qu'elle est périmée est pire qu'un
écran d'erreur.

### 6.5 Export et API publique

- Export **GeoJSON**, **CSV**, **GeoPackage** par couche et par emprise.
- API publique documentée en **OpenAPI 3.1**, **limitation de débit**,
  **versionnement** (`/api/v1/`), **politique de dépréciation écrite**.
- **Attribution obligatoire** dans la doc et dans chaque export : NASA FIRMS,
  Copernicus, Open-Meteo (CC BY 4.0), IGN, contributeurs OpenStreetMap (ODbL).
- ⚠️ **Vérifier la compatibilité des licences avant toute rediffusion.** Tu peux
  publier tes propres calculs dérivés ; tu ne peux pas nécessairement
  rediffuser les données sources telles quelles, et les conditions non
  commerciales d'Open-Meteo se propagent. → `docs/LICENSING.md` à rédiger.

### 6.6 Accessibilité et ergonomie

- Contrastes **WCAG AA**, palettes lisibles en cas de daltonisme, valeurs
  numériques **toujours disponibles en complément de la couleur**.
- Navigation clavier complète, **libellés ARIA** sur les contrôles de carte.
- **Ne dépends jamais de la seule couleur** pour transmettre un niveau de
  danger — exigence à la fois d'accessibilité et de sécurité de l'information.
- Interface utilisable **en extérieur, en plein soleil** : contrastes élevés,
  cibles tactiles larges.

### 6.7 Hébergement, sauvegarde, coûts

- Déploiement reproductible : `docker compose` en production ou build d'images
  en CI. **Secrets injectés par l'environnement, jamais dans l'image**.
- Sauvegarde quotidienne PostgreSQL, **avec restauration testée**. Une
  sauvegarde non testée n'est pas une sauvegarde.
- Certificat TLS, reverse proxy, `fail2ban` ou équivalent.
- `docs/RUNBOOK.md` : procédure pas-à-pas pour source qui tombe, base qui
  sature, déploiement qui échoue.
- **Chiffre le coût réel** — VPS, stockage Sentinel, bande passante — et
  écris-le dans `docs/COSTS.md`. Un projet « gratuit » qui coûte 40 €/mois
  d'hébergement doit le savoir avant, pas après.

### 6.8 Mode crise — point le plus important de la phase

Le jour où un grand feu se déclare en Gironde, trois choses arrivent
simultanément : le trafic explose, les gens cherchent de l'information vitale,
et ton outil est le moins bien placé pour la leur donner.

**Mode crise activable manuellement** :

- **bandeau prioritaire** en haut de page renvoyant vers préfecture, SDIS 33,
  consignes officielles — **au-dessus** de toute donnée ;
- désactivation des fonctions coûteuses (simulation, animations longues) ;
- basculement possible vers une **page statique légère** si l'infra sature ;
- limitation de débit renforcée.

**Règle éditoriale permanente** : **ton outil ne commente jamais un incendie
en cours.** Il affiche des détections satellite horodatées, avec leur âge et
leurs limites. Il ne dit pas où va le feu, ne nomme pas de communes menacées,
ne relaie pas d'information non officielle. C'est la ligne qui sépare un outil
de visualisation d'une source d'information de crise — tu n'as ni le mandat,
ni les moyens de vérification, ni la responsabilité juridique de la seconde.

### 6.9 Posture réglementaire et institutionnelle

Publier une carte de risque incendie en France, dans un domaine où
**Météo-France diffuse déjà une information officielle** (Météo des Forêts) et
où la Sécurité civile est seule compétente pour l'alerte, demande une position
claire.

- **Différencier explicitement** ton indice de la vigilance officielle. Termes
  différents, échelle différente, mention permanente que la référence est
  Météo-France et la préfecture.
- **Ne jamais reprendre les codes couleur ni le vocabulaire de la vigilance
  officielle** — la confusion serait le vrai risque juridique et humain.
- Mentions légales complètes : éditeur, hébergeur, contact, absence de
  garantie, finalité pédagogique et informative.
- Conformité RGPD si collecte de contacts pour notifications.
- Procédure de retrait : que faire si la préfecture ou le SDIS te demande de
  modifier ou retirer quelque chose. Écris-la **à froid, pas dans l'urgence**.

**Fortement recommandé, non technique** : **contacte, avant toute diffusion
large**, le SDIS 33, la DFCI Aquitaine ou l'observatoire régional. Présente
l'outil, ses limites, ta démarche. C'est probablement l'action au meilleur
rapport valeur/effort de tout le projet.

### Critères d'acceptation — phase 6

- [ ] budget de performance mesuré et tenu sur appareil modeste réel ;
- [ ] test de charge à 50× le trafic nominal, point de rupture documenté ;
- [ ] alerting technique opérationnel, distinct des notifications utilisateur ;
- [ ] notifications utilisateur avec avertissement de non-garantie et repli ;
- [ ] PWA installable, hors-ligne affichant l'âge de la donnée ;
- [ ] API publique versionnée, documentée, limitée en débit ;
- [ ] `docs/LICENSING.md` clarifiant les droits de republication source par source ;
- [ ] accessibilité WCAG AA vérifiée par outil et à la main ;
- [ ] sauvegarde testée par une restauration réelle ;
- [ ] `docs/RUNBOOK.md` rédigé ;
- [ ] mode crise implémenté et testé ;
- [ ] mentions légales, RGPD, procédure de retrait en place.

---

## PHASE 7 — Pérennité, ouverture et extension

**Statut** : phase définie. Code à écrire après PHASE 6 validée.

**Objectif** : faire en sorte que le travail **survive à ta disponibilité**, et
qu'il soit **vérifiable par quelqu'un d'autre**. C'est la phase la moins
gratifiante et la plus déterminante pour la valeur à long terme.

### 7.1 Documentation scientifique et reproductibilité

- [`docs/METHODOLOGY.md`](METHODOLOGY.md) : la chaîne complète, de la donnée
  brute au score affiché, avec équations, sources, **liste explicite des
  hypothèses non validées** — table de correspondance des combustibles,
  relation NDMI → humidité du combustible vivant, poids du coefficient local.
- [`docs/LIMITATIONS.md`](LIMITATIONS.md) : ce que l'outil ne sait pas faire.
  Millésime BD Forêt, domaine de validité du modèle de propagation, absence
  de sautes de feu, absence de prise en compte des secours, latence des sources.
- **Notebooks de reproduction** pour chaque résultat clé (validation du
  CFFWIS, rétro-analyse 2022).
- Versionnement des données de référence et des configurations : on doit
  pouvoir reproduire à l'identique une carte produite six mois plus tôt.

### 7.2 Ouverture du code

- Choix de licence **conscient**. Permissive (MIT, Apache 2.0) maximise la
  réutilisation ; copyleft (AGPL) garantit que les améliorations restent
  ouvertes. **Cohérence** : l'usage non commercial d'Open-Meteo et les
  conditions de certaines sources contraignent ce que des tiers pourront
  faire de ton travail — dis-le dans le README.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, modèles d'issue.
- CI publique, **badges de couverture de tests honnêtes**.
- Versionnement sémantique, `CHANGELOG.md`.

### 7.3 Revue externe

Le projet a atteint un point où ton propre jugement ne suffit plus à le valider.

- Regard **scientifique** sur le moteur de risque : INRAE, laboratoires
  travaillant sur le comportement du feu, universitaires en géomatique.
- Regard **opérationnel** sur l'utilité et les risques de mauvaise
  interprétation : SDIS 33, DFCI.
- Regard **technique** sur le code, via l'ouverture du dépôt.

Intègre les retours dans [`docs/REVIEWS.md`](REVIEWS.md), y compris les
critiques que tu n'as pas suivies, avec la raison.

### 7.4 Extension géographique — si et seulement si le socle est solide

Le massif des Landes de Gascogne déborde largement la Gironde : les Landes
et le Lot-et-Garonne en font partie, et un feu ne s'arrête pas à une limite
départementale.

**Conditions préalables** :

- toutes les emprises et grilles **déjà paramétrables**, aucune constante
  géographique en dur ;
- coût en calcul et en stockage **mesuré** avant d'étendre ;
- la BD Forêt, le RGE ALTI et les données OSM sont départementaux : le
  pipeline d'ingestion doit **itérer sur une liste de départements**.

Extension naturelle et cohérente : **le massif landais entier** (33, 40, 47).
Au-delà, tu perds l'avantage qui fait la valeur du projet — la connaissance
fine d'un territoire spécifique — et tu deviens un EFFIS moins bon.

### 7.5 Plan de continuité

- Que se passe-t-il si tu arrêtes pendant six mois ? Le pipeline s'arrête-t-il
  proprement ou accumule-t-il silencieusement des données fausses ?
  **Implémente un arrêt propre** : au-delà d'un seuil de retard, l'application
  bascule en mode dégradé explicite plutôt que d'afficher des indices calculés
  sur des trous.
- Bandeau automatique « données non mises à jour depuis X jours » au-delà
  d'un seuil.
- Procédure de passation documentée, secrets confiés à au moins une autre
  personne si le projet a des utilisateurs.
- **Décision assumée et écrite** : le projet est-il un exercice personnel,
  ou prend-il des utilisateurs en charge ? Les deux sont des réponses valables
  — mais elles n'imposent pas les mêmes devoirs, et **ne pas trancher revient
  à choisir la seconde sans en assumer les obligations**.

### Critères d'acceptation — phase 7

- [ ] `METHODOLOGY.md` et `LIMITATIONS.md` rédigés, hypothèses non validées listées ;
- [ ] notebooks de reproduction fonctionnels ;
- [ ] licence choisie, contraintes de réutilisation documentées ;
- [ ] dépôt ouvert avec CI publique ;
- [ ] au moins un retour externe sollicité et consigné ;
- [ ] arrêt propre en cas d'interruption prolongée, testé ;
- [ ] statut du projet (personnel ou avec utilisateurs) explicitement tranché
      et écrit.

---

## Clôture de la feuille de route

> **La feuille de route s'arrête à la phase 7. Il n'y a pas de phase 8, et il
> n'y en aura pas.**
>
> Un projet personnel meurt rarement d'un manque d'idées — il meurt d'une liste
> de phases qui s'allonge plus vite qu'elle ne se vide. Tout ce qui viendra
> après la phase 7 relève d'un **backlog**, où les choses attendent qu'un besoin
> réel les réclame, pas d'un plan qui donne l'illusion d'un travail déjà cadré.

### Éléments en backlog (post-phase 7)

| Élément | Pourquoi pas une phase ? |
| --- | --- |
| Indices complémentaires (McArthur australien, indices méditerranéens) | Utiles seulement en comparaison, pas en production. |
| Assimilation d'observations locales (stations amateur, capteurs) | À déclencher sur demande d'un acteur opérationnel qualifié. |
| Modélisation de la dispersion des fumées (données CAMS) | Valeur ajoutée forte en cas de pollution aiguë, mais hors périmètre pédagogique actuel. |
| Couches IGN accessibilité forestière + dessertes DFCI | Probablement le meilleur candidat du lot ; à activer sur demande du SDIS 33 ou d'un utilisateur identifié. |
| Historique long des incendies au-delà de ce que la PHASE 5 aura permis | Dépend des résultats PHASE 5 et de partenariats à venir (BDIFF détaillé, SDIS 33). |

Catalogue complet et arbitrage : [`docs/BACKLOG.md`](BACKLOG.md).

### Éléments volontairement retirés — rappel permanent

> Un projet se définit autant par ce qu'il refuse de faire que par ce qu'il
> livre. Ce tableau doit rester affiché en permanence. Quand l'envie reviendra
> de rouvrir l'un de ces points, ce sera après avoir réfuté la raison de son
> retrait.

| Élément | Raison du retrait |
| --- | --- |
| **Webcams publiques + vision par ordinateur** | droits sur les flux, RGPD (personnes identifiables), précision de détection faible, rapport valeur/coût défavorable |
| **Blitzortung** (foudre) | pas d'API publique ouverte, conditions restrictives ; les variables orageuses d'Open-Meteo couvrent le besoin |
| **LLM dans le calcul du risque** | aucun rôle légitime ; usage limité à la reformulation optionnelle de résultats déjà calculés |
| **Rafraîchissement toutes les 5 minutes** (FIRMS) | les satellites polaires passent 4 à 8 fois par jour ; cadence sans objet et pénalisante vis-à-vis des APIs |
| **Grille FWI à 250 m** | fausse précision : le FWI dérive de variables météo à résolution kilométrique |
| **Probabilité affichée en pourcentage** | non calibrable sur les données disponibles, non récupérable dans un cadrage cas-témoins |
| **Horizons au-delà de 48 h** | au-delà, la résolution de la prévision ne soutient plus le calcul |

Catalogue détaillé : [`docs/BACKLOG.md`](BACKLOG.md) §3.

---

## Hors-phasage (figé)

| Sujet | Statut | Décision attendue |
| --- | --- | --- |
| Licence définitive | AGPL-3.0 proposé | À trancher avant finalisation du `LICENSE` (cf. PHASE 7 §7.2) |
| Authentification | Pas requise pour consultation ; admin/rapportage à concevoir | Avant toute fonction admin (PHASE 7 ou après) |
| Cams vidéo publiques + ML | **Hors périmètre v1** (cf. Clôture ci-dessus) | Réintroduction sur cas d'usage précis |
| Communication vers grand public | Notification PWA + RSS + email (cf. PHASE 6 §6.3) | PHASE 6 §6.3 |
