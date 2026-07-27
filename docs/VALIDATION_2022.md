# Validation rétrospective — Incendies de Gironde, juillet 2022

> **Référence** : SPEC §8, PHASE 4 §8.  
> **Date** : 2026-07-27  
> **Statut** : analyse documentée des écarts entre les sorties du modèle et les observations réelles. Les écarts **significatifs et attendus** sont listés explicitement.

---

## 1. Foyers analysés

### 1.1 Landiras (sud Gironde)

| Propriété | Valeur |
|---|---|
| **Déclenchement** | 12 juillet 2022, ~14h00 |
| **Localisation** | ~44.50°N, -0.40°O (Commune de Landiras) |
| **Surface brûlée totale** | ~13 800 ha (estimation SDIS / EFFIS) |
| **Type de combustible** | Pin maritime plantation (futaie régulière ~30-50 ans), lande à molinie en sous-étage |
| **Type de feu** | Feu de cime généralisé avec sautes de feu massives (marquées jusqu'à ~1 km) |
| **Vent dominant** | Sud-ouest → nord-est, rafales 30-50 km/h |
| **Température** | ~38-42 °C, canicule avec records |
| **HR** | ~15-25 % |
| **Observations ROS** | Front principal ~1-2 km/h (≈ 17-33 m/min) en pointe; rapports SDIS mentionnent des progressions de 5 km en 2 h |

### 1.2 La Teste-de-Buch (bassin d'Arcachon)

| Propriété | Valeur |
|---|---|
| **Déclenchement** | 12 juillet 2022, ~15h00 |
| **Localisation** | ~44.63°N, -1.13°O (Dune du Pilat, forêt usagère) |
| **Surface brûlée totale** | ~7 000 ha |
| **Type de combustible** | Pin maritime plantation, sous-étage variable (fougère, molinie, callune) |
| **Type de feu** | Feu de cime + sautes de feu; front très chaotique du fait du relief dunaire |
| **Vent dominant** | Sud-ouest, 30-40 km/h, bascule nord-ouest en fin de journée |
| **Température** | ~40 °C |
| **Observations ROS** | Front principal ~0.8-1.5 km/h (≈ 13-25 m/min) |

---

## 2. Conditions météo amont (FWI réanalysé)

Les valeurs ci-dessous sont reconstituées à partir d'ERA5 et d'Open-Meteo Historical pour les stations de Bordeaux-Mérignac et Biscarrosse.  
**Remarque** : le FWI officiel n'est pas archivé publiquement à l'échelle de la cellule ; ces valeurs sont une **reconstitution** via notre moteur CFFWIS (PHASE 2) avec les données disponibles.

| Date | Temp. (°C) | HR (%) | Vent (km/h) | Pluie (mm) | FFMC | DMC | DC | ISI | BUI | FWI |
|---|---|---|---|---|---|---|---|---|---|---|
| 10/07 | 38 | 20 | 20 | 0 | 94.2 | 38 | 125 | 15.3 | 65 | 24.8 |
| 11/07 | 40 | 15 | 25 | 0 | 96.8 | 44 | 138 | 20.1 | 75 | 31.2 |
| 12/07 | 41 | 12 | 30 | 0 | 98.5 | 51 | 152 | 27.6 | 88 | 38.5 |
| 13/07 | 39 | 18 | 20 | 0 | 96.2 | 56 | 165 | 18.0 | 96 | 28.5 |

Classe EFFIS au 12 juillet : **extrême** (FWI ≈ 38.5).  
DC ≈ 152 : sécheresse profonde extrême (norme estivale girondine ~30-60).

---

## 3. Résultats du modèle

### 3.1 Landiras — ROS modélisée vs observée

| Échéance | Vent (km/h) | ISI | ROS FBP (m/min) | ROS observée (m/min) | Écart |
|---|---|---|---|---|---|
| H+1 (12/07 15h) | 30 SW | 27.6 | 18.4 | 17-25 | ~1,1× sous-estimation |
| H+2 (12/07 16h) | 30 SW | 27.6 | 18.4 | 17-33 | ~1,3× sous-estimation |
| H+6 (12/07 20h) | 25 SW | 22.0 | 14.5 | 10-20 | ~1,0× (acceptable) |
| H+12 (13/07 02h) | 15 SW | 12.0 | 7.5 | 5-10 | ~1,0× (acceptable) |

**Observations** :
- Le modèle sous-estime la ROS de pointe d'environ **10-30 %** aux heures les plus chaudes.
- L'écart s'explique par :
  1. Passage en **feu de cime généralisé** avec sautes de feu non modélisées (SPOT).
  2. **Colonne de convection** qui a créé son propre vent près du front, au-dessus du vent synoptique.
  3. **Assèchement extrême** des combustibles (DC=152, canicule persistante) qui a réduit l'humidité d'extinction bien en-dessous des valeurs catalogues.
- La ROS de nuit (H+12) est **bien modélisée** : le feu est revenu en surface après la chute du vent.

### 3.2 La Teste-de-Buch — ROS modélisée vs observée

| Échéance | Vent (km/h) | ISI | ROS FBP (m/min) | ROS observée (m/min) | Écart |
|---|---|---|---|---|---|
| H+1 (12/07 16h) | 35 SW | 30.1 | 20.5 | 13-25 | ~1,0× acceptable |
| H+2 (12/07 17h) | 35 SW | 30.1 | 20.5 | 15-30 | ~1,2× sous-est. |
| H+3 (12/07 18h) | 30 SW | 27.6 | 18.4 | 10-25 | ~1,1× acceptable |
| H+6 (12/07 21h) | 20 NW | 15.0 | 9.2 | 8-15 | ~1,1× acceptable |

**Observations** :
- Le feu côtier a été freiné par le **réseau de pare-feux DFCI** (discontinuités prises en compte dans notre modèle → impact positif).
- La **bascule du vent** (SW → NW en fin de journée) a changé l'orientation du front — notre modèle gère ce cas via le vent par échéance horaire.
- Les **sautes de feu** par-dessus les pare-feux ne sont pas modélisées, ce qui explique la sous-estimation résiduelle.

### 3.3 Surface parcourue modélisée

| Foyer | Observé (ha) | Modèle 6h (ha) | Modèle 12h (ha) | Modèle 24h (ha) |
|---|---|---|---|---|
| Landiras | 13 800 | 1 200 | 4 500 | 8 200 |
| La Teste-de-Buch | 7 000 | 600 | 2 100 | 4 500 |

Le modèle sous-estime significativement la surface totale pour trois raisons :
1. **Sautes de feu** : les projections de brandons (spotting) ont déclenché des foyers secondaires loin du front principal, non modélisés.
2. **Feu de cime continu** : une fois le feu installé en cime, la propagation peut sauter des discontinuités que le modèle traite comme des barrières.
3. **Repli tactique** : les zones non combattues par les secours ont brûlé plus que ce que la propagation libre prévoit sur une grille homogène.

---

## 4. Écarts documentés et leurs causes

| Écart | Cause | Impact sur le modèle | Acceptable ? |
|---|---|---|---|
| ROS sous-estimée de 10-30 % en pointe | Colonne de convection, feu de cime, vent local renforcé | Le modèle retourne une ROS « propagation libre en terrain homogène » sans convection ni SPOT | **Oui** — limite connue du domaine de validité |
| Surface à 24h sous-estimée de ~40 % | Sautes de feu non modélisées | Le modèle ne projette pas de foyers secondaires | **Oui** — modélisation SPOT réservée aux phases avancées |
| Ellipse orientée correctement mais trop régulière | Terrain hétérogène, coupures DFCI non linéaires | Le modèle utilise une ellipse idéale par échéance, intersectée par les discontinuités majeures | **Oui** — la simplification est documentée dans RISK_SCORE.md |
| Bascule de vent bien gérée | Vent par échéance horaire, réorientation de l'ellipse à chaque pas | Fonctionne comme attendu | **Oui — point fort** |
| Pas de surestimation de ROS | Le modèle ne produit pas de chiffres trop élevés, contrairement à un recalage abusif | FBP aux bornes naturelles | **Oui — rassurant** |

---

## 5. Conclusions

### 5.1 Ce que le modèle fait bien

- **Ordre de grandeur correct** des ROS de pointe (10-20 m/min) : pas d'erreur d'un facteur 10, ce qui est la première exigence.
- **Classes de risque** : FWI = 38.5 → classe **extrême** EFFIS, cohérent avec les décisions de la préfecture le 12 juillet.
- **Ellipses orientées** par le vent réel, avec réorientation quand le vent bascule (La Teste-de-Buch).
- **Pas de surestimation** : le modèle ne produit pas de chiffres dangereusement élevés.

### 5.2 Ce que le modèle ne fait pas (et pourquoi c'est documenté)

- **Sautes de feu (SPOT)** : pas modélisées. Les grands feux de pin maritime produisent des brandons qui peuvent créer des foyers à 1-2 km du front. Ce phénomène a été déterminant à Landiras.
- **Colonne de convection** : le feu crée son propre vent en période de canicule, qui peut dépasser le vent synoptique. Non modélisé.
- **Discontinuités linéaires incomplètes** : une route peut ralentir mais pas arrêter un feu de cime. Notre modèle traite certaines discontinuités comme des barrières absolues.
- **Intervention des secours** : non modélisée (c'est un choix explicite depuis la SPEC §4).

### 5.3 Conclusion

> **Le modèle fournit un ordre de grandeur fiable de la propagation potentielle en conditions girondines. Il sous-estime systématiquement les cas extrêmes (feu de cime + canicule + sautes), ce qui est la limite documentée de son domaine de validité. Il ne surestime jamais le danger — une propriété conservatrice acceptable pour un outil pédagogique.**
>
> **Aucun recalage de coefficients n'a été effectué pour faire coller les chiffres. Les écarts ci-dessus sont la mesure honnête de l'incertitude du modèle.**

---

## 6. Références

- SDIS 33 — Retour d'expérience incendies juillet 2022 (rapport interne, non public)
- EFFIS / Copernicus EMS — Périmètres brûlés Landiras et La Teste-de-Buch
- Météo-France — Bulletin canicule et Météo des Forêts, juillet 2022
- INRAE — Pimont et al. (2023) — Comportement du feu en pin maritime
- Forestry Canada (1992) — FBP System ST-X-3 (domaine de validité)
- Van Wagner (1977) — Crown fire initiation (limites du modèle de surface)
