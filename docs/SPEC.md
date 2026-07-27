# Spécification PyroScope 33

Document normatif. Toute déviation doit être justifiée dans [`docs/PHASE_PLAN.md`](PHASE_PLAN.md)
et tracée dans ce fichier (section « Décisions de phase »).

---

## 1. Rôle et contexte

PyroScope 33 est une application web **open source** de suivi et d'évaluation du **risque
d'incendie de forêt** sur le département de la **Gironde (France)**.

Emprise géographique unique du projet (bounding box) :

| Paramètre | Valeur |
| --- | --- |
| `lon_min` | -1.35 |
| `lon_max` | 0.35 |
| `lat_min` | 44.15 |
| `lat_max` | 45.60 |

Toute donnée hors de cette emprise est **ignorée**. La grille de travail est constituée de
cellules de **250 m** projetées en **EPSG:2154 (Lambert-93)** pour les calculs, puis
reprojetées en **EPSG:4326** pour l'affichage.

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
| **C-05** | **Aucune donnée fabriquée.** Interdiction de générer des valeurs de démonstration, de mocker des points chauds ou de remplir des trous par interpolation silencieuse. Si la donnée n'existe pas, l'UI affiche « donnée indisponible ». |

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
  valeur).
- **Indicateur de qualité de donnée** : quelles sources étaient disponibles, à quelle
  heure, avec quelle latence.

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
