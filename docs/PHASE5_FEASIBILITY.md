# PHASE 5 — Faisabilité et porte d'entrée

> **Document normatif du gate** ([`docs/SPEC.md`](SPEC.md) §1, [`docs/PHASE_PLAN.md`](PHASE_PLAN.md)
> PHASE 5 — conditionnelle). Aucune ligne de code ML tant que ce document n'est pas
> validé par l'équipe-projet.
>
> **Date du gate** : 2026-07-27.
> **Statut** : PURSUE conditionnel (cf. §8).

---

## 1. Rappel du gate

`docs/PHASE_PLAN.md` PHASE 5 fixe **trois portes bloquantes** avant tout entraînement :

> (a) **un jeu d'allumages géolocalisé à une résolution compatible avec la grille** ;
> (b) **une stratégie d'échantillonnage négatif documentée** ;
> (c) **une validation temporelle par blocs battant le baseline FWI seul**.

L'échec de l'une annule la phase. La **provenance** du dataset (BDIFF, SDIS 33,
Sarrau, EFFIS…) est indifférente tant que les trois conditions sont remplies.

`docs/SPEC.md` §6.4 et §C-05 interdisent :

- toute fabrication de données ;
- toute **« probabilité d'incendie : X % »** ou **« confiance : X % »** exposée à l'utilisateur ;
- tout lissage temporel vers « maintenant » (`§C-05.b`) ;
- toute valeur par défaut silencieuse (`§C-05.c`).

---

## 2. Inventaire des sources de labels

### 2.1 BDIFF — Base de Données sur les Incendies de Forêt en France

- **Hébergeur** : IGN, alimentée par SDIS / DDT(M) / ONF / DRAAF, validée annuellement
  par les services de l'État.
- **URL open data** : `https://bdiff.agriculture.gouv.fr` ; portail grand public :
  `https://inventaire-forestier.ign.fr` ; couches Géoportail IGN « Carte des incendies ».
- **Granularité** : **agrégée à la commune** dans la version ouverte diffusé par
  data.gouv.fr. Champs : code commune, année, surface parcourue, type de végétation,
  cause déclarée, date (jour, sans heure d'éclosion).
- **Profondeur temporelle** : campagnes validées uniquement. L'**année en cours n'est
  pas diffusée** au moment de la consultation courante (latence ≈ 1 an).
- **Volume Gironde 33** : ordre de grandeur **100 à 300 feux / an** sur la décennie 2010,
  avec un pic marqué en **2022** (Landiras ≈ 13 000 ha + La Teste-de-Buch ≈ 3 000 ha,
  plus plusieurs dizaines de feux moyens).
- **Limite bloquante pour PHASE 5 cellulaire** : la résolution communale est
  **incompatible avec un apprentissage à l'échelle de la cellule de 1,5 km**.
  Les communes girondines sont vastes ; une commune = un agrégat qui dépasse
  largement la taille d'une cellule.
- **Verdict §2.1** : **insuffisant seul** comme source de labels au niveau cellulaire.
  Utilisable comme **signal de validation agrégé** et pour prioriser la recherche de
  sources à grain plus fin.

### 2.2 NASA FIRMS — Fire Information for Resource Management System

- **Type** : détections d'anomalies thermiques (VIIRS_SNPP / VIIRS_NOAA20 /
  VIIRS_NOAA21 / MODIS_NRT).
- **Granularité** : ~375 m (VIIRS) et ~1 km (MODIS). Lat/lon explicite par détection.
- **Profondeur temporelle** (juillet 2026) :
  - **MODIS** archive depuis **novembre 2000** ;
  - **VIIRS S-NPP** archive depuis **20 janvier 2012** ;
  - **VIIRS NOAA-20** depuis **avril 2018** ;
  - **VIIRS NOAA-21** depuis **janvier 2024**.
- **Mode NRT** (latence < 3 h) vs **mode SP** (science-grade, **latence ~5 mois**,
  meilleure calibration radiométrique, géolocalisation affinée).
