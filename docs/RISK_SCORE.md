# Score de risque — docs/RISK_SCORE.md — PHASE 4

> Document normatif — agrega `ignition_risk` et `spread_risk` séparément.
> Source de la décision : [`docs/FBP_VS_ROTHERMEL.md`](FBP_VS_ROTHERMEL.md)
> (FBP primaire, Rothermel secondaire, Scope B validé).

---

## 1. Composition générale

```
ignition_risk  = f₁ (facteur_humain, sécheresse_fins)
spread_risk    = f₂ (FWI_normalisé, ROS_potentielle, continuité_combustible)

display_risk   = max(ignition_risk, spread_risk)     # couche « risque général »
cell_risk_xy   = { ignition_risk, spread_risk,
                   contributions, quality }
```

Deux scores **séparés** : un feu qui part loin d'une route et brûle un massif
connecté se voit attribuer un **ignition bas** et un **spread haut**.
Les fusionner en un chiffre unique détruit l'information
([`docs/SPEC.md`](SPEC.md#64-score-de-risque-final) §6.4).

## 2. `ignition_risk` (risque de DÉPART)

### Entrées
- `dist_road` (proximité d'une route carrossable pondérée par classe)
- `dist_camping_leisure`
- `dist_builtup_edge_forest`
- `seasonality_human_factor` (modulation mensuelle)
- `hist_departure_density_2km` (quand la donnée est disponible, PHASE 5)
- `dry_days_7` + `canicule_streak` (sécheresse des combustibles fins)

### Pondération
Voir [`config/local_coefficient.yaml`](../config/local_coefficient.yaml) —
catégorie `human` (0.30) + part de `dryness_climate.dry_days_7` (0.020) +
`dryness_climate.canicule_streak` (0.040).

### Formule
```
ignition_score = sum(w_f × normalized_f)
                 / sum(weights of available factors)
```
Borné [0, 1]. Renormalisation automatique en cas de facteur indisponible.

### Sortie
```
ignition_risk = {
  score_0_100: round(100 * ignition_score),
  class: EFFIS class (cf. §4),
  components: {
    human: score_human,
    dryness_fines: score_dry,
    history: score_hist | null
  }
}
```

## 3. `spread_risk` (risque de PROPAGATION)

### Entrées
- `FWI_norm` : FWI / 50 (capé à 1.0 pour FWI > 50), issu de PHASE 2 / CFFWIS.
- `ROS_FBP` : taux de propagation Fire Behaviour Prediction primaire (C-6
  Conifer Plantation) ; [`docs/FBP_VS_ROTHERMEL.md`](FBP_VS_ROTHERMEL.md).
- `ROS_Rothermel` : taux de propagation Rothermel secondaire ; co-affiché.
- `continuity_fuel` : part de pin maritime × NDMI percentile × densité couvert
  (PHASE 3 `cell_static` + `cell_vegetation`).
- `slope_aspect` + `dist_coast_littoral` (terrain, pondération faible en Gironde).

### Pondération
Voir `local_coefficient.yaml` — catégorie `fuel` (0.30) + `terrain` (0.10) +
`dryness_climate.vpd` (0.090) + `dryness_climate.dry_days_30` (0.030).

### Formule
```
spread_score = w_FWI × FWI_norm
             + w_ROS_FBP × ROS_FBP_norm × continuity
             + w_ROS_Roth × ROS_Roth_norm × continuity   # bande d'incertitude
             + w_terrain × terrain_factor
             / sum(weights of available factors)
```
Borné [0, 1].

### Sortie avec dispersion inter-modèle
```
spread_risk = {
  score_0_100: round(100 * spread_score),
  class: EFFIS class,
  components: {
    fwi: score_fwi,
    ros_fbp: ROS_FBP_m_per_min,
    ros_rothermel: ROS_Roth_m_per_min | null,
    ros_dispersion_ratio: ROS_FBP / ROS_Roth    # bande visible UI
    continuity: score_continuity,
    terrain: score_terrain
  }
}
```

## 4. Échelle 0-100 et classes EFFIS

```
score_0_100 = round(100 × max(ignition_score, spread_score))
class :
  < 5.2       : très faible
  5.2-11.2    : faible
  11.2-21.3   : modéré
  21.3-38.0   : élevé
  38.0-50.0   : très élevé
  ≥ 50.0      : extrême
```

Seuils dans `config/danger_thresholds.yaml` éditable. Source : grille EFFIS
officielle.

## 5. Décomposition (obligatoire au clic)

`GET /api/risk/cell/{id}` renvoie :
```jsonc
{
  "cell_id": 12345,
  "ignition_risk": {
    "score_0_100": 67,
    "class": "élevé",
    "contributions": [
      {"factor_id": "dist_road", "raw_value": 230.0, "weight": 0.060,
       "normalized_value": 0.61, "contribution_absolute": 0.037, "contribution_relative": 0.22},
      {"factor_id": "seasonality_human_factor", "raw_value": null,
       "weight": 0.090, "normalized_value": 1.00, "contribution_absolute": 0.090,
       "contribution_relative": 0.55},
      // ...
    ]
  },
  "spread_risk": { /* idem */ },
  "display_risk": {
    "score_0_100": 81,
    "class": "très élevé",
    "source": "spread_risk"      // ← ignition_risk vs spread_risk : valeur max
  },
  "quality": { /* cf. §6 */ }
}
```

Somme des contributions relatives ≈ 1.00 (aux facteurs disponibles normalisés).

## 6. Indicateurs de qualité (propagés depuis PHASE 1-3)

Pour chaque cellule :
- `bdforet_vintage` : date du millésime BD Forêt V2 utilisé.
- `sentinel_last_acquisition_date` : dernière imagerie Sentinel-2 valide retenue.
- `firms_age_seconds` : âge du dernier point chaud FIRMS dans la cellule.
- `open_meteo_age_minutes` : âge de la dernière valeur Open-Meteo.
- `fuel_model_confidence_weighted` : moyenne pondérée des `confidence` du
  modèle de combustible.
- `drapeau_factor_missing` : liste des IDs de facteurs indisponibles
  (renormalisation déclenchée).

## 7. Affichage

- `cell_risk_xy` est exposé via **deux couches UI séparées** :
  « Risque de départ » et « Risque de propagation ». Jamais fusionnées en une
  seule vue principale.
- Palette de couleurs `viridis_inverted` ou EFFIS officielle, accessible aux
  daltoniens. La classe qualitative (très faible → extrême) **est toujours
  lisible** au survol.
- Au clic : panneau de **décomposition** avec barres horizontales, positives
  (facteur qui pousse le risque vers le haut) et négatives si applicable.
- Si les deux modèles sont implémentés (Scope B), un **sélecteur FBP ↔
  Rothermel ↔ dispersion** dans le panneau de détail.
- Cellules avec `fuel_model_confidence: low` : hachures ou opacité réduite,
  badge visuel *« confiance faible »*.

## 8. Horizons

J+0, J+3h, J+6h, J+12h, J+24h, J+48h. **Pas d'échéance 7 jours**. Au-delà de
48 h, AROME HD perd la résolution nécessaire : le score deviendrait
décoratif et la spec §5.3 **interdit** sa publication.

Chaque échéance utilise la **prévision météo correspondante** (cf. SPEC §C-05.b),
pas le vent instantané figé.

## 9. Contraintes strictes — **NON NÉGOCIABLES**

- **Aucun `confidence: X %`** dans l'UI, **jamais**, pour aucune sortie issue
  d'un modèle (cf. SPEC §6.4, reformulé après décision Pré-0 §8).
- **Aucun `probabilité d'incendie : X %`** dans l'UI (cf. SPEC §6.4 initiale).
- **Pas de mélange en un chiffre unique** : `ignition_risk` et `spread_risk`
  sont **toujours** deux valeurs distinctes. Si l'UI doit afficher un seul
  score, c'est **le maximum des deux** (`.display_risk.source` indiquant
  lequel a dominé).
- **Bande d'incertitude inter-modèle** visible : `ros_dispersion_ratio` =
  ratio ROS_FBP / ROS_Rothermel, affichée comme plage colorée entre les deux
  ellipses.
- **Pas de Monte-Carlo sur les paramètres internes des modèles**. La
  stochasticité est limitée aux **entrées** (perturbation du vent, du modèle
  de combustible si confidence: low), avec un nombre de tirages **réglable
  mais borné** pour préserver l'interactivité.

## 10. Migration si Scope A est retenu ultérieurement

Si l'équipe décide de rétrograder vers Scope A (FBP seul) :

- Retirer `ROS_Rothermel` du YAML (`available_when: "phase_4_dual_disabled"`).
- Le bande d'incertitude devient un intervalle météo Open-Meteo multi-modèles.
- `display_risk.source` reste inchangé.
- Les poids `spread_risk` ne sont PAS recalibrés — la perte de signal est
  honnête, le modèle N'est PAS ajusté pour compenser.

## 11. Tests obligatoires

Dans `tests/science/test_risk.py` :

- `test_ignition_and_spread_are_always_separated` : jamais de fusion.
- `test_no_confidence_percent_in_output` : grep regex sur `/[Cc]onfidence:\s*\d+%/`.
- `test_decomposition_sum_to_one_when_all_available` : Σ des contributions relatives = 1.0.
- `test_horizon_48h_max` : aucune échéance > 48 h acceptée.
- `test_efis_classes_match_thresholds` : test paramétrique sur les seuils.
- `test_dispersion_band_visible_when_two_models` : presence de `ros_dispersion_ratio` ≥ 1.
- `test_renormalization_if_factor_missing` : Σ renormalisée ≈ 1.0 sur les actifs.

---

*Date du document* : 2026-07-27.
*Référence* : [`docs/FBP_VS_ROTHERMEL.md`](FBP_VS_ROTHERMEL.md),
[`docs/SPEC.md`](SPEC.md#64-score-de-risque-final),
[`config/local_coefficient.yaml`](../config/local_coefficient.yaml).
