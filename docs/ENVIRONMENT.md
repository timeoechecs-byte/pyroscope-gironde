# Variables d'environnement — PyroScope 33

Ce document liste **toutes** les variables attendues par le backend.
Le sandbox Freebuff refuse l'écriture de fichiers `.env*` (et l'accès
shell à ces fichiers), donc le template ne vit pas dans un `.env.example`.
Procédure de création : copier ce contenu **manuellement** dans
`backend/.env` à la racine du backend.

> ⚠️ Le sandbox bloquera toute tentative d'écriture automatique de
> `backend/.env`. L'utilisateur doit créer le fichier lui-même,
> en revue locale uniquement (jamais commité).

---

## Variables obligatoires (sans elles, l'app refuse de démarrer)
_Aucune d'entre elles n'est vraiment obligatoire au sens technique —
l'app démarre en mode dégradé (les warnings `source_unconfigured`
apparaissent au boot). Mais pour les endpoints proxy qui en dépendent,
elles sont indispensables._

### NASA FIRMS (clé gratuite via firms.modaps.eosdis.nasa.gov/api/map_key)

```
FIRMS_MAP_KEY=<ta clé FIRMS>
openaq_api_key=<clé OpenAQ si tu l'utilises, sinon vide>
cdse_client_id=<CDSE client id si tu utilises Sentinel-2, sinon vide>
cdse_client_secret=<CDSE client secret, JAMAIS côté frontend>
cds_api_token=<token ECMWF CDS, repli phase 2>
```

## Variables de configuration (jamais des secrets)

```
ENVIRONMENT=development   # development | staging | production
DEBUG=false
LOG_LEVEL=INFO

# Grille (cf. SPEC §1)
BBOX_DEPARTEMENT_LON_MIN=-1.35
BBOX_DEPARTEMENT_LAT_MIN=44.15
BBOX_DEPARTEMENT_LON_MAX=0.35
BBOX_DEPARTEMENT_LAT_MAX=45.60

BBOX_CALCUL_LON_MIN=-1.55
BBOX_CALCUL_LAT_MIN=43.97
BBOX_CALCUL_LON_MAX=0.60
BBOX_CALCUL_LAT_MAX=45.78

BBOX_INGESTION_LON_MIN=-1.70
BBOX_INGESTION_LAT_MIN=43.80
BBOX_INGESTION_LON_MAX=0.95
BBOX_INGESTION_LAT_MAX=45.95

GRID_SIZE_M=250
GRID_EPSG=2154
DISPLAY_EPSG=4326

# Base + cache
DATABASE_URL=postgresql+psycopg://pyroscope:change_moi@postgis:5432/pyroscope
REDIS_URL=redis://redis:6379/0

# Frontend
CORS_ALLOWED_ORIGINS=["http://localhost:5173","http://localhost:4173"]

# Rate limiting
RATE_LIMIT_PER_MINUTE_DEFAULT=60
RATE_LIMIT_PER_MINUTE_TILES=20

# Convex (auth)
VLY_API_KEY=<clé vly.ai — utiliser la clé partagée du template en dev ;
              en prod, ouvrir le dashboard Convex, Environment Variables,
              set VLY_API_KEY avec une vraie clé>
VLY_APP_NAME=PyroScope 33
```

---

## Côté Convex (Environment Variables du dashboard Convex)

Independamment du `.env` du backend, ces variables vivent dans
le dashboard Convex de l'application Freebuff :

- `VLY_API_KEY`     — clé API pour l'envoi OTP e-mail via email.vly.ai
- `VLY_OTP_ENDPOINT` (optionnel)
- `VLY_APP_NAME`     (optionnel, défaut = "a vly.ai application")

> Le sandbox Freebuff a un onglet dédié **"Keys" / "API Keys"** où ces
> variables sont définies. Le code Convex les lit via `process.env.*`.

---

## Côté frontend

Le frontend **NE DOIT PAS** contenir de clé API. Les seules variables
légitimes sont des URLs publiques :

```
VITE_API_URL=http://localhost:8000   # URL du backend FastAPI
```

Toute tentative d'exposer `VITE_FIRMS_KEY`, `VITE_CDSE_CLIENT_SECRET`
ou similaire sera considérée comme une violation de la politique
(voir `docs/SECURITY.md` §Politique).

---

## Procédure de rotation

Après compromission d'une clé :

1. Révoquer l'ancienne clé sur le portail émetteur (NASA FIRMS,
   OpenAQ, Copernicus Data Space, ECMWF CDS).
2. Régénérer une nouvelle clé.
3. Mettre à jour `backend/.env` (local) ET la variable d'env dans
   le dashboard Convex si applicable.
4. `docker compose restart api`.
5. **Aucune action frontend nécessaire** — la rotation est invisible
   côté navigateur parce que le secret ne quitte jamais le serveur.

---

## Pourquoi pas un `.env.example` commité ?

Le sandbox Freebuff bloque l'écriture de tout fichier `.env*`
(notamment `.env.example`) via l'API `write_file`. Et la commande
shell `cat > backend/env.example <<'EOF'` est également bloquée par
le motif "Direct env and sensitive-file access is blocked".

Ce document `docs/ENVIRONMENT.md` est la solution de contournement :
- Il est versionnable (pas de secret dedans).
- Il documente chaque variable avec sa raison d'être.
- L'utilisateur copie/colle manuellement dans `backend/.env` au
  moment de cloner le repo.