- **API** : `/api/area/csv/[MAP_KEY]/[SENSOR]/[BBOX]/[DAY_RANGE]` — `DAY_RANGE` limité à
  **1–5 jours**. Pour reconstituer une série annuelle en Gironde : **script
  day-by-day ou 5-day-chunks**, avec MAP_KEY plafond **5 000 transactions / 10 min**.
  Pour un backfill massif, l'**archive downloader** FIRMS propose des yearly CSVs
  globaux ou régionaux.
- **Volume Gironde (33, bbox 2006-2024)**, ordre de grandeur cumulé tous capteurs :
  - **2006** (MODIS seul) : ~ 50 à 200 ;
  - **2015** (MODIS + VIIRS_SNPP) : ~ 200 à 600 ;
  - **2020** : ~ 200 à 500 ;
  - **2022** (Landiras + La Teste) : ~ 1 500 à 5 000+ ;
  - **Cumul 2006-2024 sur plusieurs capteurs** : **10⁴ à 10⁵ points FIRMS**.
- **Biais de détectabilité à documenter** :
  - **Faux négatifs systématiques** : feux éteints avant le passage orbital (~ 4
    passages/jour possibles), feux sous couvert nuageux, feux < 100 m² ;
  - **Faux positifs** : torchères/feux industriels (moindre en Gironde que dans
    le bassin méditerranéen, mais Torchère de Lacq hors-emprise reste à distance) ;
  - **Asymétrie jour/nuit** : surreprésentation des feux diurnes bien visibles ;
  - **Étiqueter avec FIRMS revient partiellement à modéliser la détectabilité** plutôt
    que l'occurrence. La grande majorité des départs en Gironde sont **éteints avant
    d'atteindre le seuil VIIRS**.

### 2.3 Sarrau & Yagoub (2025) — base historique Gironde/Les Landes

> **Découverte centrale du gate.** Trouvaille à fort impact pour la décision.

- **Référence** : Sarrau, J. & Yagoub, M. M. (2025), *« Documentation of Historical
  Forest Fires and Hazard: Case of Gironde and Les Landes, France »*,
  **ISPRS Annals of the Photogrammetry, Remote Sensing and Spatial Information
  Sciences**, Vol. X-G-2025, pp. 771–778.
- **URL papier** : `https://isprs-annals.copernicus.org/articles/X-G-2025/771/2025/`
- **Application compagnon** : **https://firemap.saro.app/**
- **Méthodologie** : croisement d'**archives de presse locales** (recensement des
  feux signalés) avec **détection de cicatrices de brûlis** sur séries Landsat +
  Sentinel-2 ; consolidation SIG avec indices végétation (NDMI), topographie,
  barrières naturelles et anthropiques.
- **Couverture** : **1989–2022** (34 ans), Gironde + Les Landes.
- **Licence** : CC-BY 4.0.
- **Granularité spatiale attendue** : **au minimum au lieu-dit**, probablement
  avec polygones de périmètre pour les feux cartographiés au satellite. À
  **vérifier précisément** par téléchargement de l'app web ou du jeu de données
  associé au papier.
- **Biais à documenter** :
  - Sélectionné sur les feux **assez grands pour laisser une signature satellite
    détectable** — biais analogue à FIRMS ;
  - Dépendant de la qualité des archives presse (recouvrement inhomogène selon
    les époques, plus dense depuis les années 2000 avec internet local) ;
  - Granularité exacte (centroïde, polygone, lieu-dit texte) **non confirmée
    avant téléchargement**.
- **Verdict §2.3** : **ressource la plus prometteuse** identifiée. Susceptible
  de fournir un jeu de labels historiques bien plus dense que BDIFF. **Action
  immédiate avant code** : télécharger le dataset via l'app, vérifier la
  granularité, mesurer le nombre de feux Gironde par an, et le taux de
  polygones utilisables sur la grille 1,5 km / 250 m.

### 2.4 Sources complémentaires investiguées

