# PyroScope 33 — Méthodologie

> Document normatif. Décrit la chaîne complète, de la donnée brute au score affiché,
> avec équations, sources, et **liste explicite des hypothèses non validées**.

**Date** : 2026-07-27
**Projet** : PyroScope 33 — suivi et évaluation du risque d'incendie de forêt en Gironde

---

## 1. Architecture de la chaîne de calcul

```
Données brutes
  ├── NASA FIRMS (points chauds satellite)
  ├── Open-Meteo / ERA5 (météo, historique)
  ├── Copernicus CDSE (Sentinel-2 NDVI/NDMI)
  ├── IGN Géoplateforme (BD Forêt V2, RGE ALTI)
  ├── Copernicus LMS (CORINE Land Cover)
  └── Overpass API (routes, campings, bâti)
      │
      ▼
Prétraitement
  ├── Interpolation spatiale (météo → grille 250 m)
  ├── Masque nuages (Sentinel-2)
  ├── Reprojection EPSG:2154 ↔ EPSG:4326
  └── Association modèle de combustible (BD Forêt → SB40 + FBP)
      │
      ▼
Moteur scientifique (déterministe — backend/app/science/)
  ├── CFFWIS (§2) : FFMC, DMC, DC, ISI, BUI, FWI, DSR
  ├── FBP (§3) : ROS, Byram intensity, flame length, crown fire
  ├── Rothermel (§4) : ROS secondaire, SB-40
  ├── Coefficient local Gironde (§5) : 14 facteurs
  └── Spread ellipse (§6) : Alexander 1985, per-epoch wind
      │
      ▼
Score de risque
  ├── ignition_risk (§7) : probabilité de départ de feu
  ├── spread_risk (§7) : probabilité de propagation
  └── Décomposition des contributions + quality flags
      │
      ▼
Affichage
  └── Carte MapLibre + courbes Recharts + panneau de décomposition

Stockage : PostgreSQL 16 + PostGIS + TimescaleDB
Cache : Redis (TTL piloté par ingestion)
```

---

## 2. CFFWIS — Canadian Forest Fire Weather Index System

### Référence

Van Wagner & Pickett (1985). « Equations and FORTRAN Program for the Canadian
Forest Fire Weather Index System. » Canadian Forestry Service, Petawawa National
Forestry Institute. ST-X-3.

### Implémentation

Fichier : `backend/app/science/cffwis.py`

### Composantes

| Code | Nom | Entrées | Dépend de |
|------|-----|---------|-----------|
| FFMC | Fine Fuel Moisture Code | T, HR, vent, pluie, FFMC<sub>J-1</sub> | Récursif |
| DMC | Duff Moisture Code | T, HR, pluie, mois, latitude, DMC<sub>J-1</sub> | Récursif |
| DC | Drought Code | T, pluie, mois, latitude, DC<sub>J-1</sub> | Récursif |
| ISI | Initial Spread Index | FFMC, vent | FFMC |
| BUI | Buildup Index | DMC, DC | DMC + DC |
| FWI | Fire Weather Index | ISI, BUI | ISI + BUI |
| DSR | Daily Severity Rating | FWI | FWI |

### Récursivité et initialisation

Les codes FFMC, DMC et DC sont **récursifs** : ils dépendent de leur valeur de la veille.
Une initialisation nécessite au moins **60 jours d'historique** (ERA5 / Open-Meteo Historical).
En l'absence d'historique suffisant, les indices ne sont pas calculés et l'UI affiche
« donnée indisponible » (§C-05.c).

### Convention horaire

Le calcul officiel utilise les observations de **midi heure locale** (UTC+2 en été, UTC+1 en hiver).
Les valeurs infra-journalières (horaires) sont explicitement étiquetées
« FWI horaire, non normalisé ».

### Classes EFFIS

| Classe | Borne inférieure FWI | Borne supérieure | Couleur |
|--------|---------------------|------------------|---------|
| Très faible | 0 | 5.2 | Vert clair |
| Faible | 5.2 | 11.2 | Vert |
| Modéré | 11.2 | 21.3 | Jaune |
| Élevé | 21.3 | 38.0 | Orange |
| Très élevé | 38.0 | 50.0 | Rouge |
| Extrême | 50.0 | +∞ | Marron foncé |

Référence : EFFIS (European Forest Fire Information System).

---

## 3. FBP — Fire Behaviour Prediction

### Référence

Forestry Canada (1992). « Development and Structure of the Canadian Forest Fire
Behavior Prediction System. » ST-X-3.
Van Wagner (1977). « Effect of Slope on Fire Spread. »

### Implémentation

Fichier : `backend/app/science/fbp.py`

### Types de combustible FBP supportés

