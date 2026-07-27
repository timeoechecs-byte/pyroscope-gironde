# Spécification PyroScope 33

Document normatif. Toute déviation doit être justifiée dans [`docs/PHASE_PLAN.md`](PHASE_PLAN.md)
et tracée dans ce fichier (section « Décisions de phase »).

---

## 1. Rôle et contexte

PyroScope 33 est une application web **open source** de suivi et d'évaluation du **risque
d'incendie de forêt** sur le département de la **Gironde (France)**.

Emprise géographique — **trois bboxes distinctes**, chacune avec un usage précis.

Une seule bbox polyvalente conduit à des artefacts : cônes de propagation tronqués au
bord, surcoût d'ingestion hors-périmètre, ou affichage incohérent entre la donnée
représentée et la donnée calculée. Trois bboxes sont donc imposées :

| Bbox | Usage | Marge / forme | Valeur typique (lon_min, lat_min, lon_max, lat_max) |
| --- | --- | --- | --- |
| `BBOX_DEPARTEMENT` | **Affichage, attribution, périmètre annoncé à l'utilisateur.** C'est la bbox visible sur la carte et mentionnée dans les mentions légales. | contour officiel du département de la Gironde | (-1.35, 44.15, 0.35, 45.60) |
| `BBOX_CALCUL` | **Calcul scientifique** : cônes Rothermel, interpolation météo sur la grille, FWI, coefficient Gironde, score final. **Inclut `BBOX_DEPARTEMENT` + ~20 km de marge** pour que les cônes 12 h et l'interpolation ne soient pas tronqués au bord. | `BBOX_DEPARTEMENT.expand(20_km)` | ≈ (-1.55, 43.97, 0.60, 45.78) |
| `BBOX_INGESTION` | **Ingestion des sources externes** (FIRMS, Open-Meteo, Copernicus). Marge large, surcoût marginal ; toute cellule hors-`BBOX_DEPARTEMENT` est simplement marquée « hors-périmètre » et masquée à l'affichage. | `BBOX_DEPARTEMENT.expand(45_km)` | ≈ (-1.70, 43.80, 0.95, 45.95) |

**Règles dérivées** :

- Les cellules de travail restent en `EPSG:2154 (Lambert-93)` avec **pas de 250 m**, et
  sont indexées sur `BBOX_CALCUL`.
- Toute valeur fournie au frontend qui sort de `BBOX_DEPARTEMENT` doit être étiquetée
  `hors_périmètre: true` ou être filtrée avant affichage utilisateur final.
- Étendre `BBOX_CALCUL.max_lon` à 0.80 ajouterait ~35 km de cellules à l'est
  (territoires de la Dordogne et du Lot-et-Garonne) sans bénéfice pour le risque
  Gironde — l'écart entre `BBOX_CALCUL.max_lon` (0.60) et `BBOX_INGESTION.max_lon`
  (0.95) reflète cette distinction entre calcul scientifique et ingestion-large.

Les trois bboxes sont définies comme constantes dans `backend/app/settings.py` et
exposées à l'API via `GET /api/sources` (couche « configuration »).

### Affichages attendus sur la carte interactive

- les points chauds satellite (feux actifs) en quasi temps réel ;
- le vent (vitesse, rafales, direction) et son évolution **animée** ;
- la température, l'humidité relative, les précipitations récentes ;
- un indice de danger météo (**FWI**) calculé par cellule ;
- un score de risque local combinant météo, végétation, sécheresse et facteurs humains.

---

## 2. Contraintes absolues (non négociables)

| ID | Contrainte |
| --- | --- |
| **C-01** | **Coût = 0 €.** Aucune API payante, aucun quota facturé, aucune clé de carte payante. Source avec compte gratuit acceptable ; source exigeant une carte bancaire → **écartée**. |
| **C-02** | **Aucune API de LLM propriétaire** dans le produit final. Tout modèle embarqué doit être open source et exécutable en local (scikit-learn, XGBoost, LightGBM, CatBoost, PyTorch). |
| **C-03** | **Auto-hébergeable.** `docker compose up` doit suffire à lancer toute la stack sur une machine unique. |
| **C-04** | **Mode dégradé obligatoire.** Si une source est indisponible, l'app continue avec les autres et **signale clairement la donnée manquante**. Jamais de crash, jamais de valeur inventée. |
| **C-05** | **Aucune donnée fabriquée.** Toute valeur affichée dans l'UI doit provenir d'une **mesure** ou d'un **calcul documenté**. Voir §C-05.a à §C-05.d ci-dessous. |

