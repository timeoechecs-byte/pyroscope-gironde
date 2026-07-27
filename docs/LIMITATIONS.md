# PyroScope 33 — Limitations

> **Ce que cet outil ne sait pas faire.** Document à lire avant toute
> utilisation opérationnelle ou diffusion publique.

**Date** : 2026-07-27
**Projet** : PyroScope 33 — suivi et évaluation du risque d'incendie de forêt en Gironde

---

## 1. Limitations fondamentales (ne seront pas résolues)

### 1.1 Pas un système d'alerte

PyroScope 33 est un **outil de visualisation**, pas un système d'alerte.
Les détections satellite sont des **anomalies thermiques**, pas des incendies
confirmés. Leur latence est de 15 minutes à plusieurs heures, leur couverture
est limitée par les orbites polaires (4 à 8 passages par jour).

**En cas d'incendie** : appelez le **18** (pompiers) ou le **112** (urgences).
Consultez les sources officielles : SDIS 33, Préfecture de la Gironde,
Météo-France (Météo des Forêts).

### 1.2 Pas de prédiction de trajectoire

Le mode « simulation » est un **exercice pédagogique** qui calcule une
propagation théorique sur combustible homogène, sans relief, sans obstacles
autres que les routes et la Garonne, **sans intervention des secours**.
Il ne prédit pas où ira un feu réel.

### 1.3 Pas de feu de cime en conditions extrêmes

Le modèle FBP (Van Wagner) surestime les ROS modérés et sous-estime
drastiquement les ROS en conditions extrêmes (FWI > 40, vent > 50 km/h) car
il ne capture ni les sautes de feu, ni le spotting, ni la convection
verticale. Voir `docs/VALIDATION_2022.md` pour les écarts documentés sur
Landiras et La Teste-de-Buch.

### 1.4 Aucune valeur de probabilité

Le score de risque est un **indice 0-100** avec classe qualitative
(très faible → extrême). Il n'est **jamais** présenté comme une probabilité
d'incendie car nous n'avons pas de modèle calibré sur des observations
validées. Un pourcentage de probabilité serait scientifiquement faux et
dangereusement trompeur.

### 1.5 Aucune donnée fabriquée

Conformément à §C-05, toute valeur affichée provient d'une **mesure** ou
d'un **calcul documenté**. En l'absence de donnée, l'UI affiche
« donnée indisponible ». Aucune valeur par défaut, aucune interpolation
temporelle vers l'instantané, aucun mock.

---

## 2. Limitations de la donnée source

### 2.1 NASA FIRMS

| Limite | Détail |
|--------|--------|
| Couverture temporelle | 4-8 passages satellite/jour. Pas de détection continue. |
| Latence | 15 min (VIIRS) à 3h (MODIS) après détection |
| Fausses alarmes | Anomalies thermiques = pas un feu confirmé (fonderies, torchères, réflexions) |
| Confidence | `confidence` : low/nominal/high. Un « high » n'est pas une certitude. |
| Seuil de détection | Feux sous couvert dense ou de faible intensité (< 5 MW) peuvent ne pas être détectés. |

### 2.2 Open-Meteo / AROME HD

| Limite | Détail |
|--------|--------|
| Résolution spatiale | ~1.5 km (AROME HD). Pas de microclimat. |
| Horizon de prévision | 48 h maximum au-delà duquel le modèle ne soutient plus le calcul (§C-04) |
| Usage | Non commercial uniquement (CC BY 4.0) |
| Historique | ERA5 disponible, mais pas en temps réel |

### 2.3 Copernicus Sentinel-2

| Limite | Détail |
|--------|--------|
| Couverture nuageuse | NDVI/NDMI indisponible si couverture > 80 % |
| Revisite | 5 jours au nadir, moins sous latitude Gironde |
| Latence | De quelques heures à un jour pour L2A |
| Bande passante CDSE | Quota gratuit limité. Rate-limit instrumenté. |

### 2.4 IGN BD Forêt V2

| Limite | Détail |
|--------|--------|
| Millésime | Plusieurs années de retard possible |
| Résolution | Minimum 0.5 ha. Petites parcelles non cartographiées. |
| Essences | Classes regroupées. « Pin maritime » peut inclure d'autres résineux. |