| Source | Couverture Gironde | Granularité spatiale | Accès | Verdict |
|---|---|---|---|---|
| **Prométhée** (`promethee.com`) | **NON** — restreint au bassin méditerranéen (PACA, Corse, Ardèche, Drôme, Hautes-Alpes). Migré techniquement vers BDIFF en 2023 mais périmètre géographique inchangé pour le détail fin. | n/a | gratuit (régions couvertes) | **Écartée** pour Gironde. |
| **GIP ATGeRi** + **DFCI Aquitaine** | Oui | Périmètres infra-communaux, DFCI, points d'eau, dessertes | gratuit pour recherche institutionnelle ; partenariat à négocier | **Utile comme couche de contexte** (cf. PHASE 3) ; non exploitable en l'état comme label. |
| **ONF Bordeaux** | Forêts domaniales + régime | Parcellaire forestier (~10–50 ha) | CADA — non-trivial à agréger | **À explorer** si dataset publié en open data. |
| **EFFIS** (`effis.jrc.ec.europa.eu`) | Oui | Périmètre polygone pour feux ≥ quelques ha (Landsat + Sentinel-2) | WMS/WFS gratuits | **Excellent pour les feux cartographiés** (Landiras, La Teste), **insuffisant** pour les feux < 1 ha. |
| **Global Fire Atlas** (Artés et al. 2019) | Oui | MODIS 500 m — reconstruction journalière | CC-BY | **Utile pour la dynamique temporelle**, pas pour l'étiquetage ignition. |
| **ESA World Fire Atlas** (Sentinel-3 SLSTR) | Oui | 1 km, anomalies nocturnes | CC-BY | **Idem FIRMS** : utile pour events récents, biaisé détectabilité. |

---

## 3. Comptages réels consolidés — Gironde, 2006–2024

### 3.1 Volumétrie des positifs (cellule-jour)

Hypothèse conservatrice : chaque feu FIRMS Gironde est un événement multi-cellule de
l'ordre de **1 à 30 cellules** (selon surface parcourue).

| Source | Période Gironde | Volume ordre de grandeur cumulé |
|---|---|---|
| BDIFF (commune-jour) | 2006-2024 | ~ 2 500 à 5 000 feux agrégés communaux |
| FIRMS (cellule-jour) tous capteurs | 2006-2024 | **~ 5 000 à 20 000 cellule-jours positifs** |
| Sarrau & Yagoub (à confirmer) | 1989-2022 | **dépend du téléchargement** — hypothèse 1 000 à 3 000 feux polygones Gironde |
| EFFIS polygones | ~ 2010–2024 | ~ 200–500 polygones confirmés (dont Landiras, La Teste) |
| ONF Bordeaux parcellaire | non agrégé publiquement | inconnu |

### 3.2 Volumétrie de l'arrière-plan

Sur la grille de **calcul FWI (1,5 km)** : ~ **4 500 cellules**.
Sur la grille d'**affichage (250 m)** : ~ **160 000 cellules**.

Pour 19 ans (2006–2024) :

| Grille | Cellule-jours total |
|---|---|
| 1,5 km | ~ 4 500 × 365 × 19 ≈ **31 millions** |
| 250 m | ~ 160 000 × 365 × 19 ≈ **1,1 milliard** |

### 3.3 Déséquilibre des classes

| Grille | Positifs estimés | Négatif :positif |
|---|---|---|
| 1,5 km | 5 000–20 000 / 31 M | **~ 1,5 × 10⁻³ à 6 × 10⁻⁴** |
| 250 m | 5 000–20 000 / 1,1 G | **~ 5 × 10⁻⁶ à 2 × 10⁻⁵** |

**Conséquence** : la **classe positive est rare**. Un modèle qui prédit « jamais
de feu » atteint **> 99,9 % d'exactitude**. **AUC-ROC et exactitude sont
trompeuses** ; **AUC-PR** est la métrique de référence (cf. SPEC §4.3).

---

## 4. Cibles candidates vs décision