> ### Sous-règles C-05
>
> **§C-05.a — Interpolation spatiale** entre points d'une même série (météo, vent, FWI)
> est **autorisée**, à condition que :
> 1. La méthode soit documentée (couches concernées et fichier `coefficients.yaml`).
> 2. L'incertitude associée soit **calculée et exposée** dans l'UI (page « Sources » /
>    composant `DataStatusBadge`).
> 3. Aucune cellule hors de `BBOX_CALCUL` ne reçoive de donnée interpolée.
>
> **§C-05.b — Interpolation temporelle vers l'instantané** est **interdite**. Le FWI est
> un indice journalier calé à midi local ; les points chauds satellite sont des passages
> orbitaux discrets ; aucune valeur dérivée par lissage temporel ne doit être présentée
> comme « maintenant ». La donnée la plus récente est affichée avec son **horodatage
> réel** et son **âge**, sans lissage.
>
> **§C-05.c — Affichage « donnée indisponible »** : en cas d'absence de donnée pour une
> cellule ou un instant donné, l'UI affiche explicitement « donnée indisponible ». Aucune
> valeur par défaut, comblée ou interpolée silencieusement n'est tolérée.
>
> **§C-05.d — Données de démonstration / mockées** : interdites dans toute couche visible
> par l'utilisateur final, y compris en prévisualisation Freebuff.

---

## 3. Avertissement légal obligatoire

L'application affiche en permanence, **visible sans scroll**, un bandeau :

> ⚠️ **Outil expérimental à visée informative et pédagogique.** Les détections satellite
> sont des anomalies thermiques, pas des incendies confirmés. **Ne jamais utiliser pour
> une décision opérationnelle ou de sécurité.** En cas d'incendie : **18** / **112**.
> Sources officielles : **SDIS 33**, **Préfecture de la Gironde**, **Météo-France**
> (Météo des Forêts).

**Ce bandeau ne doit être ni masquable ni retirable.** Il figure dans :

- `README.md` (racine)
- la métadonnée `<meta name="description">` du `index.html`
- un composant React dédié `src/components/LegalBanner.tsx`, monté dans la racine du routeur,
  `z-index` maximal, sans toggle de fermeture
- toute route principale affichée à l'utilisateur

Toute PR qui supprime, masque ou affaiblit ce bandeau est **rejetée**.

---

## 4. Stack technique imposée

| Couche | Choix imposé |
| --- | --- |
| Backend | Python 3.12 · FastAPI · Pydantic v2 |
| Tâches planifiées | APScheduler (pas de Celery en phase 1) |
| Base de données | PostgreSQL 16 + PostGIS + TimescaleDB |
| Cache | Redis |
| Calcul géospatial | xarray · rasterio · geopandas · shapely · pyproj · numpy |
| ML | scikit-learn · XGBoost · LightGBM · CatBoost · PyTorch (phases tardives) |
| Frontend | React · TypeScript · Vite |
| Carto | MapLibre GL JS + fonds OpenStreetMap / IGN Géoplateforme (WMTS gratuit) |
| Graphiques | Recharts ou Observable Plot |
| Conteneurisation | Docker + docker compose |
| Tests | pytest (backend) · vitest (frontend) |
| Qualité | ruff · mypy strict · eslint |

