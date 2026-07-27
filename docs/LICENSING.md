# PyroScope 33 — Licences et attributions des sources de données

> **Mise à jour :** Juillet 2026
> **Respect des conditions d'utilisation de chaque API** : exigence contractuelle du projet (SPEC §8). Toute source dont la licence change ou devient incompatible sera immédiatement désactivée.

---

## 1. NASA FIRMS — Fire Information for Resource Management System

| Champ | Valeur |
|---|---|
| **URL** | https://firms.modaps.eosdis.nasa.gov/ |
| **Licence** | NASA Data & Information Policy — libre et gratuite |
| **Conditions** | Crédit obligatoire : « NASA FIRMS » dans l'UI. Clé API gratuite via https://firms.modaps.eosdis.nasa.gov/api/ |
| **Produits utilisés** | VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT |
| **Résolution spatiale** | 375 m (VIIRS), 1 km (MODIS) |
| **Latence** | ~1-3 h après le passage satellite |
| **Limites connues** | Quota API 200 requêtes/min ; détection = anomalie thermique, pas incendie confirmé. Fausses positives : feux agricoles, gaz torchères, surfaces chaudes |
| **Attribution dans l'UI** | ✅ Oui — dans le footer attributions et sur chaque popup hotspot |

---

## 2. Copernicus Data Space Ecosystem (CDSE)

| Champ | Valeur |
|---|---|
| **URL** | https://dataspace.copernicus.eu/ |
| **Licence** | Copernicus Data License (CC BY 4.0 équivalent) |
| **Conditions** | Compte gratuit obligatoire. Crédit : « Copernicus Sentinel data [année] ». Doit être accompagné du message « EU Copernicus programme — free and open access » |
| **Produits utilisés** | Sentinel-2 L2A (NDVI/NDMI/NBR), Sentinel-3 SLSTR (future) |
| **Résolution spatiale** | 10 m (S2 visible), 20 m (S2 red-edge), 60 m (S2 atmospheric) |
| **Latence** | Daily (S2 revisit 5j à 45°N) |
| **Limites connues** | Nécessite OAuth2 client_credentials. Quota rate-limit par utilisateur. Données indisponibles sous couverture nuageuse > 80 % |
| **Stockage** | 2-3 Go/jour pour la Gironde en full-res — on n'ingère que l'emprise + indices spectraux, pas les bandes brutes |
| **Attribution dans l'UI** | ✅ Oui |

---

## 3. Open-Meteo — Forecast API

| Champ | Valeur |
|---|---|
| **URL** | https://open-meteo.com/ |
| **Licence** | CC BY 4.0 |
| **Conditions** | Open source, pas de publicité, pas d'abonnement, attribution visible. Le jour où le projet devient commercial ou dépasse le plafond, l'auto-hébergement du serveur Open-Meteo (disponible en Docker) remplace l'API publique. Voir README §Auto-hébergement |
| **Modèles utilisés** | meteofrance_arome_france_hd (principal), meteofrance_arome_france, icon_d2, ecmwf_ifs025, gfs_seamless (comparaison) |
| **Variables** | temperature_2m, relative_humidity_2m, wind_speed/direction/gusts_10m, precipitation, soil_moisture/temperature, vapour_pressure_deficit, et0_fao_evapotranspiration |
| **Résolution spatiale** | 1-2 km (AROME HD), 5-12 km (ICON, GFS) |
| **Latence** | Temps réel (mise à jour horaire pour AROME HD) |
| **Limites connues** | Usage non-commercial seulement. Pas de clé API. Rate limit non documenté mais observé ~100 req/s. Pas de garantie SLA |
| **Attribution dans l'UI** | ✅ Oui |

---

## 4. Copernicus Land Monitoring Service — CORINE Land Cover

| Champ | Valeur |
|---|---|
| **URL** | https://land.copernicus.eu/ |
| **Licence** | Copernicus Data License (CC BY 4.0) |
| **Conditions** | Libre accès, pas de clé. Crédit : « Copernicus Land Monitoring Service » |
| **Produits utilisés** | CORINE Land Cover 2018 (nomenclature niveau 3) |
| **Résolution spatiale** | 100 m (unité minimale cartographiée 25 ha) |
| **Latence** | Mise à jour 6 ans (CLC 2018 → 2024 — utilisable) |
| **Limites connues** | Trop grossier pour des cellules de 250 m — utilisé comme classification de secours quand BD Forêt V2 est indisponible. Les polygones > 25 ha lissent les petites parcelles |
| **Attribution dans l'UI** | ✅ Oui |

