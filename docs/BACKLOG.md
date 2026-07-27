# PyroScope 33 — Backlog (post-PHASE 7)

> **La feuille de route s'arrête à la phase 7.** Les éléments ci-dessous sont
> en **backlog** : ils attendent qu'un **besoin réel** les réclame, pas qu'un
> plan en donne l'illusion. Un projet personnel meurt d'une liste de phases
> qui s'allonge plus vite qu'elle ne se vide.
>
> Référence normative : [`docs/PHASE_PLAN.md`](PHASE_PLAN.md) §Clôture.

---

## 1. Éléments en backlog

| Élément | Pourquoi pas une phase ? | Signal déclencheur |
| --- | --- | --- |
| Indices complémentaires (McArthur australien, indices méditerranéens) | Utiles seulement en comparaison, pas en production. | Demande explicite d'un comparatif cross-régional par un acteur opérationnel ou un universitaire identifié. |
| Assimilation d'observations locales (stations amateur, capteurs) | Coût d'agrégation non négligeable ; pas de valeur ajoutée sans demande aval. | Partenariat avec un réseau de capteurs (météo ou hydrique) local identifié. |
| Modélisation de la dispersion des fumées (CAMS) | Valeur ajoutée forte en cas de pollution atmosphérique aiguë, mais hors périmètre pédagogique actuel. | Demande de la préfecture ou d'une ARS lors d'un épisode de pollution. |
| Couches IGN accessibilité forestière + dessertes DFCI (`ACCESSIBILITE-PHYSIQUE-FORETS`, `NaviForest`) | Probablement le meilleur candidat du lot. | Demande du SDIS 33 ou d'un utilisateur identifié. |
| Historique long des incendies au-delà de ce que la PHASE 5 aura permis | Dépend des résultats PHASE 5 et de partenariats (BDIFF détaillé, SDIS 33). | Découverte d'un dataset historique compatible avec la grille 1,5 km. |

---

## 2. Comment traiter un nouveau candidat ?

Toute proposition d'ajout doit passer par ce filtre avant d'être ajoutée au
backlog. Si la réponse est **non** à l'un des trois critères, la proposition
est **rejetée** sans suite.

1. **Y a-t-il un besoin opérationnel ou scientifique réel, identifié par une
   personne identifiable ?** Si c'est « ça serait bien », sans acteur nommé
   qui le demande, c'est non.
2. **La demande est-elle reproductible ?** Une seule anecdote ne justifie pas
   une ligne de backlog. Une demande récurrente ou chiffrée, oui.
3. **Le coût de mise en œuvre est-il acceptable ?** Le backlog n'est pas un
   réservoir de « nice to have ». Si le coût est disproportionné au regard de
   la valeur ajoutée, c'est non.

Si les trois critères sont remplis, l'élément entre au backlog avec un
**signal déclencheur** documenté. **Aucune promotion en phase** sans :

- validation explicite par l'équipe-projet ;
- critères d'entrée / sortie écrits ;
- porte d'abandon claire.

La promotion en phase est une décision de rupture : elle crée un nouveau
tronçon de la roadmap, qui ne sera plus jamais rouvert comme un item de
backlog. Ne le faites que si les trois critères ci-dessus sont solides et
que le besoin est confirmé par un tiers.

---

## 3. Éléments volontairement retirés — rappel permanent

> **Un projet se définit autant par ce qu'il refuse de faire que par ce qu'il
> livre.** Ce tableau doit rester affiché en permanence. Quand l'envie
> reviendra de rouvrir l'un de ces points, ce sera après avoir réfuté la
> raison de son retrait.

| Élément | Raison du retrait |
| --- | --- |
| **Webcams publiques + vision par ordinateur (YOLO / RT-DETR)** | Droits sur les flux ; RGPD sur personnes identifiables ; précision de détection faible → surtout des faux positifs ; rapport valeur/coût défavorable. |
| **Blitzortung** (foudre) | Pas d'API publique ouverte, conditions restrictives. Les variables orageuses d'Open-Meteo (`cape`, `lifted_index`, `precipitation_probability`) couvrent le besoin. |
| **LLM dans le calcul du risque** | Aucun rôle légitime dans le moteur. Usage limité à la reformulation **optionnelle** de résultats déjà calculés (jamais une décision). |
| **Rafraîchissement toutes les 5 minutes** (FIRMS) | Les satellites polaires passent 4 à 8 fois par jour ; cadence sans objet et pénalisante vis-à-vis des quotas API. Cadence retenue : **15 min**. |
| **Grille FWI à 250 m** | Fausse précision : le FWI dérive de variables météo à résolution kilométrique. Produire 160 000 cellules à partir de 40 points interpolés = trompeuse et coûteuse. |
| **Probabilité d'incendie affichée en pourcentage** | Non calibrable sur les données disponibles. Non récupérable dans un cadrage cas-témoins (cf. PHASE 5 §1.2). Sortie = score 0-100 + dispersion inter-modèles. |
| **Horizons au-delà de 48 h** | Au-delà, la résolution d'AROME HD ne soutient plus le calcul. Le score deviendrait décoratif (cf. PHASE 4 §5.3). |

---

## 4. Modalités de mise à jour de ce document

Ce backlog est **vivant**, mais il est **discipliné** :

- **Aucune ligne ajoutée** sans franchir les 3 critères du §2.
- **Le tableau §3 n'est jamais complété, jamais édulcoré.** Une ligne retirée
  du projet y reste à titre de **mémoire** — sa raison de retrait doit rester
  explicable. Une raison qui n'est plus défendable doit être combattue, pas
  effacée.
- **Toute promotion en phase** passe par une nouvelle entrée dans
  [`docs/PHASE_PLAN.md`](PHASE_PLAN.md), avec ses propres critères d'entrée
  et de sortie, et **avec mention explicite du fait qu'aucune phase 8 ne
  suivra cette nouvelle phase** — sinon la feuille de route renaît de ses
  cendres.

---

## 5. Pourquoi cette section existe

L'envie de « rajouter une chose » est saine. Ce qui ne l'est pas, c'est de
la transformer automatiquement en phase, et donc en plan. Un backlog écrit,
filtré, daté, et revu à intervalle espacé, est l'outil qui maintient le
projet en vie sans le faire dériver.

Quand un élément de backlog a passé six mois sans signal déclencheur
renouvelé, il est **candidat à la radiation** (et non au « on verra plus
tard »). La radiation le retire du backlog, pas du tableau §3. Le tableau
§3 est une mémoire du projet ; le backlog est une intention active.

---

*Date de création* : 2026-07-27.
*Mis à jour par* : équipe-projet PyroScope 33.
*Cadre d'arbitrage* : [`docs/PHASE_PLAN.md`](PHASE_PLAN.md) §Clôture,
[`docs/SPEC.md`](SPEC.md) §C-02 (pas d'API LLM propriétaire),
§C-05 (aucune donnée fabriquée).