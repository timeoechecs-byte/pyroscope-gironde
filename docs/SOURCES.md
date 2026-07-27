# Catalogue des sources PyroScope 33

Catalogue normatif des sources de données citées dans [`docs/SPEC.md`](SPEC.md) §5.
Chaque entrée précise : statut d'intégration, clé / licence, méthode d'accès,
contraintes de coût, et notes spécifiques.

## Légende statut

| Statut | Sens |
| --- | --- |
| **Implémentée (PHASE X)** | Code livré, testé, en production. |
| **Planifiée (PHASE Y)** | Code à écrire dans la phase Y (cf. [`docs/PHASE_PLAN.md`](PHASE_PLAN.md)). |
| **Adoptée mais inactive** | Code en place mais désactivé par défaut (feature flag). |
| **Exclue** | Source écartée car incompatible §C-01, §C-02, instabilité ou autre raison explicite. |
| **À valider** | Statut indécis ; une revue est nécessaire avant l'intégration. |

---

## 5.1 Feux actifs

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| NASA FIRMS — `VIIRS_SNPP_NRT` | Planifiée **PHASE 1 (MVP)** | clé unique `FIRMS_MAP_KEY` (32 hex, par e-mail depuis `https://firms.modaps.eosdis.nasa.gov/api/map_key`) | REST CSV par bbox | 0 € | mention obligatoire | **Quota : 5 000 transactions / 10 min** (compteur réinitialisé). À notre cadence (15 min × 4 capteurs) ≈ 16/h. **FIRMS peut renvoyer une erreur HTTP 200 avec un texte brut** : valider le contenu, pas seulement le statut. Ordre bbox : **ouest,sud,est,nord**. Champs : lat, lon, acq_date, acq_time, satellite, confidence, frp, daynight, bright_ti4/ti5. |
| NASA FIRMS — `VIIRS_NOAA20_NRT` | Planifiée **PHASE 1 (MVP)** | idem | idem | 0 € | idem | Combiné avec SNPP pour complétude temporelle. |
| NASA FIRMS — `VIIRS_NOAA21_NRT` | Planifiée **PHASE 1 (MVP)** | idem | idem | 0 € | idem | Plus récent satellite ; moins d'historique. |
| NASA FIRMS — `MODIS_NRT` | Planifiée **PHASE 1 (MVP)** | idem | idem | 0 € | idem | Fallback si VIIRS indisponible. Résolution plus grossière (1 km). |
| EFFIS / Copernicus EMS (WMS) | Planifiée **PHASE 2** | aucune clé | WMS | 0 € | ouverte, attribution | Overlay optionnel dans MapLibre : points chauds, surfaces brûlées, FWI européen. `GetCapabilities` lu à l'init, **noms de couches lus dynamiquement** (ils changent selon la version, ne pas coder en dur). |

---

## 5.2 Météo et prévisions

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Open-Meteo Forecast API | Planifiée **PHASE 1 (MVP)** | aucune | REST multi-coordonnées | 0 € | **usage non commercial — 4 conditions cumulatives** | Modèles paramétrables : `meteofrance_arome_france_hd` (~1,5 km), `meteofrance_arome_france`, `icon_d2`, `ecmwf_ifs025`, `gfs_seamless`. **PHASE 1 n'utilise que `meteofrance_arome_france_hd`**. Comparaison multi-modèles en PHASES 2/4. |
| Open-Meteo Historical / ERA5 | Planifiée **PHASE 2** | aucune | REST | 0 € | **usage non commercial — 4 conditions cumulatives** | Conforme à la spec §6.1 : ≥ 60 jours d'historique minimaux (≥ 1 an recommandé) pour init CFFWIS. |
| Open-Meteo Air Quality (CAMS) | Planifiée **PHASE 1 (MVP)** | aucune | REST | 0 € | **usage non commercial — 4 conditions cumulatives** | Variables : `pm2_5`, `pm10`, `aerosol_optical_depth`, `uv_index`, `dust`. Utilisation secondaire (info complémentaire, pas source de risque). |

---

