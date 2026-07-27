# PyroScope 33 — Runbook opérationnel

> **Procédures d'incident, dégradation et déploiement.**
> À connaître par l'opérateur du système. À lire avant toute mise en production.

---

## 1. Principes de dégradation

**Règle d'or :** L'application ne crashe jamais. Toute source indisponible → pas d'affichage de mauvaise donnée.

| Situation | Comportement | UI |
|---|---|---|
| API externe timeout | Connecteur renvoie `SourceStatus(available=False)` | Couche affiche « donnée indisponible » avec icône rouge |
| Donnée partielle | Les cellules valides sont affichées, les autres masquées | `grid_coverage_ratio` mis à jour |
| Cache Redis HS | Fallback direct aux APIs (pas de cache, pas de crash) | Aucun changement visible |
| Base de données HS | Endpoint health retourne 503. API retry 3x | Bannière « Backend indisponible » |
| Worker planifié HS | Les données les plus récentes restent servies via le cache. L'âge (`data_age_seconds`) continue d'augmenter | L'UI affiche l'âge réel, pas l'heure du dernier appel |

---

## 2. Que faire quand une source tombe

### 2.1 NASA FIRMS indisponible

**Symptômes :** `ingestion_total{source="firms",status="error"}` > 0, `data_age_seconds{source="firms"}` augmente

**Procédure :**
1. Vérifier le statut : https://firms.modaps.eosdis.nasa.gov/ (page status, pas de JSON)
2. Attendre 15 min (rafraîchissement suivant). Les pannes FIRMS sont généralement < 1 h
3. Si > 2 h : vérifier la clé API n'a pas expiré — la regénérer sur le portail NASA
4. Si la clé est valide : le satellite est en maintenance programmée (NASA annonce les maintenances sur le portail)

**Impact :** La couche « points chauds » passe en état « donnée indisponible ». Les autres couches ne sont pas affectées.

### 2.2 Open-Meteo indisponible

**Symptômes :** `ingestion_total{source="open_meteo",status="error"}` > 0

**Procédure :**
1. Vérifier l'API directement : `curl https://api.open-meteo.com/v1/forecast?latitude=44.8&longitude=-0.5&current=temperature_2m`
2. Si l'API répond : c'est un problème réseau local depuis le serveur (DNS, proxy, firewall). Vérifier `docker compose logs api`
3. Si l'API ne répond pas : panne Open-Meteo (rare, < 1 h historique). Attendre la restauration automatique
4. Si > 3 h : basculer vers un modèle secondaire (ICON_D2, GFS) en modifiant `settings.py`

**Impact :** FWI non mis à jour (calculé depuis les données les plus récentes en cache). Vent non animé (dernière donnée figée).

### 2.3 Copernicus CDSE indisponible

**Symptômes :** `ingestion_total{source="copernicus",status="error"}` > 0

**Procédure :**
1. Vérifier le token OAuth2 n'a pas expiré : `curl -X POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token ...`
2. Si expiré : vérifier CDSE_CLIENT_ID et CDSE_CLIENT_SECRET dans les variables d'environnement
3. Si valide : https://dataspace.copernicus.eu/ — vérifier la page status. Les maintenances CDSE sont annoncées 48h à l'avance
4. Si > 24 h : désactiver la couche végétation. Les indices NDVI/NDMI seront marqués « donnée > 7 jours »

**Impact :** Couches stress hydrique et combustible marquées « obsolète ». Le coefficient local continue de fonctionner sans indice satellite

### 2.4 Redis HS

**Symptômes :** Logs « redis_connection_error », `data_age_seconds` devient irrégulier

**Procédure :**
1. `docker compose restart redis`
2. Si persiste : `docker compose logs redis`
3. Si RAM pleine : `redis-cli FLUSHALL` (le cache se repeuple). Considérer augmenter `maxmemory` dans `docker-compose.yml`
4. Si corrompu : supprimer le volume Redis et redémarrer

**Impact :** Performance dégradée (tous les appels API sont directs, pas de cache). Aucune perte de données — les données sont en base.

### 2.5 PostgreSQL / TimescaleDB HS