| Type | Description | Utilisation Gironde |
|------|-------------|---------------------|
| C-6 | Conifer Plantation | **Type par défaut** — pin maritime en plantation |
| C-7 | P. ponderosa / P. menziesii | Fallback — lande, peuplement jeune |
| M-1 | Mixedwood (confère > décidus) | Forêt mixte |
| M-2 | Mixedwood (décidus > confère) | Peuplement secondaire |
| D-1 | Deciduous | Feuillus purs (chênaies) |
| O-1 | Grass (mat) | Landes, zones ouvertes |

### Équations principales

**ROS (Rate of Spread)** :
```
ROS = a × ISI × exp(b × WS)
```
Où a et b sont des coefficients spécifiques au type de combustible.

**Intensité du front (Byram)** :
```
I = H × w × R
```
- H = chaleur de combustion (kJ/kg), par type de combustible
- w = combustible consommé (kg/m²), dépendant de BUI
- R = ROS (m/min → m/s)

**Longueur de flamme (Nelson)** :
```
L = 0.0775 × I^0.46
```

**Transition en feu de cime (Van Wagner)** :
- Surface si ROS < ROS_critique_surface
- Intermittent si ROS entre critiques
- Cime active si ROS > ROS_critique_cime

---

## 4. Rothermel (modèle secondaire)

### Référence

Rothermel (1972). « A Mathematical Model for Predicting Fire Spread in Wildland
Fuels. » USDA Forest Service, INT-115.
Scott & Burgan (2005). « Standard Fire Behavior Fuel Models. » RMRS-GTR-153.

### Implémentation

Fichier : `backend/app/science/rothermel.py`

### Modèles Scott & Burgan 40

| Modèle | Description | Load 1h (t/ha) | SAVR (m⁻¹) | Profondeur (cm) |
|--------|-------------|----------------|------------|-----------------|
| SB-1 | Short grass | 0.4 | 5500 | 0.3 |
| SB-2 | Timber grass | 1.1 | 4900 | 0.9 |
| SB-5 | Brush (low load) | 0.7 | 5600 | 1.0 |
| SB-8 | Closed timber | 2.3 | 4400 | 0.1 |
| SB-9 | Hardwood litter | 2.7 | 5000 | 0.4 |
| SB-10 | Timber litter | 2.7 | 3800 | 0.4 |
| SB-99 | No fuel (urban/water) | 0 | 0 | 0 |

### Équations

**ROS** :
```
R = (I_R × ξ × (1 + Φ_w + Φ_s)) / (ρ_b × ε × Q_ig)
```
Où I_R = réaction intensity, ξ = propagating flux ratio,
Φ_w = wind coefficient, Φ_s = slope coefficient,
ρ_b = bulk density, ε = effective heating number, Q_ig = heat of pre-ignition.

---

## 5. Coefficient local Gironde

### Référence

Pondérations définies dans `config/local_coefficient.yaml` — éditable,
**aucune valeur en dur dans le code**.

### Implémentation

Fichier : `backend/app/science/local_coefficient.py`

### 14 facteurs, 4 catégories

| Catégorie | Poids par défaut | Facteurs |
|-----------|-----------------|----------|
| Sécheresse climatique | 0.30 | dry_days_7d, dry_days_15d, dry_days_30d, heatwave_days, soil_moisture, soil_moisture_28cm |
| Combustible | 0.25 | pine_pct, canopy_density, ndmi_anomaly |
| Facteur humain | 0.30 | road_distance, amenity_distance, building_density |
| Terrain | 0.15 | slope_deg, aspect_southness |

### Fonctions de normalisation

- `linear` : score proportionnel dans [0,1]
- `inverse_linear` : score inversement proportionnel
- `threshold` : palier binaire au-dessus d'un seuil
- `seasonal` : cycle annuel sinusoïdal (maximum estival)
- `binary` : 0 ou 1

### Renormalisation

Si un facteur est manquant (source indisponible), le coefficient est
automatiquement **renormalisé** : somme des poids restants ramenée à 1.0.
Le nombre de facteurs disponibles et le flag `renormalized` sont exposés
dans chaque réponse API.

---

## 6. Ellipse de propagation (Alexander 1985)

### Référence

Alexander (1985). « Estimating the Length-to-Breadth Ratio of Elliptical Forest
Fire Patterns. » Fire Management Notes.

### Implémentation

Fichier : `backend/app/science/spread_ellipse.py`

### Équation du ratio L/B

```
L/B = 1 + 0.36 × U^0.46
```
Où U = vitesse du vent à mi-flamme (km/h).

### Géométrie par échéance

Les ellipses sont calculées pour chaque échéance (1h, 3h, 6h, 12h)
avec le **vent de l'échéance correspondante**, pas avec le vent courant figé.