## 5.3 Satellite et végétation

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Copernicus Data Space — Sentinel-2 L2A (via **Statistical API**) | Planifiée **PHASE 3** | OAuth `client_credentials` : `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET` | Process API CDSE (Statistical) | 0 € | ouverte, attribution | **Voie d'accès optimale** : renvoie directement des statistiques agrégées par polygone (cellules 250 m), sans téléchargement complet de scènes. NDVI, NDMI, NBR agrégés sur la grille. Rafraîchissement hebdomadaire minimum. Ordre bbox CDS : **nord,ouest,sud,est**. Quota en **Processing Units** (PU) — instancié via `CDSE_QUOTA_PU_LIMIT_MONTH`. |
| Copernicus Data Space — Sentinel-3 SLSTR | Planifiée **PHASE 3** | idem | idem | 0 € | ouverte | LST + anomalies thermiques ; croisement FIRMS pour valider des détections. |
| Copernicus Data Space — Sentinel-1 GRD | Planifiée **PHASE 3 (optionnel)** | idem | S3 download (plusieurs Go/scène) | 0 € | ouverte | Radar, traverse les nuages — utile en complément quand Sentinel-2 est masqué. Calcul NDVI-proxy à dériver. |
| Copernicus Land Monitoring Service — CORINE Land Cover | Planifiée **PHASE 3** | aucune | WMS / download | 0 € | ouverte | Classes d'occupation du sol (1 ha). |
| Copernicus LMS — HRL arborées (Tree Cover, Dominant Leaf Type) | Planifiée **PHASE 3** | aucune | download | 0 € | ouverte | Densité arborée + type de feuillu / résineux. Donnée importante pour Gironde. |
| IGN Géoplateforme — BD Forêt® V2 | Planifiée **PHASE 3** | **aucune clé requise** (IP limité à 10 req/s) | Téléchargement vectoriel via `data.geopf.fr/telechargement` | 0 € | licence ouverte (Etalab) | **Donnée capitale Gironde.** Nomenclature nationale **32 postes** (formation végétale). Parcel cartographique minimale : **5 000 m² (0,5 ha)**. Millésime girondin élaboré entre **2007 et 2018** → **antérieur aux incendies 2022** ; à recouper avec périmètres brûlés EFFIS et détection de coupes via NDVI Sentinel-2. **Afficher le millésime dans l'interface.** Bonus pertinent : couches IGN `ACCESSIBILITE-PHYSIQUE-FORETS` et `NaviForest` (dessertes forestières) à explorer en PHASE 6. |
| IGN Géoplateforme — RGE ALTI® | Planifiée **PHASE 3** | idem | WMS + download | 0 € | licence ouverte | Altitude, pente, exposition. **Pas 1 m** (trop volumineux) — **5 m suffit** pour pente/exposition sur cellules 250 m. |
| Copernicus DEM (GLO-30) | Planifiée **PHASE 3** | aucune | download | 0 € | ouverte | **Secours** topographique si RGE ALTI® pose problème de volumétrie. Résolution 30 m. |
| Fonds de carte IGN WMTS (plan, photos aériennes, Scan Express) | Planifiée **PHASE 1 (MVP)** | aucune | WMTS via `data.geopf.fr/wmts` | 0 € | licence ouverte | Idéal comme fond cartographique MapLibre, plus précis qu'OSM sur le massif forestier. `GetCapabilities` lu à l'init, noms de couches dynamiques. |

---

## 5.4 Contexte humain et topographie

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenStreetMap / Overpass API | Planifiée **PHASE 3** | aucune | REST Overpass | 0 € | **ODbL** | Routes, chemins, campings, aires de loisirs, zones bâties, lignes électriques, points d'eau. **Cache local mensuel** (Overpass lent, données quasi statiques). **Ordre bbox Overpass : sud,ouest,nord,est** (3e convention du projet). User-Agent applicatif obligatoire, **pas de polling lourd** ; pour gros volumes préférer un extrait Geofabrik Aquitaine + `osm2pgsql`. Nominatim : **max 1 req/s**, jamais en boucle. |
| Copernicus DEM (GLO-30) | Planifiée **PHASE 3** | aucune | download | 0 € | ouverte | Doublon avec §5.3 — voir Sentinel-2 fallback. |

---