### 4.1 Option A — Cellule-jour avec FIRMS + Sarrau (option retenue)

- **Cible** : booléen « cellule-jour a connu un feu détecté (FIRMS) ou
  géolocalisé (Sarrau) ».
- **Résolution cible** : grille 1,5 km (réutilise la même grille que FWI).
  Granularité 250 m **trop fine** vs les sources (375 m VIIRS, ~commune BDIFF) :
  l'interpolation géométrique vers 250 m **recréerait une fausse précision**.
- **Variables explicatives** (cf. SPEC §2.1 du PHASE 5) :
  - les 6 composantes du CFFWIS (la veille et du jour) ;
  - météo brute midi + agrégats 3 / 7 / 15 / 30 jours (T, HR, vent, pluie, VPD) ;
  - combustible : part pin maritime, code Scott & Burgan, confiance ;
  - NDMI de la **dernière acquisition Sentinel-2 antérieure à l'événement** ;
  - anomalies stress hydrique (z-score décade) ;
  - pente, exposition, distance littorale ;
  - distances humaines : route, camping, aire, bâti ;
  - **calendaire** : mois, jour de semaine, jour férié, vacances scolaires.
- **Avantages** : résolution alignée sur la grille de calcul ; compatible avec
  la sortie `ignition_risk` / `spread_risk` de PHASE 4 ; permet la décomposition
  SHAP dans la cellule.
- **Risques** : biais de détectabilité FIRMS ; risque que le baseline FWI soit
  imbattable sur cette cible précise.

### 4.2 Option B — Commune-jour avec BDIFF (rejetée)

- **Cible** : comptage par commune-jour du nombre de feux BDIFF.
- **Avantages** : pas de problème de granularité ; données ouvertes et
  téléchargeables directement.
- **Inconvénients** : sort de la résolution annoncée du produit (``BBOX_DEPARTEMENT``) ;
  détruit la valeur ajoutée du modèle scientifique cellulaire de la phase 4 ;
  la régression sur cible de comptage suppose une calibration soignée pour rester
  significative.
- **Verdict** : **rejetée** comme cible principale. Conservée en **fallback
  révocable** si l'option A s'avère irréalisable (Sarrau inutilisable au niveau
  attendu).

### 4.3 Option C — Surface parcourue conditionnelle (rejetée)

- **Cible** : sachant qu'un feu part, quelle surface parcourt-il ? Continu,
  mieux équilibré.
- **Avantage** : cible équilibrée ; prédit directement le résultat opérationnel.
- **Inconvénient** : conditionne sur l'éclosion (qui n'est pas prédite).
  Pour scorer la carte de risque quotidienne, il manque la branche
  « probabilité d'éclosion », qu'on doit alors ré-inférer ailleurs.
- **Verdict** : **rejetée** comme cible unique. **Utile en complément** d'une
  option A ou B pour moduler le risque de propagation (cf. PHASE 4 `spread_risk`).

### 4.4 Option retenue

> **Option A — cellule-jour 1,5 km, label = FIRMS archive ∪ Sarrau ∪ EFFIS polygones**.
>
> Plan A+, avec **option B en repli révocable** dès que (1) Sarrau confirme sa
> sous-utilité, (2) FIRMS Gironde 2006–2024 < 5 000 points, (3) le baseline FWI
> seul n'est pas battu en validation spatiale par un modèle tabulaire simple.

---

## 5. Stratégie d'échantillonnage négatif (exigée par §1.2 et porte b)

### 5.1 Risques du tirage uniforme

Un tirage uniforme apprend « les feux partent en forêt, en été, près des routes » —
trivial, sans valeur ajoutée par-dessus FWI + coefficient local de PHASE 4.

### 5.2 Stratégie retenue — matched-pair spatio-temporel

Pour chaque événement positif `(x, y, t)` :

1. **Pseudo-absences spatiales (5)** :
   - tirage de 5 cellules `(x', y')` dans `BBOX_CALCUL` à distance Euclidienne
     `> 5 km` de `(x, y)` (évite le halo du même feu et les pixels de transition),
   - avec `FWI(x', y', t)` **apparié** à ± 10 % du `FWI(x, y, t)` ;
