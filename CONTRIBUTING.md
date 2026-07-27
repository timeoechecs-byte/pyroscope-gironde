# Contributing to PyroScope 33

Merci de votre intérêt pour PyroScope 33 ! Ce projet open source vise à
fournir un outil de visualisation du risque d'incendie de forêt en Gironde,
à but pédagogique et informatif.

## Code de conduite

Ce projet suit un [Code de Conduite](CODE_OF_CONDUCT.md) pour garantir un
environnement respectueux et inclusif. En participant, vous vous engagez à
le respecter.

## Comment contribuer

### Signaler un bug

Ouvrez une issue GitHub avec :
- Description claire du comportement attendu vs observé
- Environnement (navigateur, OS, version)
- Étapes de reproduction
- Captures d'écran si possible

### Proposer une amélioration

Ouvrez une issue GitHub avec :
- Problème identifié ou besoin opérationnel réel
- Proposition de solution
- Impact sur les contraintes §C-01..C-05 (coût, données, etc.)

### Contribution de code

1. **Discutez d'abord** : ouvrez une issue pour discuter de votre proposition
   avant d'écrire du code. Évitez les PR surprises.

2. **Respectez la spec** : toute modification doit être conforme à
   `docs/SPEC.md` et aux contraintes absolues (§C-01..C-05).

3. **Une phase à la fois** : le projet suit un phasage strict
   (`docs/PHASE_PLAN.md`). Une PR qui sort du phasage actuel sera orientée
   vers le backlog.

4. **Tests obligatoires** : toute implémentation scientifique (CFFWIS, FBP,
   Rothermel, coefficient local) doit être accompagnée de tests unitaires
   sur des cas de référence publiés.

5. **Types** : backend = mypy strict, frontend = TypeScript strict.

6. **CI verte** : toute PR doit passer ruff + mypy + pytest (backend) et
   tsc + vitest (frontend).

### Règles de codage

- **Pas de donnée fabriquée** (§C-05) : aucune valeur par défaut,
  aucun mock, aucune interpolation temporelle vers l'instantané.
- **Pas d'API payante** (§C-01) : toute dépendance doit être gratuite
  et auto-hébergeable.
- **Pas de probabilité affichée** (§6.4) : le score est 0-100 avec classe,
  jamais un pourcentage.
- **Logs structurés** en JSON, métriques Prometheus pour les sources.

### Licence

En contribuant, vous acceptez que votre code soit distribué sous
AGPL-3.0. Assurez-vous d'avoir le droit de contribuer au code que vous
proposez.

## Process de relecture

1. PR ouverte → CI automatique
2. Revue humaine : regard scientifique, opérationnel, ou technique selon
   la nature de la contribution
3. Merge après validation et tests verts

## Questions

Ouvrez une issue GitHub avec le label `question`.

---

*PyroScope 33 — Gironde, France. Juillet 2026.*
