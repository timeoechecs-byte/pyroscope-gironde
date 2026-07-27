# Décision PHASE 4 — FBP primaire + Rothermel secondaire

> Document d'archivage de la décision. Mis à jour avec l'accord explicite de
> l'équipe-projet après analyse comparative des deux systèmes candidats.

**Statut** : validé — Scope B — **2026-07-27**.

---

## 1. Contexte

PHASE 4 de PyroScope 33 (cf. [`docs/PHASE_PLAN.md`](PHASE_PLAN.md)) requiert un
moteur de propagation du feu. Deux systèmes candidats, usuellement opposés :

- **Rothermel (1972) + Scott & Burgan (2005)** — standard américain (BehavePlus,
  FARSITE, la plupart des simulateurs de feux de surface).
- **Canadian Forest Fire Behaviour Prediction System (CFBPPS / Forest Fire
  Behaviour Prediction, FBP)** — co-développé par le Service canadien des forêts ;
  consomme **nativement** les indices **ISI** et **BUI** du CFFWIS (déjà calculés
  en PHASE 2).

La spec §1 demandait une analyse comparative **avant** toute ligne de code, suivie
d'une recommandation validée par l'équipe.

## 2. Verdict

> **FBP primaire ; Rothermel secondaire. Scope B validé le 2026-07-27.**

Justification : voir §3 ci-dessous; nuances : voir §4.

## 3. Quatre arguments en faveur du FBP primaire

### A1 — ISI et BUI sont des **entrées natives** du FBP

FBP exige `isi`, `bui`, `fuel_type` (`cffdrs.fbp()` en Python, `cffdrs::fbp()` en
R). **PHASE 2 produit déjà ISI et BUI** validés contre `cffdrs::test_fwi.csv`
(cf. décision Phase 2 du journal, [`docs/SPEC.md`](SPEC.md)). Aucune
transformation, aucun bridging empirique, aucun risque d'erreur systématique à
l'interface.

À l'inverse, Rothermel exige des classes de combustible par taille de particules
(1-h, 10-h, 100-h, live herb, live woody — table Scott & Burgan). Mappables à
partir du FFMC et DMC du CFFWIS, ces mappings ne sont **pas publiés pour le
pin maritime landais**. Risque d'erreur systématique non négligeable.

### A2 — Feu de cime **natif** dans le FBP

Les feux girondins de juillet 2022 (Landiras ≈ 12 000 ha, La Teste-de-Buch
≈ 3 000 ha) étaient dominés par un **passage en feu de cime généralisé**. Sans
modélisation de ce passage, le ROS et la surface parcourue sont sous-estimés
d'un facteur typique **5 à 10×** par rapport à l'observé. **Ce n'est pas un
débat : c'est une limitation structurelle de Rothermel-only.**

FBP implémente la transition **surface / intermittent / cime** via le SFC
(Surface Fire Crown), l'OAFCC (Open Active Fire Crown Containment) et la
fraction de cime (CFL) propre à chaque type de combustible. **C-6 *Conifer
Plantation*** inclut un CFL adapté aux futaies résineuses denses et régulières
— c'est précisément la structure du pin maritime landais.

Rothermel nécessite une **extension Van Wagner 1977 / Philpot 1973** au-dessus
du modèle de surface — code supplémentaire, calibrations nord-américaines, et
risque de divergence méthodologique.

### A3 — C-6 *Conifer Plantation*, un argument **structurel**, pas statistique

Description officielle (Forestry Canada Fire Danger Group C-6) :

> *planted conifer stand, dense, regular structure, low to moderate understory,
> 70-90 % crown closure.*

Cette description correspond point par point à une parcelle de pin maritime
landais de 30-50 ans. C'est un **type de combustible conçu** pour cette
structure.

À l'inverse, Scott & Burgan 40 a été publié pour les woodlands nord-américains.
Le mapping BD Forêt V2 → SB40 dans la config `fuel_models.yaml` est explicitement
une **hypothèse d'expert** par défaut `confidence: low` (cf. PHASE 3 §1.3 +
[`docs/FUEL_MODELS.md`](FUEL_MODELS.md)).

### A4 — Quantification d'incertitude **honnête** via inter-modèle

Lancer FBP **et** Rothermel en parallèle et comparer leur ROS est une
quantification d'incertitude scientifiquement défendable **sans calibration
supervisée**. La dispersion entre les deux modèles est affichée à l'UI comme
une bande colorée entre les ellipses — c'est l'incertitude du modèle, pas un
chiffre fabriqué.

Par contraste, Rothermel seul n'a pas cette bande ; FBP seul non plus. Mais
l'**accord ou le désaccord** des deux est l'estimation la plus honnête
qu'on puisse faire tant que PHASE 5 (ML calibrée) n'est pas engagée.

## 4. La nuance — bibliographie française non vérifiée

**Lacune précise** : aucune cross-validation FBP-C-6 spécifique Landes de
Gascogne n'est identifiée dans la base de connaissances disponible. La
littérature méditerranéenne sur *Pinus halepensis* (Rigolot, Dupuy, Pimont,
INRAE / ECOPLUS) traite de peuplements structurellement analogues sur
d'autres essences et d'autres contextes.