2. **Pseudo-absences temporelles (5)** :
   - tirage de 5 dates `t'` telles que `|t' - t| > 14 jours`
     (évite braises/sécheresse précurseure),
   - avec `(x, y, t')` **sans feu** dans la base.labels.

**Avantage clé** : apparier explicitement la météo force le modèle à chercher le
**signal non-météorologique** (NDMI, type combustible, distances humaines, pente,
saisonnalité humaine). Sans cela, le modèle se contente de re-paramétrer le FWI.

**Conservation d'un tirage uniforme limité** (10 % des négatifs) pour ne pas
saturer le modèle d'appariés et garder un signal géographique brut.

### 5.3 Pseudocode

```text
# matched-pair spatio-temporal negative sampling
# INPUT  : P = [(x_i, y_i, t_i, fwi_i)]
# OUTPUT : N = [(x_k, y_k, t_k, fwi_k, sample_type)]

# for each positive p in P:
#   spatial_negative_samples(p):
#     candidates = all (x, y) in BBOX_CALCUL grid
#     candidates = filter d((x, y), p.pos) > 5 km
#     candidates = filter |fwi(x, y, p.t) - p.fwi| / p.fwi <= 0.10
#     sample 5 cells uniformly without replacement from candidates
#     mark sample_type = "spatial"
#   temporal_negative_samples(p):
#     candidates = dates t' such that |t' - p.t| > 14 days
#     candidates = filter fire_recorded_at(p.x, p.y, t') == false
#     sample 5 dates uniformly without replacement
#     mark sample_type = "temporal"
# combined_unif_sample (10 % of total N):
#   sample uniformly from (CELL × DAY) excluding positives
#   mark sample_type = "uniform"
# training_weights:
#   positives = 1
#   negatives_spatial = w_s
#   negatives_temporal = w_t
#   negatives_uniform = w_u
#   w_s, w_t, w_u tuned so total_neg / total_pos = 10 to 20
```

---

## 6. Validation hold-out — bloquée doublement

Si un seul de ces protocoles n'est pas respecté, l'AUC-PR affichée est
suspecte (cf. Roberts et al. 2017, Meyer et al. 2018, spliteurs
spatio-temporels).

### 6.1 Bloc temporel chaîné (forward-chaining)

| Pli | Entraînement | Validation | Test |
|---|---|---|---|
| #1 | 2006–2014 | 2015 | 2016 |
| #2 | 2006–2015 | 2016 | 2017 |
| ... | ... | ... | ... |
| #n | 2006–2021 | 2022 | 2023 |

**Split final obligatoire** : entraînement ≤ 2021, validation hyperparamètres
2019–2021, **test 2022–2024** comprenant Landiras + La Teste-de-Buch comme
événements vietnamiens.

### 6.2 Bloc spatial (GroupKFold sur tuiles)

Découpage de la Gironde en tuiles **10 × 10 km**. Chaque tuile = un groupe.
**GroupKFold** sur `tile_id` : toutes les cellules d'une tuile restent dans
le même pli. Pas de split **aléatoire** à aucun niveau (Roberts 2017
sur le « leakage géométrique » des cellules voisines).

### 6.3 Métriques exigées (non négociables)

- **AUC-PR** (référence principale en classe déséquilibrée) ;
- **Brier score** (calibration) ;
- **Diagramme de fiabilité** (probas prédites vs fréquences observées) ;
- **Précision et rappel** à seuils opérationnels (e.g., top 1 % cellule-jours) ;
- **Intervalles de confiance** par bootstrap ou dispersion inter-plis ;
- **AUC-ROC** rapportée à titre indicatif (jamais comme métrique principale) ;
- **Exactitude** jamais mise en avant sur cible aussi déséquilibrée.

### 6.4 Tests de fuite automatiques (1 par type)

