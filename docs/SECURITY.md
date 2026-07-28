# Sécurité — PyroScope 33

## 🚨 Incident 2026-07-28 : clés API exposées dans le bundle

Le dépôt `pyroscope-gironde-main` (branche `main`) a contenu **quatre secrets
réels, en clair**, dans le fichier `src/config/api-keys.ts`. Chaque
archive dérivée de cet état — y compris sur GitHub même après suppression du
fichier — doit être considérée comme compromise.

### Les quatre secrets exposés

| Identifiant | Plateforme | Sensibilité |
| --- | --- | --- |
| Clé NASA FIRMS | `firms.modaps.eosdis.nasa.gov` | Quota journalier — risque de bannissement |
| Clé OpenAQ v3 | `api.openaq.org` | Quota — risque de suspension |
| `client_secret` CDSE | `sh.dataspace.copernicus.eu` | Compte nominatif, quotas de traitement |
| CDS `api_token` (ECMWF) | `cds.climate.copernicus.eu` | Compte nominatif, quotas |

**Le `client_secret` CDSE est particulièrement sensible** : c'est un secret
OAuth conçu pour expirer en une heure. Le placer dans le bundle le transforme
en un secret permanent et contourne la protection native.

---

## Procédure de rotation obligatoire

**À exécuter **dans cet ordre**, depuis ta machine, sans attendre la suite
des corrections de code :**

### 1. Révoquer les quatre secrets actuels

| Plateforme | Action | URL |
| --- | --- | --- |
| NASA FIRMS | « Generate new Map Key » (l'ancienne est invalidée) | <https://firms.modaps.eosdis.nasa.gov/api/map_key> |
| OpenAQ | Supprimer l'ancienne clé dans le dashboard | <https://explore.openaq.org/account> |
| CDSE (Copernicus Data Space) | Supprimer le client OAuth, en créer un nouveau | <https://sh.dataspace.copernicus.eu> |
| CDS (ECMWF) | Révoquer le Personal Access Token dans le profil | <https://cds.climate.copernicus.eu/profile> |

### 2. Mettre le dépôt en privé le temps de la purge

`Settings → Danger Zone → Change repository visibility → Private`.

### 3. Régénérer les secrets (après l'étape 1)

Quatre nouvelles clés vierges, aucune n'a été partagée.

### 4. Configurer via l'UI Keys de Freebuff (jamais en clair dans le code)

| Variable | Usage |
| --- | --- |
| `VITE_FIRMS_API_KEY` | Hotspots satellite NASA FIRMS (côté frontend autorisé) |
| `VITE_OPENAQ_API_KEY` | Qualité de l'air OpenAQ v3 (côté frontend autorisé) |

> ⚠️ Les secrets backend-only (`CDSE_CLIENT_SECRET`, `CDS_API_TOKEN`) ne sont
> **PAS** des `VITE_*`. Ils sont lus **uniquement** par le backend Python
> depuis ses propres variables d'environnement (`CDSE_CLIENT_SECRET`, etc.).

### 5. Purger l'historique git

Après la révocation des secrets seulement (jamais à la place) :

```bash
# Méthode git filter-repo (recommandée)
git filter-repo --invert-paths --path src/config/api-keys.ts

# Ou avec BFG Repo-Cleaner
bfg-repo-cleaner --delete-files api-keys.ts
```

Puis `git push --force` (sur une branche privée).

---

## Politique non-négociable

**Règles absolues. Aucune exception, aucune justification par deadline.**

### ✅ Où les secrets peuvent vivre

- `.env.local` sur la machine du développeur (jamais commité).
- Variables `VITE_*` dans l'UI Keys de Freebuff, au build, pour les secrets
  **qui peuvent légitimement transiter par le frontend** (clés publiques
  d'API sans quota nominatif lié à un compte individuel, ex. NASA FIRMS).
- Variables d'environnement du backend Python (`os.environ`, jamais
  `import.meta.env`), pour les secrets backend-only.
- `localStorage` du navigateur, **uniquement** si l'utilisateur final l'a
  saisi manuellement, pour une clé publique d'API frontend-autorisée.

### ❌ Où les secrets ne doivent JAMAIS vivre

- Dans un fichier `.ts`, `.tsx`, `.js`, `.py`, `.json`, `.yml`, `.md` ou
  `.toml` du dépôt.
- Dans un commit, même s'il est « temporaire » ou « sera nettoyé plus tard ».
- Dans le bundle JavaScript servi au navigateur, pour un secret qui dépasse
  le périmètre frontend.
- Dans une valeur de fallback « au cas où l'utilisateur n'a pas configuré ».
- En commentaire de code, en FIXME, en exemple de configuration.
- Dans un fichier `api-keys.example.ts` ou `secrets.template.ts`.

### 🔒 Secret backend-only : la règle spécifique

Le `CDSE_CLIENT_SECRET` et le `CDS_API_TOKEN` sont des secrets **backend-only**.
Le frontend **ne doit jamais** les voir, ni en clair ni chiffrés, ni via
proxy JavaScript côté client.

**Pattern architectural correct :**

```
Navigateur ──fetch──> /api/copernicus/sentinel ──> Backend Python ──oauth──> CDSE
Navigateur ──fetch──> /api/cds/era5           ──> Backend Python ──token──> CDS
```

Le code qui place le secret dans le bundle n'a pas le droit d'exister.

---

## Détection continue

À ajouter au CI avant la phase 6 :

```bash
# Recherche de strings ressemblant à des clés API
grep -rEn "\b[a-f0-9]{32,}\b" --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.json" --include="*.py" \
  src/ backend/ 2>/dev/null \
  | grep -vE "(node_modules|generated|_id|hash|uuid|test)" \
  && echo "❌ Possible secret detected" && exit 1

# Recherche de patterns courants de clés
grep -rEn "(Bearer|api[_-]?key|token|secret)\s*[:=]\s*['\"][a-zA-Z0-9_-]{16,}" \
  --include="*.ts" --include="*.tsx" --include="*.py" src/ backend/ 2>/dev/null \
  && echo "❌ Possible secret assignment" && exit 1
```

**Objectif : zéro hit dans src/ et backend/ sur la branche `main`.**

---

## Leçon à retenir

L'infrastructure du projet (Docker, structure du dépôt, documentation,
bandeau légal, les trois bboxes) est correcte. Ce qui a échoué est un choix
documenté dans le code : *« les clés sont hardcodées ici »*. Un commentaire
qui dit ouvertement ce qu'il fait ne rend pas le choix acceptable — au
contraire, c'est une alerte ignorée en pleine conscience.

Le détecteur le plus fiable pour la récidive : **chercher les commentaires
qui commencent par `Wait`, `Hmm`, `Actually`, `simplified` ou `let me re-read`
dans `backend/app/`**. Douze rien que dans `cffwis.py`. Objectif : zéro.

---

*Ce document est la référence unique pour toute question de sécurité du
projet. Il n'est pas versionné — toute modification doit être revue.*