**Décision de gestion du risque** : Scope B retenu **malgré** l'absence de
cross-validation française. Une clause de revue post-PHASE 6, lorsque la
communauté INRAE aura publié ses post-mortem 2022, est consignée dans
[`docs/PHASE_PLAN.md`](PHASE_PLAN.md).

**Actionnable** : un appel à `researcher-web` ciblé sur INRAE/ECOPLUS/INERIS pour
rattacher une bibliographie peer-reviewed peut réduire cette lacune avant
PHASE 5.

## 5. Trois scopes possibles — matrice coûts/bénéfices

| Scope | Livré | Effort | Bénéfice |
|---|---|---|---|
| **A.** FBP seul | C-6 Conifer Plantation par défaut ; fallback C-7 si lande/jeune peuplement. Réimplémentation testée contre `cffdrs`. | ~ 5 j engineering + 1 j tests | 95 % de l'usage. |
| **B.** FBP + Rothermel secondaire (*retenu*) | A + Scott & Burgan 40 mapping `cell_static.pine_maritime_pct` (PHASE 3 `config/fuel_models.yaml`) + réimplémentation testée contre `pyrolog` BehavePlus-series. Affichage des deux ellipses côte à côte avec dispersion en couleur. | ~ 9-10 j | Bande d'incertitude inter-modèle visible. |
| C. FBP + Rothermel + méditerranéen (Pimont-Dupuy adaptation) | B + paramétrisation méditerranéenne documentée pour pin maritime, si elle existe peer-reviewed | ~ 14-18 j ; dépend de la bibliographie | Le plus rigoureux, hors-phasage si la validation française ne livre pas. |

**Scope retenu** : B (FBP primaire + Rothermel secondaire).

## 6. Implémentation de référence

**`cffdrs` Python package** (Canadian Forest Service, maintenu, R et Python). À
utiliser comme dépendance OU comme référence de tests ; la règle du projet est
**« aucune constante sans référence citée en commentaire »** (publication,
numéro d'équation, tableau). Le test `cffdrs` couvre ses propres cas de
référence — rejouables côté projet.

Pour Rothermel : `pyrolog` (Python) ou réimplémentation testée contre
BehavePlus 6-series ou Andrews 2018 RMRS-GTR-371.

## 7. Hypothèses conservées tant que PHASE 5

- **Pas de calibration supervisée** : les poids `config/local_coefficient.yaml`
  sont des valeurs d'expert (`confidence: high|medium|low`). La PHASE 5 peut
  les remettre en cause avec un dataset étiqueté ignitions/non-ignitions.
- **Pas de stochasticité Monte-Carlo** : l'incertitude est gérée par
  inter-model dispersion (FBP vs Rothermel) et/ou intervalle météo entre
  modèles (Open-Meteo multi-modèles).
- **Pas de saut direct : les modèles ne sont pas modifiés en production**
  sans validation explicite.

## 8. Ce qui est gelé tant que validation

- Pas de `backend/app/science/rothermel.py`.
- Pas de `backend/app/science/fbp.py`.
- Pas de coefficients FBP / Rothermel constants dans le code Python.
- Seuls les **docs** (`docs/FBP_VS_ROTHERMEL.md`, [`docs/RISK_SCORE.md`](RISK_SCORE.md))
  et le **YAML** (`config/local_coefficient.yaml`) sont livrés, tant que
  l'équipe-projet n'a pas re-vu et validé ces fichiers.

## 9. Suite PHASE 4

Une fois les `docs` et le YAML relus et validés :

1. Démarrer la recherche de l'implémentation Python `cffdrs` (état actuel,
   version installée, vitesse d'exécution).
2. Construire une **maquette** `backend/app/science/fbp.py` + tests contre
   `cffdrs::test_fbp_*` isolée du reste. Aucun branchement DB / ingestion tant
   que cette maquette n'est pas verte.
3. Construire de même `backend/app/science/rothermel.py` + tests contre
   `pyrolog` / BehavePlus.
4. Brancher les deux dans `backend/app/api/risk.py` avec affichage côte à
   côte et bande de dispersion.
5. Rétrospective 2022 : `docs/VALIDATION_2022.md` (Landiras + La Teste-de-Buch).
6. **Tant que les 5 étapes ne sont pas vertes : on ne passe pas à PHASE 5.**

---

*Date de validation* : 2026-07-27.
*Sources* : [`docs/SPEC.md`](SPEC.md) §6.2 + §C-02 ; [`docs/PHASE_PLAN.md`](PHASE_PLAN.md) PHASE 4.
*Référence canonique FBP* : Van Wagner (1987) Forestry Technical Report F-39 ;
  Forest Fire Behaviour Prediction (Forestry Canada).
*Référence Rothermel* : Rothermel (1972) USDA Forest Service GTR-INT-115 ;
  Andrews (2018) RMRS-GTR-371.