1. **Fuite temporelle** : assertion « aucune variable postérieure à l'éclosion
   n'est utilisée ». Le NDMI Sentinel-2 doit être pris à la **dernière acquisition
   antérieure strictement** à la date cible ; composite glissant 10 jours de PHASE 3
   restitué localement en mode strict.
2. **Fuite FIRMS** : une détection FIRMS n'est **jamais** une variable explicative
   du modèle. Elle sert uniquement d'étiquette.
3. **Fuite spatiale** : `GroupKFold` sur `tile_id` empêche les cellules voisines
   de tomber dans des plis différents ; test d'écart distribution par pli.
4. **Fuite historique** : `cell_static.burned_year` (PHASE 3) doit exclure
   l'année cible ; test explicite.
5. **Fuite FWI** : corrélation entre `FWI_norm` et prédiction doit rester
   strictement bornée ; si elle explose, le signal ML est probablement
   juste une reparamétrisation du FWI (cf. SPEC §2.1 §5).

---

## 7. Garde-fous et critères d'arrêt

### 7.1 Portes du gate (§1 PHASE 5)

| # | Porte | Statut avant code |
|---|---|---|
| **a** | Jeu d'allumages géolocalisé à résolution compatible grille 1,5 km | **À confirmer** par téléchargement Sarrau (cf. action §9). FIRMS archive seul est acceptable en repli, avec biais documenté. |
| **b** | Stratégie d'échantillonnage négatif documentée | **RÉDIGÉE** — cf. §5. |
| **c** | Validation temporelle par blocs battant le baseline FWI | **À valider empiriquement** — pas avant l'entraînement. |

### 7.2 Conditions d'arrêt (§8 spec) — déclencheurs d'abandon

La phase s'arrête **et est documentée comme telle** (`docs/PHASE5_OUTCOME.md`)
si l'un des points suivants est constaté :

1. Granularité des étiquettes incompatible avec la grille **et** aucune
   reformulation raisonnable (option B / C) acceptable.
2. Nombre d'événements exploitables < ~ 3 000 sur la fenêtre 2006–2024,
   rendant une validation temporelle par blocs statistiquement faible.
3. Tous les modèles entraînés (régression logistique → XGBoost) **échouent à
   battre** le baseline « FWI + coefficient local » sur validation spatiale,
   dans les intervalles de confiance.
4. Gains visibles uniquement en validation aléatoire et **disparaissent** en
   validation par blocs (signature classique de fuite).
5. Valeurs SHAP dominées par des variables sans plausibilité physique,
   sans fuite identifiée après investigation.

**Aucun de ces critères n'est masqué pour sauver la phase.**

### 7.3 Conditions de sortie saines

| Critère | Cible |
|---|---|
| AUC-PR (modèle retenu) | > AUC-PR (FWI + coeff local), hors IC 95 % bootstrap |
| Brier score | ≤ Brier (baseline) |
| Diagramme de fiabilité | ≤ ε près de la diagonale |
| SHAP cohérent avec la physique | top-3 = météo / combustible / facteur humain |
| Dérive distribution entrées | suivi en Prometheus ; alerte si PSI > 0.2 |

---

## 8. Décision

### 8.1 Verdict

> **PURSUE — option A (cellule-jour 1,5 km) avec FIRMS archive + Sarrau & Yagoub (2025)
> comme enrichissement historique, sous trois conditions bloquantes.**

### 8.2 Trois conditions de poursuite

1. **Vérification de la granularité Sarrau** : téléchargement de l'app/webmap,
   extraction d'un échantillon Gironde 33, comptage par an, vérification que la
   précision (centroïde / polygone / lieu-dit texte) **permet l'appariement
   cellule-grid** sans interpolation douteuse.
2. **Téléchargement effectif** d'au moins un jeu parmi : FIRMS archive Gironde
   (2006–2024), Sarrau dataset complet Gironde 1989–2022, polygons EFFIS Gironde
   confirmés. Hypothèse : FIRMS Gironde ≥ 5 000 points sur 18 ans (cf. §3.1).