**Exclus** : Mapbox (payant au-delà d'un quota), Google Maps, toute API LLM propriétaire.

Détail d'organisation : [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
Découpage temporel : [`docs/PHASE_PLAN.md`](PHASE_PLAN.md).
Catalogue des sources : [`docs/SOURCES.md`](SOURCES.md).

---

## 5. Sources de données

### 5.1 Feux actifs

- **NASA FIRMS** (clé gratuite via `firms.modaps.eosdis.nasa.gov`) — produits :
  `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT`.
  Requête par bounding box + nombre de jours.
  **Champs conservés** : `latitude`, `longitude`, `acq_date`, `acq_time`, `satellite`,
  `confidence`, `frp`, `daynight`, `bright_ti4`, `bright_ti5`.
- **EFFIS / Copernicus EMS** — couches **WMS** (points chauds, surfaces brûlées, FWI
  européen) en overlay optionnel.

### 5.2 Météo et prévisions

- **Open-Meteo Forecast API** — gratuit, sans clé, **usage non commercial**.
  Paramètre `models=` exploité pour récupérer plusieurs modèles séparément et les
  comparer : `meteofrance_arome_france_hd` (~1,5 km), `meteofrance_arome_france`,
  `icon_d2`, `ecmwf_ifs025`, `gfs_seamless`.
  **Variables horaires** : `temperature_2m`, `relative_humidity_2m`, `dew_point_2m`,
  `precipitation`, `wind_speed_10m`, `wind_direction_10m`, `wind_gusts_10m`,
  `soil_moisture_0_to_7cm`, `soil_temperature_0_to_7cm`, `vapour_pressure_deficit`,
  `et0_fao_evapotranspiration`.
  Échantillonnage sur **grille régulière** couvrant la Gironde (~40 à 60 points,
  requêtes multi-coordonnées), puis interpolation locale en post-traitement.
- **Open-Meteo Historical / ERA5** — reconstitution de l'historique nécessaire à
  l'initialisation des indices de sécheresse et, plus tard, à l'entraînement ML.
- **Open-Meteo Air Quality (données CAMS)** — `pm2_5`, `pm10`, `aerosol_optical_depth`,
  `uv_index`, `dust`.

### 5.3 Satellite et végétation

- **Copernicus Data Space Ecosystem** (compte gratuit) :
  - **Sentinel-2 L2A** → NDVI, NDMI, NBR ;
  - **Sentinel-3 SLSTR** → température de surface et anomalies thermiques ;
  - **Sentinel-1 GRD** (radar, traverse les nuages) — optionnel.
- **Copernicus Land Monitoring Service** :
  - **CORINE Land Cover** ;
  - **High Resolution Layers arborées**.
- **IGN Géoplateforme** :
  - **BD Forêt® V2** (essences : pin maritime, feuillus, mixtes — donnée **capitale**
    en Gironde) ;
  - **BD ALTI® / RGE ALTI®** pour l'altitude, la pente et l'exposition.
  Accès WMS / WFS / téléchargement gratuit.

### 5.4 Contexte humain et topographie

- **OpenStreetMap / Overpass API** — routes, chemins, campings, aires de loisirs, zones
  bâties, lignes électriques, points d'eau. Requêtes Overpass mises en cache localement
  (données quasi statiques, rafraîchissement mensuel).
- **Copernicus DEM (GLO-30)** en secours si RGE ALTI® est trop lourd.

### 5.5 Optionnel, phase tardive uniquement (ne pas bloquer)

- **Foudre : Blitzortung** — accès soumis à conditions, pas d'API publique garantie.
  Implémentation derrière un flag désactivé par défaut.
- **Qualité de l'air locale : OpenAQ** — couverture inégale en Gironde, à valider avant
  intégration.
- **Arrêtés préfectoraux** — pas d'API publique. **Table administrable manuellement**,
  sans scraping automatique.

Catalogue détaillé et statut : [`docs/SOURCES.md`](SOURCES.md).

---

## 6. Moteur scientifique (cœur du produit)

Partie la plus importante et **entièrement déterministe, sans ML** à ce stade.
Implémentée dans `backend/app/science/`, avec tests unitaires sur **cas publiés**.

### 6.1 Canadian Forest Fire Weather Index System (CFFWIS)

Implémentation des six composantes selon les équations de **Van Wagner & Pickett (1985)**,
avec les corrections d'usage :

- **FFMC** — Fine Fuel Moisture Code. Entrées : T, HR, vent, pluie, valeur de la veille.
- **DMC** — Duff Moisture Code. Entrées : T, HR, pluie, longueur du jour (selon mois et latitude).
- **DC** — Drought Code. Entrées : T, pluie, facteur mensuel.
- **ISI** — Initial Spread Index. Entrées : FFMC + vent.
- **BUI** — Buildup Index. Entrées : DMC + DC.
- **FWI** — Fire Weather Index. Entrées : ISI + BUI.
  → puis **DSR** (Daily Severity Rating).

**Contraintes** :

- Les indices sont **récursifs** (dépendent de la veille). Initialisation avec **≥ 60 jours
  d'historique ERA5 / Open-Meteo** avant toute mise en production. État quotidien par
  cellule persisté dans **TimescaleDB**.
- Calcul officiel à partir des observations de **midi heure locale**. Valeur quotidienne
  de référence respectant cette convention ; valeurs infra-journalières explicitement
  étiquetées « FWI horaire, non normalisé ».
- **Classes de danger EFFIS** affichées : très faible / faible / modéré / élevé / très
  élevé / extrême.

### 6.2 Propagation potentielle (Rothermel)

Modèle de **Rothermel (1972)** pour la vitesse de propagation (**ROS**), avec :

- Modèles de combustible standards (**Anderson 13** ou **Scott & Burgan 40**) associés
  aux classes de la **BD Forêt V2** et de **CORINE Land Cover** ;
- Correction de pente ;
- Correction de vent ;
- **Longueur de flamme (Byram)** et intensité du front ;
- Direction du front dominée par le vent, **ellipse de propagation (Van Wagner / Alexander)**.

**Sortie** : pour chaque cellule, un **cône de propagation à 1 h, 3 h, 6 h et 12 h**,
calculé avec la **prévision de vent correspondante**, pas avec le vent courant figé.

### 6.3 Coefficient de danger local Gironde

Score **additif borné [0, 1]**, chaque facteur documenté et pondéré dans un fichier de
configuration **YAML éditable** (pas en dur dans le code) :

1. Nombre de jours consécutifs **sans pluie significative (> 1 mm)** sur 7 / 15 / 30 jours.
2. **Part de pin maritime et densité forestière** de la cellule (BD Forêt V2).
3. **NDMI / NDVI** et **écart à la médiane saisonnière** de la cellule (anomalie de
   stress hydrique).
4. **Humidité du sol** (Open-Meteo, couches 0-7 cm et 7-28 cm).
5. **Distance à la route la plus proche** et à la **zone fréquentée** la plus proche
   (camping, aire, parking).
6. **Densité de départs de feux historiques dans un rayon de 2 km**.
7. **Nombre de jours de canicule consécutifs** (T max > 35 °C).
8. **Pente et exposition**.

### 6.4 Score de risque final

```
risque = f(FWI_normalisé, coefficient_local, ROS_potentielle, facteur_humain)
```

**Exigences impératives** :

- Échelle **0-100** + classe qualitative, **jamais de probabilité** (« 96,8 % de chance »).
  Un pourcentage serait scientifiquement faux et dangereusement trompeur : aucun modèle
  calibré sur observations validées n'est disponible.
- **Décomposition des contributions** affichée au clic sur la cellule (facteur, poids,
  valeur).- **Indicateur de qualité de donnée** : quelles sources étaient disponibles, à quelle heure, avec quelle latence.
- **Aucune formulation de « confiance : X % »** n'est affichée à l'utilisateur — **jamais**. L'incertitude s'exprime par **dispersion inter-modèles** (PHASE 5+) ou par **intervalle**, jamais par un chiffre de confiance unique fabriqué. Cette interdiction pèse sur **toutes** les sorties (score final, FWI par cellule, probabilité sous-jacente d'un modèle calibré) : la calibration Platt/isotonique reste un processus **interne** au modèle ML, jamais exposé tel quel.

---

## 7. PHASE 1 — périmètre et critères de sortie

**Périmètre** (livré dans cette phase) :

1. Spécifications complètes (le présent document + `README.md` remplacé).
2. Architecture documentée ([`docs/ARCHITECTURE.md`](ARCHITECTURE.md)).
3. Plan de phasage ([`docs/PHASE_PLAN.md`](PHASE_PLAN.md)).
4. Catalogue des sources ([`docs/SOURCES.md`](SOURCES.md)).

**Hors périmètre PHASE 1** (strict) :

- aucune donnée ingérée depuis une source externe ;
- aucun modèle entraîné ou exécuté ;
- aucune dépendance Python ajoutée ;
- **aucune suppression du template Convex** (interdit tant que la décision finale n'est
  pas validée en PHASE 2) ;
- aucune modification de `package.json`, `vite.config.ts`, `src/main.tsx`, `index.html`
  ou du dossier `convex/`.

**Critères de sortie** (cochés en fin de phase) :

- [x] Toutes les contraintes C-01..C-05 sont représentées dans le document.
- [x] L'avertissement §3 figure au début du `README.md`.
- [x] Toutes les sources citées §5 ont au moins une entrée « statut » dans
      [`docs/SOURCES.md`](SOURCES.md).
- [x] Toutes les composantes CFFWIS §6.1 ont au moins une **définition** (signature +
      noms d'équations), même si l'implémentation n'est pas livrée en PHASE 1.
- [ ] `tsc -b --noEmit` reste vert (sanity check : aucun fichier TypeScript existant
      n'a été cassé).

---

## 8. Décisions de phase (journal)

| Phase | Décision | Justification |
| --- | --- | --- |
| **PHASE 1** | Monorepo à plat (`backend/`, `frontend/`, `infra/`, `docs/`). | Cohérent avec une livraison `docker compose` unique ; préserve l'arborescence `src/` actuelle côté Freebuff. |
| **PHASE 1** | `README.md` du template Freebuff remplacé. | Le README d'origine parle de Convex, Three.js, etc., ce qui contredit la spec §4. Le README documente désormais la cible, pas l'état temporaire du template. |
| **PHASE 1** | Aucune modification de `convex/`, `package.json`, `vite.config.ts` ou `src/main.tsx`. | Ces fichiers portent un couplage fort avec le runtime Freebuff et la migration Convex → FastAPI/Postgres mérite des commits dédiés en PHASE 2. |
| **PHASE 1** | Statut produit côté Freebuff preview = **mode dégradé doc-only**. | L'environnement Freebuff (Node + navigateur) n'exécute ni Python, ni PostgreSQL, ni Docker. Toute carte sans backend serait une fabrication (interdit §C-05). |
| **PHASE 1** | Licence proposée par défaut : **AGPL-3.0**. | Compatible avec la redistribution ODbL (OSM), Copernicus (ouverte avec attribution), IGN (licence ouverte), Open-Meteo (usage non commercial sous conditions). À confirmer avant PHASE 2. |
| **Phase Pré-0** | Adoption de **3 bboxes distinctes** (`BBOX_DEPARTEMENT`, `BBOX_CALCUL`, `BBOX_INGESTION`) avec marges 0 / 20 km / 45 km. | Empêche cônes Rothermel tronqués au bord et surcoût d'ingestion hors-périmètre. `BBOX_CALCUL.max_lon` reste à 0.60 (≈20 km à l'est) ; `BBOX_INGESTION.max_lon` à 0.95 (≈45 km). |
| **Phase Pré-0** | Reformulation de §C-05 en **§C-05.a à §C-05.d** : interpolation spatiale autorisée (méthode + incertitude documentées), interpolation temporelle vers « maintenant » interdite. | Distingue clairement l'interpolation légitime (modèle météo spatial) de l'invention d'instantané temporel. |
| **Phase Pré-0** | Interdiction explicite des **« confiance : X % »** dans l'UI, y compris depuis modèles calibrés. | L'incertitude est rendue par intervalle ou dispersion inter-modèles, jamais par un chiffre unique. |
| **Phase Pré-0** | Instanciation des **5 métriques Prometheus core** dès PHASE 0 (avec valeurs 0) ; structuration effective dès PHASE 1 sur FIRMS + Open-Meteo. CDSE et Sentinel s'y branchent en PHASE 3 sans nouveau pattern. | « Découvrir le quota épuisé quand on commence à le consommer est déjà trop tard. » (cf. `docs/ARCHITECTURE.md` §8.) |
| **Phase Pré-0** | Open-Meteo : **4 conditions cumulatives** (open source, pas de pub, CC BY 4.0, attribution NOAA/ECMWF/DWD) + **fallback auto-hébergement** du serveur Open-Meteo documenté dans `README` dès maintenant. | Anticipe un dépassement de quota ou un changement de statut commercial d'Open-Meteo. La bascule vers auto-hébergement n'introduit pas de dépendance payante. |
| **Phase Pré-0** | Reformulation de la **condition d'entrée PHASE 5** (porte a/b/c) : (a) jeu d'allumages géolocalisé à résolution compatible avec la grille, (b) stratégie d'échantillonnage négatif documentée, (c) validation temporelle par blocs battant le baseline FWI. | La provenance (BDIFF, SDIS 33, autre) devient indifférente tant que les trois conditions sont remplies. BDIFF agrégé à la commune est noté trop grossier pour cellules 250 m ; à vérifier via la consultation détaillée avant de s'engager. |
| **Phase Pré-0** | **Webcams publiques + ML** : **hors périmètre v1**, justifié par (a) droits sur le flux, (b) RGPD sur personnes identifiables, (c) précision de détection faible → surtout faux positifs. | Évite un ticket « en attente juriste » de deux ans sans produire de valeur. Réintroduction uniquement sur cas d'usage précis + validation juridique explicite. |
| **Phase Pré-0** | **PWA + notifications** : **garde-fou explicite** dans l'UI : « notifications informatives, sans garantie de délivrance — pour l'alerte, 18 / 112 et les canaux officiels ». Repli documenté : email ou flux RSS. | iOS ne supporte web push que pour PWA installée sur l'écran d'accueil ; cette formulation protège contre une lecture opérationnelle du push. |
