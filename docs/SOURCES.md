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
| NASA FIRMS — `VIIRS_SNPP_NRT` | Planifiée PHASE 4 | gratuite (`firms.modaps.eosdis.nasa.gov`) | REST CSV par bbox | 0 € | mention obligatoire | Champs : lat, lon, acq_date, acq_time, satellite, confidence, frp, daynight, bright_ti4/ti5. |
| NASA FIRMS — `VIIRS_NOAA20_NRT` | Planifiée PHASE 4 | idem | idem | 0 € | idem | Combiné avec SNPP pour complétude temporelle. |
| NASA FIRMS — `VIIRS_NOAA21_NRT` | Planifiée PHASE 4 | idem | idem | 0 € | idem | Plus récent satellite ; moins d'historique. |
| NASA FIRMS — `MODIS_NRT` | Planifiée PHASE 4 | idem | idem | 0 € | idem | Fallback si VIIRS indisponible. Résolution plus grossière (1 km). |
| EFFIS / Copernicus EMS (WMS) | Planifiée PHASE 4 | aucune clé | WMS | 0 € | ouverte, attribution | Overlay optionnel dans MapLibre : points chauds, surfaces brûlées, FWI européen. |

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
| Copernicus Data Space — Sentinel-2 L2A | Planifiée PHASE 5 | compte gratuit | STAC + download | 0 € | ouverte, attribution | NDVI, NDMI, NBR. Rafraîchissement hebdomadaire minimum ; daily où possible. |
| Copernicus Data Space — Sentinel-3 SLSTR | Planifiée PHASE 5 | idem | idem | 0 € | ouverte | LST + anomalies thermiques ; croisement possible avec FIRMS pour valider des détections. |
| Copernicus Data Space — Sentinel-1 GRD | Planifiée PHASE 5 (optionnel) | idem | idem | 0 € | ouverte | Radar, traverse les nuages — utile en complément (PHASE 5 conditionnel). |
| Copernicus Land Monitoring Service — CORINE Land Cover | Planifiée PHASE 5 | aucune | WMS / download | 0 € | ouverte | Classes d'occupation du sol (1 ha). |
| Copernicus LMS — HRL arborées (Tree Cover, Dominant Leaf Type) | Planifiée PHASE 5 | aucune | download | 0 € | ouverte | Densité arborée + type de feuillu / résineux. Donnée importante pour Gironde. |
| IGN Géoplateforme — BD Forêt® V2 | Planifiée PHASE 5 | clé gratuite (inscription IGN) | WFS + download | 0 € | licence ouverte | Essences (pin maritime, feuillus, mixtes) — **donnée capitale Gironde**. Téléchargement parcellaire départemental. |
| IGN Géoplateforme — RGE ALTI® | Planifiée PHASE 5 | idem | WMS + download | 0 € | licence ouverte | Altitude, pente, exposition. Référence : MNT 1 m. |
| Copernicus DEM (GLO-30) | Planifiée PHASE 5 | aucune | download | 0 € | ouverte | **Secours** topographique si RGE ALTI® trop volumineux. Résolution 30 m. |

---

## 5.4 Contexte humain et topographie

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OpenStreetMap / Overpass API | Planifiée PHASE 5 | aucune | REST Overpass | 0 € | **ODbL** | Routes, chemins, campings, aires de loisirs, zones bâties, lignes électriques, points d'eau. **Cache local mensuel** (Overpass lent, données quasi statiques). |
| Copernicus DEM (GLO-30) | Planifiée PHASE 5 | aucune | download | 0 € | ouverte | Couplé à 5.3 — secours topographique. |

---

## 5.5 Optionnel, phase tardive (ne pas bloquer)

| Source | Statut | Clé | Méthode | Coût | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Blitzortung** (foudre) | Adoptée mais inactive — feature flag `ENABLE_BLITZORTUNG=false` par défaut | soumise à conditions | WebSocket | 0 € si accepté | à valider | Pas d'API publique garantie. Implémentation derrière flag, désactivée par défaut. |
| **OpenAQ** (qualité air locale) | À valider PHASE 4 | aucune | REST | 0 € | ouverte | Couverture Gironde **inégale**. À mesurer avant intégration. |
| **Arrêtés préfectoraux Gironde** | À valider PHASE 6 | aucune | pas d'API publique | n/a | n/a | **Pas de scraping**. Table administrable manuellement + formulaire d'admin. |

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