**Symptômes :** Health endpoint 503, logs « database_connection_error »

**Procédure :**
1. `docker compose logs postgis` — vérifier l'erreur exacte
2. Si connexion refusée : vérifier `DATABASE_URL` dans `.env`
3. Si corruption : restaurer depuis le dernier backup
4. Si volume plein : `docker system df` → nettoyer les logs, augmenter le volume

**Impact :** Total. L'application ne peut pas servir de données stockées. Les endpoints health retournent 503.
**Urgence :** Haute.

---

## 3. Déploiement

### 3.1 Première installation

```bash
# 1. Cloner
git clone <repo> && cd pyroscope33

# 2. Configurer
cp .env.example .env
# Éditer .env : NASA_FIRMS_API_KEY, CDSE_CLIENT_ID/SECRET, DATABASE_URL

# 3. Lancer
docker compose up -d

# 4. Vérifier
curl http://localhost:8000/healthz
# → {"status":"ok","version":"0.1.0"}
```

### 3.2 Mise à jour

```bash
git pull
docker compose build --pull
docker compose up -d
docker compose exec api alembic upgrade head
```

### 3.3 Rollback

```bash
# Revenir à la version précédente
git checkout <previous-tag>
docker compose build api worker
docker compose up -d
docker compose exec api alembic downgrade -1
```

---

## 4. Sauvegarde

### 4.1 Base de données

```bash
docker compose exec postgis pg_dump -U pyroscope pyroscope > backup_$(date +%Y%m%d).sql
```

### 4.2 Configuration

```bash
cp .env backup/.env.$(date +%Y%m%d)
```

---

## 5. Métriques Prometheus — seuils d'alerte

| Métrique | Seuil d'alerte | Action |
|---|---|---|
| `data_age_seconds{source="firms"}` > 3600 | Warning | Vérifier FIRMS (§2.1) |
| `data_age_seconds{source="open_meteo"}` > 10800 | Warning | Vérifier Open-Meteo (§2.2) |
| `ingestion_total{source=~".*",status="error"}` > 10 en 15 min | Critical | Vérifier la source correspondante |
| `fwi_recursion_gap_days` > 2 | Critical | Vérifier le worker FWI |
| `grid_coverage_ratio` < 0.5 | Warning | Source partiellement indisponible |
| `external_api_quota_used / external_api_quota_limit` > 0.9 | Warning | Quota presque épuisé |
| `external_api_duration_seconds` > 30 | Warning | API anormalement lente |

---

## 6. Incident Response — Fire Drill

### 6.1 Une source affiche « 0 incendie » alors que la météo est extrême

1. Vérifier `data_age_seconds{source="firms"}` — si la donnée a > 3 h, la couche est périmée
2. Vérifier `grid_coverage_ratio{layer="hotspots"}` — si < 0.1, FIRMS n'a pas renvoyé de données
3. Vérifier les logs du worker : `docker compose logs worker | grep firms`
4. Si tout est vert mais qu'il n'y a pas de points chauds : c'est probablement correct — les satellites polaires ne sont pas géostationnaires

### 6.2 Crash total — l'application ne démarre pas

```bash
docker compose logs api | tail -50
docker compose logs worker | tail -50
docker compose logs postgis | tail -50
```

Les causes les plus fréquentes :
- Port déjà utilisé (changer dans docker-compose.yml)
- Variable d'environnement manquante (vérifier .env)
- Extension PostgreSQL manquante (vérifier `initdb/01-extensions.sql`)

---

## 7. Maintenance planifiée

| Tâche | Fréquence | Commande |
|---|---|---|
| Mise à jour des images Docker | Mensuelle | `docker compose pull` |
| Backup base | Hebdomadaire | Voir §4.1 |
| Nettoyage des logs | Mensuelle | `docker system prune -f` |
| Vérification quota FIRMS | Hebdomadaire | /metrics → `external_api_quota_used{source="firms"}` |
| Vérification taux succès ingestion | Hebdomadaire | /metrics → `ingestion_total` |
| Mise à jour cache mensuel Overpass | Mensuelle | Redémarrer le worker |