### 2.5 Overpass API (OSM)

| Limite | Détail |
|--------|--------|
| Complétude | Données contributives. Campings, parkings, routes peuvent être incomplets. |
| Fraîcheur | Données quasi statiques, rafraîchissement mensuel suffisant. |
| Cache | Cache Redis 30 jours. Données non mises à jour en temps réel. |

---

## 3. Limitations du modèle

### 3.1 Domaine de validité du CFFWIS

Le FWI est un **indice de danger météo**, pas un indice de comportement du
feu. Il ne capture ni :
- l'effet du type de combustible et de son agencement vertical
- l'effet de la pente et de l'exposition
- l'effet des interventions humaines (débroussaillement, DFCI, secours)
- l'effet des sautes de feu et du spotting

### 3.2 Domaine de validité du FBP

Le FBP est calé sur des **essais en forêt boréale canadienne**.
Son application au **massif landais** (pin maritime, climat océanique) est
une **extrapolation** documentée dans `docs/FBP_VS_ROTHERMEL.md`.

Écarts constatés :
- Sous-estimation de 10-30 % en ROS de pointe en conditions extrêmes
- Non prise en compte des sols tourbeux (Landiras 2022)

### 3.3 Domaine de validité du coefficient local

Les poids par défaut du coefficient local Gironde sont une **proposition experte**
non calibrée. Ils sont éditables dans `config/local_coefficient.yaml`.
La renormalisation automatique en cas de facteur manquant est documentée
et signalée dans l'UI.

### 3.4 Précision de la grille

- Grille de calcul : 250 m en EPSG:2154
- Précision météo : interpolation de ~50 points vers ~160 000 cellules
- Le FWI à 250 m est une **fausse précision** : la donnée météo source n'a
  pas cette résolution. Ce choix est délibérément conservateur (grille fine
  de travail, mais incertitude spatiale affichée dans les quality flags).

---

## 4. Limitations opérationnelles

### 4.1 Environnement Freebuff (preview)

L'environnement Freebuff exécute uniquement le frontend (Node.js + React).
Le backend Python n'est pas disponible. Toutes les couches de données
affichent « Backend non connecté ». Aucune donnée mockée n'est utilisée pour
simuler l'absence de backend.

### 4.2 Autonomie en cas d'absence de l'opérateur

Au-delà d'un seuil de retard (configurable, défaut 7 jours), l'application
bascule en mode dégradé explicite. Un bandeau « données non mises à jour
depuis X jours » est affiché. Les scores de risque ne sont pas calculés sur
des trous.

### 4.3 Pas d'alerte de sécurité

Les notifications utilisateur sont **informatives, sans garantie de délivrance**.
Elles ne remplacent pas les canaux officiels (18/112, SDIS 33, préfecture).

---

## 5. Limitations réglementaires

### 5.1 Pas de vigilance officielle

L'indice PyroScope 33 est **différent** de la Météo des Forêts de Météo-France.
Les codes couleur et le vocabulaire sont distincts pour éviter toute confusion.

### 5.2 Responsabilité

L'éditeur décline toute responsabilité en cas d'utilisation opérationnelle
de l'outil. L'application est fournie « en l'état », sans garantie.

---

## 6. Limitations géographiques (PHASE 7+)

### 6.1 Périmètre actuel

Gironde (33) uniquement. Extensions vers les Landes (40) et le Lot-et-Garonne
(47) conditionnées à un socle technique et une demande identifiée.

### 6.2 Non prise en compte

- Feux hors Gironde (même à moins de 1 km de la limite départementale)
- Massif des Pyrénées, Corse, Sud-Est (régimes de feu différents)
- Zones urbaines denses (modèle combustible non adapté)

---

## 7. Éléments exclus du périmètre v1

Ces limitations sont volontaires et documentées dans `docs/BACKLOG.md` §3 :

- Webcams publiques + vision par ordinateur
- Blitzortung (foudre)
- LLM dans le calcul du risque
- Horizons au-delà de 48 h
- Grille FWI à 250 m (fausse précision)