## 5.5 Optionnel, phase tardive (ne pas bloquer)

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Blitzortung** (foudre) | Adoptée mais inactive — `ENABLE_BLITZORTUNG=false` par défaut | **Pas d'API publique stable** | WebSocket | 0 € sous conditions restrictives | à valider | Pas de clé ouverte, rediffusion limitée au réseau de contributeurs. **Recommandation** : ne pas construire de dépendance ; utiliser les variables météo Open-Meteo (`cape`, `lifted_index`, `precipitation_probability`) qui couvrent le même signal via des canaux ouverts. |
| **OpenAQ** (qualité air locale) | À valider **PHASE 4** | clé `OPENAQ_API_KEY` (header **`X-API-Key`**, pas Bearer, pas param URL) | REST | 0 € | ouverte | Couverture Gironde **inégale** ; à valider avant intégration. CAMS via Open-Meteo §5.2 donne une couverture homogène plus utile pour la dispersion des fumées. |
| **Arrêtés préfectoraux Gironde** | À valider **PHASE 6** | aucune | pas d'API publique | n/a | n/a | **Pas de scraping**. Table administrable manuellement + formulaire d'admin. |
| Climate Data Store (CDS) / ERA5 — repli | Planifiée **PHASE 2** | `~/.cdsapirc` avec **Personal Access Token** seul (sans UID, sans `verify: 0` ; nouveau format 2024) | REST (`cdsapi`) ou `ecmwf-datastores-client` | 0 € | ouverte, attribution | **Repli** derrière Open-Meteo Historical (qui suffit pour PHASE 2). Ne déclencher CDS que si variables manquantes. **Accepter les conditions d'utilisation de chaque dataset** dans l'UI avant tout appel API (étape souvent oubliée). Ordre `area` CDS : **nord,ouest,sud,est**. Backfill asynchrone obligatoire (file d'attente CDS). |
| Google Earth Engine | À valider (PHASES tardives) | OAuth Google | REST | 0 € non commercial (recherche) | conditions Google | Vérifier conditions actuelles avant d'engager. CDSE suffit pour ce projet ; n'ajouter GEE que si un calcul long devient bloquant. |
| Sentinel Hub Process API (commercial) | **Exclue** | n/a | n/a | payant | n/a | Les URL CDSE ci-dessus sont spécifiques au Copernicus Data Space. Services.sentinel-hub.com = produit commercial Sentinel Hub — **écarté par §C-01**. |

---

## Veille permanente — checkbox d'acceptation d'une nouvelle source

Pour toute nouvelle source candidate avant intégration, vérifier **tous** les points
ci-dessous. Si un seul manque, la source est **rejetée** par défaut.

- [ ] **Coût 0 €** (compte gratuit acceptable, **jamais de carte bancaire requise**).
- [ ] **Licence compatible avec AGPL-3.0** ou choix de licence définitive.
- [ ] **Usage non commercial autorisé** (ou commercial toléré) — vérifier explicitement.
- [ ] **Clé gratuite** ou sans clé — pas de clé payante / paywall caché.
- [ ] **Emprise Gironde couverte** sans extrapolation (bbox §1 respectée).
- [ ] **Stabilité du fournisseur** : pas un service beta abandonné.

Critères annexes à documenter dans la PR d'ajout :

- Fréquence de mise à jour.
- Latence typique.
- Volume par requête / par jour (rate limit).
- Méthode d'auth.
- Format (REST / WMS / WFS / STAC / fichier).
- Espace disque de cache attendu.

**Convention de bbox — rappel** : chaque provider attend un ordre différent
(FIRMS ouest,sud,est,nord · CDS nord,ouest,sud,est · Overpass sud,ouest,nord,est).
Toute nouvelle source doit ajouter sa convention au tableau ci-dessus **et** un test
dans `tests/geo/test_bbox.py`.

---

## Mentions et licences affichées côté UI

L'application affiche, dans une page « Sources & licences » accessible depuis le pied
de page, la liste exacte des sources utilisées avec :

- nom de la source ;
- URL officielle ;
- licence (texte court et lien) ;
- date de dernière mise à jour des données ;
- mention obligatoire (NASA FIRMS, IGN, Copernicus, OpenStreetMap contributors, etc.).

Cette page est **non masquable** (au même titre que le bandeau légal §3) et doit être
générée dynamiquement depuis la liste active des sources — pas un texte en dur.
