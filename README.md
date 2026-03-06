# Cnavluence

Plateforme collaborative type Confluence (Vue 3 + Node.js/TypeScript + PostgreSQL + Prisma + Yjs).

## Prerequis

- Node.js 24+
- npm 10+
- Docker + Docker Compose

## Demarrage local

1. Copier `.env.example` vers `.env`.
2. Lancer les dependances: `docker compose -f docker-compose.dev.yml up -d`.
3. Installer: `npm ci`.
4. Migrer: `npm --workspace backend run prisma:migrate`.
5. Lancer: `npm run dev`.

## Tests

- Backend: `npm --workspace backend run test`
- Frontend: `npm --workspace frontend run test`

## Configuration OIDC

- `AUTH_PROVIDER=local|oidc` (defaut: `local`)
- `OIDC_TRANSPARENT_LOGIN=true|false` (defaut: `true`) : si `AUTH_PROVIDER=oidc`, la page `/login` lance automatiquement le SSO
- `OIDC_CA_CERT_PATH=/chemin/ca.pem` : certificat (ou bundle CA) de confiance pour les appels OIDC sortants
- `OIDC_TLS_INSECURE=true|false` (defaut: `false`) : desactive la verification TLS pour les appels OIDC sortants (debug uniquement)

## Administration site

- Promouvoir un compte existant en `SITE_ADMIN` par email: `npm --workspace backend run grant:site-admin -- user@example.com`
- Dans un conteneur `backend` ou `full`, la commande est identique depuis le repertoire `backend`:
	- `npm run grant:site-admin -- user@example.com`

## Build Docker (reseau entreprise)

Si votre proxy TLS injecte un certificat interne, le build Docker peut echouer avec `SELF_SIGNED_CERT_IN_CHAIN`.
Par defaut, les Dockerfiles du projet desactivent la verification SSL npm pendant le build (`NPM_CONFIG_STRICT_SSL=false`).
Pour forcer la verification stricte:

- `docker build -f .\Dockerfile.full --build-arg NPM_CONFIG_STRICT_SSL=true .`

## Couverture cible

La logique domaine + API vise >= 90% de couverture (a renforcer a mesure que les cas metiers augmentent).
