# Semio — commandes de développement. Sans make (Windows) : voir README.md.
EXE := $(if $(filter Windows_NT,$(OS)),.exe,)

.PHONY: dev dev-back dev-front install test e2e build build-linux verify

install:
	cd frontend && npm ci

# PocketBase (127.0.0.1:8090) + Vite (5173, proxy /api) en parallèle.
dev:
	$(MAKE) -j2 dev-back dev-front

dev-back:
	cd backend && go run . serve --http=127.0.0.1:8090

dev-front:
	cd frontend && npm run dev

test:
	cd backend && go vet ./... && go test ./...
	cd frontend && npm run typecheck && npm test -- --run

# Build du front dans backend/web/dist, puis binaire unique qui l'embarque.
build:
	cd frontend && npm run build
	cd backend && go build -o semio$(EXE) .

# Binaire de production pour le VPS (SQLite pur Go : pas de CGO).
build-linux: export GOOS = linux
build-linux: export GOARCH = amd64
build-linux: export CGO_ENABLED = 0
build-linux:
	cd frontend && npm run build
	cd backend && go build -trimpath -ldflags "-s -w" -o semio-linux-amd64 .

# Playwright pilote le vrai binaire (front embarqué) sur une base jetable.
e2e: build
	cd frontend && npm run e2e

verify: test e2e