- Semi-axe majeur (direction du vent) = ROS_head × durée
- Semi-axe mineur (flanc) = ROS_flank × durée
- Orientation : direction du vent
- Area : π × a × b (Ramanujan pour approximation)
- Périmètre : π × (3(a+b) - √((3a+b)(a+3b)))

---

## 7. Score de risque

### Référence

Décision de conception : `docs/RISK_SCORE.md`

### Implémentation

Fichier : `backend/app/science/risk_score.py`

### Deux scores séparés

**ignition_risk** [0, 100] : probabilité qu'un départ de feu survienne dans la cellule.

| Facteur | Poids | Source |
|---------|-------|--------|
| Coefficient local — facteur humain | 40% | Overpass (routes, campings) |
| Coefficient local — sécheresse | 25% | Open-Meteo / CFFWIS |
| FWI normalisé | 20% | CFFWIS |
| Coefficient local — combustible | 15% | BD Forêt, NDMI |

**spread_risk** [0, 100] : probabilité qu'un feu se propage rapidement dans la cellule.

| Facteur | Poids | Source |
|---------|-------|--------|
| ROS potentielle (FBP) | 30% | FBP |
| FWI normalisé | 25% | CFFWIS |
| Coefficient local — combustible | 25% | BD Forêt, NDMI |
| Coefficient local — sécheresse | 10% | Open-Meteo |
| Pente et exposition | 10% | RGE ALTI |

### Agrégation

Le score combiné affiché est **le maximum** des deux scores, avec mention
explicite du régime dominant (« départ » ou « propagation »).

### Décomposition

Chaque score est accompagné de la décomposition des contributions :
- nom du facteur
- valeur normalisée [0,1]
- contribution absolue (poids × valeur)
- pourcentage de la contribution totale

### Quality flags

Chaque réponse inclut un objet `quality` listant quelles sources étaient
disponibles à quel moment :
- `fwi_available`, `ros_fbp_available`, `ros_rothermel_available`
- `fuel_confidence` (high/medium/low)
- `local_coefficient_available`
- `data_age_hours`

---

## 8. Hypothèses non validées

> Ces hypothèses sont documentées ici pour transparence. Elles n'ont pas fait
> l'objet d'une validation de terrain et constituent les principales limites
> du modèle.

| # | Hypothèse | Impact | Priorité de résolution |
|---|-----------|--------|------------------------|
| H1 | La table de correspondance BD Forêt V2 → SB-40 / FBP n'a pas été validée sur le terrain en Gironde | Sous-estimation ou surestimation locale du combustible disponible | Haute — demande lever expert DFCI |
| H2 | La relation NDMI → humidité du combustible vivant est estimée par une fonction linéaire simple | Incertitude sur le facteur hydrique saisonnier | Haute — demande validation INRAE |
| H3 | La grille météo interpolée de 40-60 points vers 160 000 cellules suppose une continuité spatiale que les microclimats locaux ne vérifient pas | Lissage excessif des extrêmes | Moyenne |
| H4 | Les poids par défaut du coefficient local Gironde sont une proposition experte, non calibrée | Pondérations discutables | Haute — demande avis SDIS 33 / DFCI |
| H5 | Le modèle de propagation ne prend pas en compte les sautes de feu, le spotting, ni l'effet des secours | Sous-estimation drastique de la propagation réelle en conditions extrêmes | Non traité (limite fondamentale du domaine de validité) |
| H6 | La BD Forêt V2 peut avoir plusieurs années de retard par rapport à l'état réel | Couverture végétale non à jour | Moyenne — dépend du millésime disponible |

---

## 9. Références

1. Van Wagner & Pickett (1985). Equations and FORTRAN Program for the CFFWIS.
2. Forestry Canada (1992). Development and Structure of the FBP System.
3. Rothermel (1972). A Mathematical Model for Predicting Fire Spread in Wildland Fuels.
4. Scott & Burgan (2005). Standard Fire Behavior Fuel Models.
5. Alexander (1985). Estimating the Length-to-Breadth Ratio of Elliptical Forest Fire Patterns.
6. Byram (1959). Combustion of Forest Fuels.
7. Van Wagner (1977). Effect of Slope on Fire Spread.
8. Van Wagner (1987). Development and Structure of the CFFWIS.
9. EFFIS / JRC (2023). Fire Danger Forecast User Guide.
10. Anderson (1969). Heat Transfer and Fire Spread. USDA FS.
11. Andrews (2018). The Rothermel Surface Fire Spread Model. RMRS-GTR-371.
12. Trabaud (1990). Le comportement du feu dans les forêts de pin d'Alep.
13. Wotton (2009). A New Method for Expanding the CFFWIS. IJWF.
14. Argañaraz et al. (2015). Fuel classification for fire behaviour modeling.
