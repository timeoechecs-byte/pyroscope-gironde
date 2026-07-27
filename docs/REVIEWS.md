# PyroScope 33 — Revue externe et audit de sécurité

> Document de suivi des revues externes. Chaque revue fait l'objet d'une
> section datée. Les critiques non suivies sont conservées avec la raison
> de leur non-intégration.

**Date de création** : 2026-07-27
**Projet** : PyroScope 33 — suivi et évaluation du risque d'incendie de forêt en Gironde

---

## Table des matières

1. [Principe des revues](#1-principe-des-revues)
2. [Audit de sécurité (PHASE 7)](#2-audit-de-sécurité-phase-7)
3. [Revues à solliciter](#3-revues-à-solliciter)

---

## 1. Principe des revues

Le projet atteint un point où le jugement seul de l'équipe initiale ne
suffit plus à le valider. Trois regards complémentaires sont nécessaires :

| Regard | Cible | Profil recherché |
|--------|-------|------------------|
| **Scientifique** | Moteur de risque, CFFWIS, FBP, Rothermel, coefficient local | INRAE, laboratoires comportement du feu, géomatique universitaire |
| **Opérationnel** | Utilité réelle, risques de mauvaise interprétation, adéquation aux besoins | SDIS 33, DFCI Aquitaine, Météo-France |
| **Technique** | Code, architecture, sécurité, déploiement | Développeurs open source, experts sécurité |

---

## 2. Audit de sécurité (PHASE 7)

### 2.1 Checklist de sécurité

| # | Point | Statut | Notes |
|---|-------|--------|-------|
| S-01 | **TLS/HTTPS** en production | 🔲 À configurer | Certificat Let's Encrypt via reverse proxy |
| S-02 | **En-têtes HTTP de sécurité** (CSP, X-Frame-Options, HSTS) | 🔲 À configurer | CSP restrictif pour MapLibre, pas de inline-script en prod |
| S-03 | **Secrets** : clés API jamais dans le code, jamais dans l'image Docker | ✅ Fait | `.env` uniquement, injecté par l'environnement |
| S-04 | **Rate limiting** sur endpoints publics | ✅ Fait | 100 req/min sur `/api/v1/` |
| S-05 | **CORS** : origines autorisées restrictives | 🔲 À configurer | En prod, domaine connu uniquement |
| S-06 | **Validation des entrées** (bbox, paramètres query) | ✅ Fait | Pydantic v2 sur tous les endpoints |
| S-07 | **Protection SQL injection** (ORM) | ✅ Fait | SQLAlchemy, pas de requêtes brutes |
| S-08 | **Protection Redis** (mot de passe, réseau isolé) | 🔲 À configurer | Redis en réseau interne Docker |
| S-09 | **Protection PostgreSQL** (mot de passe, réseau isolé, pas de port exposé) | 🔲 À configurer | PostgreSQL en réseau interne Docker |
| S-10 | **Logs** : pas de donnée sensible dans les logs (IP, tokens) | ✅ Partiel | Vérifier que les tokens CDSE/FIRMS ne loggent pas |
| S-11 | **Erreurs** : pas de stack trace exposée en production | 🔲 À configurer | FastAPI `debug=False` en prod |
| S-12 | **Dépendances** : audit régulier (npm audit, pip audit) | 🔲 À configurer | CI weekly + alertes GitHub Dependabot |
| S-13 | **Backup** : restauration testée régulièrement | 🔲 À configurer | Script backup + test de restauration mensuel |
| S-14 | **RGPD** : données personnelles réduites au strict minimum | ✅ Fait | Pas de collecte sans consentement |
| S-15 | **Procédure de retrait** : que faire si la préfecture demande de retirer une donnée | 🔲 À rédiger | Rédiger dans RUNBOOK.md |
| S-16 | **Mises à jour de sécurité** : veille sur les dépendances critiques | 🔲 À configurer | Dependabot + revue mensuelle |

### 2.2 Recommandations prioritaires (ordre d'importance)

1. **CSP configuré** dès la première exposition publique — sans CSP, XSS sur
   un endpoint public expose tous les visiteurs.
2. **HTTPS + HSTS** obligatoire avant toute mise en ligne.
3. **Audit de dépendances** automatisé (Dependabot ou équivalent).
4. **Procédure de retrait** rédigée à froid (pas dans l'urgence).
5. **Backup PostgreSQL testé** mensuellement.

---

## 3. Revues à solliciter

### 3.1 Regard scientifique

**Cible** : INRAE, UMR EPOC (Université de Bordeaux), laboratoires forestiers.

**Points à soumettre** :
- Table de correspondance BD Forêt → SB-40 / FBP (H1)
- Fonction NDMI → humidité du combustible (H2)
- Poids du coefficient local Gironde (H4)
- Domaine de validité FBP en pin maritime (Scope B)

### 3.2 Regard opérationnel

**Cible** : SDIS 33, DFCI Aquitaine, Météo-France.

**Points à soumettre** :
- Utilité perçue de l'outil pour la surveillance
- Risques de mauvaise interprétation des scores
- Adéquation avec les besoins terrain
- Recommandations d'amélioration

### 3.3 Regard technique

**Cible** : Communauté open source, développeurs Python/React.

**Points à soumettre** :
- Architecture du code
- Qualité du moteur scientifique
- Performances et scalabilité
- Sécurité et résilience

### 3.4 Suivi des retours

| Date | Reviewer | Type | Retours clés | Suites données |
|------|----------|------|-------------|----------------|
| | | | | |

---

> Ce document sera mis à jour après chaque revue. Les critiques non suivies
> sont conservées avec la raison — s'il y a une bonne raison de ne pas suivre
> un retour, elle doit être traçable.