---

## 5. IGN — Géoplateforme

| Champ | Valeur |
|---|---|
| **URL** | https://geoservices.ign.fr/ |
| **Licence** | Licence Ouverte / Open Licence 2.0 (Etalab) |
| **Conditions** | Gratuit, pas de clé pour les flux WMS/WFS grand public. Crédit : « IGN — BD Forêt V2 / RGE ALTI ». Certains flux haute résolution peuvent nécessiter clé API |
| **Produits utilisés** | BD Forêt V2 (essences, couvert), RGE ALTI (altitude, pente) |
| **Résolution spatiale** | 5 m (BD Forêt V2), 1 m (RGE ALTI) |
| **Latence** | Annuelle (BD Forêt V2 mise à jour tous les 5-10 ans) |
| **Limites connues** | BD Forêt V2 ne couvre pas tout le territoire métropolitain de façon uniforme — données les plus récentes pour les Landes de Gascogne. Le RGE ALTI complet (1 m) représente ~200 Go — on utilise une version sous-échantillonnée à 25 m ou le Copernicus DEM 30 m en repli |
| **Attribution dans l'UI** | ✅ Oui |

---

## 6. OpenStreetMap / Overpass API

| Champ | Valeur |
|---|---|
| **URL** | https://overpass-api.de/ |
| **Licence** | ODbL (Open Database License) |
| **Conditions** | Attribution : « © contributeurs d'OpenStreetMap ». Usage libre avec partage à l'identique. Cache mensuel obligatoire pour respecter ODbL |
| **Produits utilisés** | Routes (highway=*), campings (tourism=camp_site), parkings (amenity=parking), bâtiments, points d'eau, plages |
| **Limites connues** | Les campings en Gironde sont bien référencés. Taux de complétude > 95 %. Pas de SLA. Query Overpass QL paginée |
| **Cache** | 30 jours obligatoires (ODbL et respect du serveur Overpass) |
| **Attribution dans l'UI** | ✅ Oui |

---

## 7. Copernicus DEM (GLO-30)

| Champ | Valeur |
|---|---|
| **URL** | https://spacedata.copernicus.eu/ |
| **Licence** | Copernicus Data License (CC BY 4.0) |
| **Conditions** | Libre accès, pas de clé. Crédit : « Copernicus DEM GLO-30 » |
| **Résolution spatiale** | 30 m |
| **Utilisation** | Repli si RGE ALTI indisponible ou trop coûteux en stockage |
| **Limites connues** | Acquisition 2011-2015 — peut ne pas refléter les changements récents (carrières, déforestation) |
| **Attribution dans l'UI** | ✅ Oui |

---

## 8. ERA5 / Copernicus Climate Data Store

| Champ | Valeur |
|---|---|
| **URL** | https://cds.climate.copernicus.eu/ |
| **Licence** | Copernicus Data License (CC BY 4.0) |
| **Conditions** | Compte gratuit obligatoire pour téléchargement. Attribution « Copernicus Climate Change Service (C3S) » |
| **Produits utilisés** | ERA5 hourly (2m temp, wind, RH, precip, soil moisture) — pour initialisation FWI et entraînement ML |
| **Résolution spatiale** | 0.25° (~28 km) |
| **Latence** | 5 jours (ERA5), 3 mois (ERA5-Land) |
| **Limites connues** | Trop résolu pour la Gironde — Open-Meteo ERA5 API (via Historique) suffit à la résolution du modèle |

---

## 9. Code du projet

| Champ | Valeur |
|---|---|
| **Licence** | MIT |
| **Conditions** | Libre utilisation, modification, distribution. Aucune garantie. Voir LICENSE |
| **Note** | Le code est open source auto-hébergeable. L'avertissement légal (SPEC §3) doit être conservé dans toute redistribution |

---

## Résumé UI des attributions

Affiché en permanence dans la sidebar du dashboard :

```
NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN ·
OpenStreetMap © contributeurs (ODbL)
```

Chaque popup de donnée inclut sa source spécifique.
