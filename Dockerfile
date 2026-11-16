# syntax=docker/dockerfile:1
# Semio : image de production. Trois étapes — front Vue, binaire Go statique qui l'embarque, exécution minimale.
# Ni Node.js ni compilateur Go dans l'image finale.

# --- 1. Front : même commande que `make build` (typecheck + Vite), sortie dans backend/web/dist.
FROM node:24-alpine AS front
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Binaire : version de Go de backend/go.mod, sans CGO (SQLite pur Go), fuseaux IANA embarqués par le code.
FROM golang:1.27.4-alpine AS back
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=front /src/backend/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/semio .

# --- 3. Exécution : Alpine (certificats racine pour R2, wget de BusyBox pour le healthcheck), utilisateur non-root.
FROM alpine:3.23
RUN addgroup -S -g 10001 semio \
 && adduser -S -D -H -u 10001 -G semio semio \
 && install -d -o semio -g semio -m 750 /pb_data
COPY --from=back /out/semio /usr/local/bin/semio
# Sauvegarde à la demande depuis le terminal du conteneur (test R2 avant ouverture au public).
COPY --chmod=755 deploy/sauvegarder.sh /usr/local/bin/semio-sauvegarde
USER 10001:10001
WORKDIR /pb_data
EXPOSE 8090
# Vrai contrôle applicatif : PocketBase répond 200 sur /api/health une fois la base ouverte et les migrations passées.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/semio"]
# Dans un conteneur, écouter sur toutes les interfaces : 127.0.0.1 serait injoignable par Traefik.
# /pb_data est le dossier de données de PocketBase : c'est lui que le volume doit porter.
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--encryptionEnv=PB_ENCRYPTION_KEY"]
