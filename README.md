# Semio

**Semio** — « La semaine prend forme. » Application web en français : tâches réutilisables, semaine type, plan mensuel indépendant, suivi quotidien et impression A4.

Front Vue 3 + Vite + TypeScript + Pinia + Tailwind 4 ; back Go + PocketBase (librairie) + SQLite ; un seul binaire qui embarque le front.

## Lancer en local

Prérequis : Go ≥ 1.27, Node ≥ 22, GNU make (facultatif).

```bash
make install   # dépendances npm
make dev       # PocketBase sur 127.0.0.1:8090 + Vite sur http://localhost:5173
```

Ouvrir http://localhost:5173. L'admin PocketBase est sur http://127.0.0.1:8090/_/ (créer un superuser : `cd backend && go run . superuser upsert EMAIL MOTDEPASSE`).

## Commandes

| make | Sans make (Windows, deux terminaux pour `dev`) |
|---|---|
| `make dev` | `cd backend && go run . serve` puis `cd frontend && npm run dev` |
| `make test` | `cd backend && go vet ./... && go test ./...` puis `cd frontend && npm run typecheck && npm test -- --run` |
| `make build` | `cd frontend && npm run build` puis `cd backend && go build -o semio.exe .` |
| `make e2e` | build, puis `cd frontend && npm run e2e` (première fois : `npx playwright install chromium`) |
| `make verify` | `make test` puis `make e2e` |
| `make build-linux` | binaire de production `backend/semio-linux-amd64` |

`npm run build` écrit le front dans `backend/web/dist`, que Go embarque (`embed.FS`). Les tests E2E pilotent le **vrai binaire** sur une base jetable (`frontend/.e2e-data`).

## Dépôt

```
backend/     main.go, migrations/ (schéma), internal/ (domain, security, planning), web/ (front embarqué)
frontend/    src/ (views, components, stores, composables, lib, print), tests/e2e (Playwright)
deploy/      service systemd, exemple Caddy, procédure de déploiement et de restauration
docs/        cahier des charges d'origine, architecture, critères d'acceptation, matrice de tests
```

Suivi réel : [PROGRESS.md](PROGRESS.md). Décisions : [DECISIONS.md](DECISIONS.md). Déploiement : [deploy/README.md](deploy/README.md).