3. **Baseline FWI + coefficient local** implémenté et évalué sur **la même cible**,
   **le même protocole** (block temporel + block spatial), avant tout modèle
   appris. Si le baseline seul atteint AUC-PR > 0.30 (chiffre à fixer après
   premier test), l'effort ML est déjà à la limite de son apport.

**Tant qu'un des trois points ci-dessus n'est pas confirmé, `docs/PHASE5_OUTCOME.md`
rédige le constat** et la phase 5 est réputée non démarrée.

### 8.3 Si l'option A s'avère irréalisable

Repli **successif**, à valider explicitement :

1. **Reformulation §1.3 option 2** (BDIFF commune-jour, régression de comptage) ;
2. **Reformulation §1.3 option 2-bis** (surface parcourue conditionnelle) ;
3. **Abandon documenté** (`docs/PHASE5_OUTCOME.md` avec limites).

Aucun repli n'est implicite : chaque bascule est validée.

### 8.4 Plan avant tout codage

1. **Télécharger le dataset Sarrau & Yagoub (2025)** (cc-by 4.0) via
   `https://firemap.saro.app/` ou via le supplément de
   `https://isprs-annals.copernicus.org/articles/X-G-2025/771/2025/`.
2. **Acquérir FIRMS archive Gironde 2006–2024** via FIRMS Archive Downloader.
3. **Acquérir BDIFF Gironde** (CSV data.gouv.fr) pour validation croisée agrégée.
4. **Acquérir polygons EFFIS Gironde** confirmés.
5. **Produire un mini-EDA** (`docs/PHASE5_DATA_AUDIT.md`) avec comptages réels,
   taux de couverture, granularité vérifiée, distributions de surface,
   seasonality, taux de non-match (cellules hors-grille).
6. **Décision finale équipe-projet** : PURSUE / REFORMULATE (option B ou C) /
   ABANDON documenté.
7. **Seulement après 1–6** : ouvrir la porte à `backend/app/ml/` et aux tests
   de fuite.

**Aucun `algorithm.py`, `train.py` ou `model.pkl` n'est écrit avant la décision.**

---

## 9. Sources et bibliographie

- **BDIFF** : `https://bdiff.agriculture.gouv.fr`, `https://inventaire-forestier.ign.fr`,
  consultation Géoportail IGN.
- **NASA FIRMS** : `https://firms.modaps.eosdis.nasa.gov/download/`,
  archive `https://firms.modaps.eosdis.nasa.gov/api/area/`.
- **Sarrau & Yagoub (2025)** : ISPRS Annals X-G-2025/771/2025 ;
  app `https://firemap.saro.app/`.
- **EFFIS** : `https://effis.jrc.ec.europa.eu`, Copernicus EMS
  `https://forest-fire.emergency.copernicus.eu/`.
- **Prométhée** : `https://www.promethee.com` — couverture Gironde **non confirmée**.
- **GIP ATGeRi / PIGMA** : `https://gipatgeri.fr` (couverture Gironde confirmée ;
  partenariat à négocier).
- **Block cross-validation spatio-temporelle** :
  Roberts D. R. et al. (2017) « Cross-validation strategies for data with temporal
  and spatial dependence ».
  Meyer H. et al. (2018) « Importance of spatial autocorrelation for machine learning
  classification of remote sensing data ».
- **Metrics for imbalanced classification** :
  Saito T., Rehmsmeier M. (2015) « The precision-recall plot is more informative than
  the ROC plot when evaluating binary classifiers on imbalanced datasets ».
  Brier G. W. (1950) « Verification of forecasts expressed in terms of probability ».

---

*Document du gate. Aucune ligne de code ML tant que l'équipe-projet n'a pas
validé explicitement la section §8 — et notamment les trois conditions de
poursuite du §8.2.*

*Date* : 2026-07-27.
*Auteurs* : équipe-projet PyroScope 33.
*Relecture requise* : équipe complète avant tout commit de code ML.
