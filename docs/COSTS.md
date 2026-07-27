# PyroScope 33 — Chiffrage des coûts

> **Mise à jour :** Juillet 2026
> **Objectif :** Coût mensuel proche de 0 € (auto-hébergé). Aucune API payante.

---

## 1. Résumé

| Poste | Coût mensuel | Notes |
|---|---|---|
| VPS (auto-hébergé) | ~5-15 € | Hetzner CPX21 minimum recommandé |
| Stockage additionnel | ~0-3 € | Volume block si les données temporelles dépassent 40 Go |
| Bandwidth | Inclus dans le VPS | ~200 Go/mois estimé pour la Gironde |
| APIs externes | **0 €** | Toutes gratuites (NASA FIRMS, Open-Meteo, Copernicus, IGN, OSM) |
| Clés API | **0 €** | Comptes gratuits uniquement |
| **Total minimal** | **~5 €/mois** | Hetzner CPX11 (2 vCPU, 4 Go RAM, 40 Go) |
| **Total recommandé** | **~15 €/mois** | Hetzner CPX21 (3 vCPU, 8 Go RAM, 80 Go) |

---

## 2. Serveur — VPS

### Configuration minimale (staging / usage personnel)

| Composant | Recommandation | Coût |
|---|---|---|
| CPU | 2 vCPU | Inclus |
| RAM | 4 Go | Suffisant pour PostgreSQL + Redis + API + Worker |
| Stockage | 40 Go SSD | 15 Go OS + 20 Go base/tiles + 5 Go cache |
| **Hetzner CPX11** | | **~4.50 €/mois** |

### Configuration recommandée (production, plusieurs utilisateurs)

| Composant | Recommandation | Coût |
|---|---|---|
| CPU | 3-4 vCPU | Point important pendant les calculs FWI horaires |
| RAM | 8 Go | PostgreSQL + TimescaleDB + Redis + 2 workers API |
| Stockage | 80-160 Go SSD | 40 Go pour les données temporelles (ERA5 historique) |
| **Hetzner CPX21-31** | | **~8-15 €/mois** |

---

## 3. Stockage — Détail par type de donnée

| Type de donnée | Volume estimé | Période de rétention | Total à maturité |
|---|---|---|---|
| FIRMS hotpots (Gironde) | ~10 Mo/mois | 30 jours glissants | ~10 Mo |
| Météo Open-Meteo (grille 50 points, horaire) | ~2 Mo/jour | 90 jours | ~180 Mo |
| FWI state (56 jours initialisation + quotidien) | ~1 Mo/jour | Permanent | ~500 Mo/an |
| Sentinel-2 indices (NDVI/NDMI/NBR, ~50 points) | ~500 Ko/scène | 90 jours | ~45 Mo |
| BD Forêt V2 (couche vectorielle Gironde) | ~50 Mo | Permanente | ~50 Mo |
| RGE ALTI (MNT 25m Gironde) | ~200 Mo | Permanente | ~200 Mo |
| **Total permanent** | | | **~300 Mo** |
| **Total temporaire (90 jours)** | | | **~250 Mo** |
| **Cache Redis** | | | **~100 Mo** |

**Total estimé : ~1 Go** réellement nécessaire en base, **~10 Go** avec les données brutes et les index.

---

## 4. Stockage — Copernicus DEM 30m (repli)

Si RGE ALTI est trop lourd :

| Donnée | Volume |
|---|---|
| Copernicus DEM GLO-30 (tuile Gironde 30×30 km) | ~15 Mo par tuile, ~10 tuiles → **150 Mo** |
| Forçage d'utilisation du Copernicus DEM en présence de RGE ALTI | Déconseillé (résolution 30 m vs 1 m) |

---

## 5. Bande passante

| Flux | Volume mensuel estimé | Notes |
|---|---|---|
| Tiles carte (OSM/IGN) | ~100 Mo/mois | Principalement du cache navigateur |
| Points chauds API | ~20 Mo/mois | GeoJSON compressé |
| Météo grille | ~30 Mo/mois | JSON horaire compressé |
| Sentinel indices | ~10 Mo/mois | Petites réponses JSON |
| **Total** | **~200 Mo/mois** | Bien en dessous des limites VPS |

---

## 6. APIs — Limites de quotas

| API | Quota gratuit | Consommation estimée | Risque de dépassement |
|---|---|---|---|
| NASA FIRMS | 200 req/min | ~96 req/jour (15 min × 24h) | Négligeable |
| Open-Meteo | ~100 req/s (non documenté officiellement) | ~24 req/h (horaire) | Négligeable |
| Copernicus CDSE | Rate limit non documenté | ~30 req/jour (Sentinel recherche + download) | Surveiller — prévoir un backoff si 429 |
| IGN Géoplateforme | Pas de limite documentée | ~50 req/jour | Négligeable |
| Overpass API | ~1 req/10s (recommandé) | ~4 req/jour (cache 30 j) | Négligeable |

---

## 7. Évolution des coûts

### Si le nombre de cellules surveillées augmente

| Scénario | Impact | Coût additionnel |
|---|---|---|
| ×10 cellules actives (500 → 5000) | ×10 calcul FWI, ×10 stockage FWI | 0 € (CPU VPS + 50 Mo) |
| ×100 cellules actives | ×100 requêtes API FIRMS | 0 € (FIRMS supporte) |
| France entière | ×100 données | VPS → ~30 €/mois |

### Si le projet devient commercial

| Changement | Impact |
|---|---|
| Dépassement Open-Meteo non-commercial | Auto-hébergement du serveur Open-Meteo (Docker, ~2 Go RAM) |
| Dépassement FIRMS | Partenariat NASA / mise en cache plus longue |
| Besoin SLA | Ajout d'un second VPS en failover → ×2 coût VPS |

---

## 8. Services payants NON utilisés (et pourquoi)

| Service | Coût | Raison de l'exclusion |
|---|---|---|
| Mapbox | 50 000 tiles gratuits/mois puis ~0.50 $/1000 | Fond OSM gratuit + maplibre.gl |
| Google Maps API | Payant (pas de gratuité réelle) | Interdit par SPEC |
| AWS / GCP / Azure | Gratuité 1 an limitée | Auto-hébergement Hetzner |
| Maxar / Planet | Payants, aucune gratuité | Couverture Sentinel-2 gratuite suffisante |
| WeatherStack / WeatherAPI | Payants au-delà de 1000 req/jour | Open-Meteo gratuit |

---

## 9. Budget recommandé

```
VPS (Hetzner CPX21)          → 8 €/mois
Stockage additionnel (50 Go) → 3 €/mois (Hetzner Volume)
Nom de domaine (optionnel)    → 12 €/an (~1 €/mois)
Secours mensuel               → 2 €/mois (backup)
────────────────────────────────────
Total                         → ~14 €/mois
```

Ou, pour une utilisation strictement personnelle sur une machine existante (Raspberry Pi 4+, NAS, PC dormant) :

```
Électricité (5W × 24h × 30j) → ~0.50 €/mois (tarif français 2026)
Stockage SDD locale           → 0 € (déjà disponible)
Domaine (optionnel)           → 1 €/mois
────────────────────────────────────
Total                         → ~0.50-1.50 €/mois
```
