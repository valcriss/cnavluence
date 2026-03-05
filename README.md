# Cnavluence

Plateforme collaborative type Confluence (Vue 3 + Node.js/TypeScript + PostgreSQL + Prisma + Yjs).

## Demarrage local

1. Copier `.env.example` vers `.env`.
2. Lancer les dependances: `docker compose -f docker-compose.dev.yml up -d`.
3. Installer: `npm install`.
4. Migrer: `npm --workspace backend run prisma:migrate`.
5. Lancer: `npm run dev`.

## Tests

- Backend: `npm --workspace backend run test`
- Frontend: `npm --workspace frontend run test`

## Couverture cible

La logique domaine + API vise >= 90% de couverture (a renforcer a mesure que les cas metiers augmentent).
