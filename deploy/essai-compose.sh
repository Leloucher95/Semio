#!/usr/bin/env bash
# Essai local jetable de compose.yaml (Docker requis) : image, démarrage, ports, durcissement, routes, variables,
# persistance, sauvegarde locale puis restauration dans un volume neuf. Rien n'est publié ; tout est supprimé à la fin.
# Usage, depuis la racine du dépôt : bash deploy/essai-compose.sh   (code de sortie 1 si un contrôle échoue)
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/.." || exit 1
S="$(mktemp -d)"; S="$(cd "$S" && pwd -W 2>/dev/null || pwd)"
ECHECS=0
P=semio-essai
CLE=$(openssl rand -hex 16)
MDP=$(openssl rand -hex 12)
printf 'APP_URL=http://semio.test\nPB_ENCRYPTION_KEY=%s\n' "$CLE" > "$S/essai.env"
DC="docker compose -p $P --env-file $S/essai.env -f compose.yaml"
C="docker run --rm --network ${P}_default curlimages/curl:latest -s"
ok() { echo "PASS  $1"; }
ko() { echo "FAIL  $1"; ECHECS=$((ECHECS + 1)); }
verifier() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else ko "$1 : attendu $3, obtenu $2"; fi; }
attendre() { for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$($DC ps -q semio)" 2>/dev/null)" = healthy ] && return 0; sleep 2; done; return 1; }

docker compose -p $P down -v > /dev/null 2>&1

echo "--- variable obligatoire absente"
docker compose -p $P -f compose.yaml config > /dev/null 2> "$S/config-err.txt" && ko "compose accepte l'absence de APP_URL" || ok "compose refuse sans APP_URL : $(grep -o 'APP_URL manquant[^"]*' "$S/config-err.txt" | head -1)"

echo "--- démarrage"
$DC up -d --build > "$S/up.log" 2>&1 || { ko "up"; tail -20 "$S/up.log"; exit 1; }
attendre && ok "conteneur healthy (healthcheck /api/health)" || { ko "healthcheck"; $DC logs --tail 30; }
ID=$($DC ps -q semio)

echo "--- ports et durcissement"
verifier "ports publiés sur l'hôte" "$(docker port "$ID" | wc -l | tr -d ' ')" "0"
verifier "PortBindings" "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$ID")" "{}"
verifier "utilisateur du processus" "$(docker exec "$ID" id -u)" "10001"
verifier "racine en lecture seule" "$(docker exec "$ID" sh -c 'touch /essai 2>/dev/null && echo ecrit || echo refuse')" "refuse"
verifier "node ou go dans l'image" "$(docker exec "$ID" sh -c 'command -v node go npm | wc -l' | tr -d ' ')" "0"
verifier "adresse d'écoute" "$(docker exec "$ID" sh -c 'netstat -ltn 2>/dev/null | grep -c ":::8090\|0.0.0.0:8090"')" "1"
verifier "volume monté sur /pb_data" "$(docker inspect -f '{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}{{end}}' "$ID")" "volume:${P}_pb_data:/pb_data"
verifier "base SQLite dans le volume" "$(docker exec "$ID" sh -c 'ls /pb_data | grep -c "^data.db$"')" "1"

echo "--- HTTP depuis le réseau Docker (comme Traefik)"
verifier "/api/health" "$($C -o /dev/null -w '%{http_code}' http://semio:8090/api/health)" "200"
verifier "interface /" "$($C http://semio:8090/ | grep -c '<div id="app">')" "1"
verifier "route profonde /planning/2028/2" "$($C -o /dev/null -w '%{http_code}' http://semio:8090/planning/2028/2)" "200"
verifier "route profonde sert l'application" "$($C http://semio:8090/planning/2028/2 | grep -c '<div id="app">')" "1"
JS=$($C http://semio:8090/ | grep -o '/assets/index-[^"]*\.js' | head -1)
verifier "script embarqué $JS" "$($C -o /dev/null -w '%{http_code}' "http://semio:8090$JS")" "200"
verifier "API inconnue" "$($C -o /dev/null -w '%{http_code}' http://semio:8090/api/inconnu)" "404"
verifier "API sans session" "$($C -o /dev/null -w '%{http_code}' http://semio:8090/api/collections/taches/records)" "200"

echo "--- variables d'environnement"
verifier "alerte R2 absente signalée" "$($DC logs 2>&1 | grep -c 'SAUVEGARDES DÉSACTIVÉES')" "1"
verifier "APP_ENV dans le conteneur" "$(docker exec "$ID" printenv APP_ENV)" "production"
docker exec "$ID" /usr/local/bin/semio superuser upsert admin@semio.test "$MDP" --dir=/pb_data --encryptionEnv=PB_ENCRYPTION_KEY > /dev/null 2>&1 && ok "superuser créé par la CLI dans le conteneur" || ko "superuser upsert"
JETON=$($C -H 'Content-Type: application/json' -d "{\"identity\":\"admin@semio.test\",\"password\":\"$MDP\"}" http://semio:8090/api/collections/_superusers/auth-with-password | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -n "$JETON" ] && ok "connexion superuser" || ko "connexion superuser"
REGL=$($C -H "Authorization: $JETON" http://semio:8090/api/settings)
verifier "APP_URL appliqué aux réglages" "$(echo "$REGL" | grep -o '"appURL":"[^"]*"')" '"appURL":"http://semio.test"'
verifier "limitation de débit (production)" "$(echo "$REGL" | grep -o '"rateLimits":{.*' | grep -o '"enabled":[a-z]*' | head -1)" '"enabled":true'
verifier "en-tête de proxy de confiance" "$(echo "$REGL" | grep -o '"trustedProxy":{"headers":\[[^]]*\]')" '"trustedProxy":{"headers":["X-Forwarded-For"]'
verifier "réglages chiffrés en base (PB_ENCRYPTION_KEY)" "$(docker exec "$ID" sh -c 'grep -c "\"appURL\"" /pb_data/data.db')" "0"

echo "--- données puis recréation du conteneur"
MAIL=persist@semio.test
verifier "inscription" "$($C -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"email\":\"$MAIL\",\"password\":\"$MDP\",\"passwordConfirm\":\"$MDP\"}" http://semio:8090/api/collections/users/records)" "200"
connexion() { $C -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"identity\":\"$MAIL\",\"password\":\"$MDP\"}" http://semio:8090/api/collections/users/auth-with-password; }
verifier "connexion avant recréation" "$(connexion)" "200"
$DC up -d --force-recreate > /dev/null 2>&1; attendre
NOUVEL=$($DC ps -q semio)
[ "$NOUVEL" != "$ID" ] && ok "conteneur recréé (--force-recreate)" || ko "conteneur non recréé"
verifier "connexion après recréation" "$(connexion)" "200"
$DC down > /dev/null 2>&1; $DC up -d > /dev/null 2>&1; attendre
verifier "connexion après down puis up" "$(connexion)" "200"
ID=$($DC ps -q semio)

echo "--- commande semio-sauvegarde (celle de la documentation, dans le conteneur)"
verifier "semio-sauvegarde crée et liste une archive" "$(docker exec -e SEMIO_ADMIN=admin@semio.test -e SEMIO_ADMIN_PASSWORD="$MDP" "$ID" semio-sauvegarde 2>&1 | grep -c '"key":"manuelle-[0-9-]*.zip"')" "1"
verifier "semio-sauvegarde refuse un mauvais mot de passe" "$(docker exec -e SEMIO_ADMIN=admin@semio.test -e SEMIO_ADMIN_PASSWORD=faux "$ID" semio-sauvegarde > /dev/null 2>&1; echo $?)" "1"

echo "--- sauvegarde locale puis restauration sur une base jetable (sans R2)"
JETON=$($C -H 'Content-Type: application/json' -d "{\"identity\":\"admin@semio.test\",\"password\":\"$MDP\"}" http://semio:8090/api/collections/_superusers/auth-with-password | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
verifier "création d'une sauvegarde (racine en lecture seule)" "$($C -o /dev/null -w '%{http_code}' -H "Authorization: $JETON" -H 'Content-Type: application/json' -d '{"name":"essai.zip"}' http://semio:8090/api/backups)" "204"
docker cp "$ID:/pb_data/backups/essai.zip" "$S/essai.zip" > /dev/null 2>&1 && ok "archive récupérée ($(du -k "$S/essai.zip" | cut -f1) Ko)" || ko "archive introuvable"
R=semio-restaure
docker compose -p $R down -v > /dev/null 2>&1
docker volume create ${R}_pb_data > /dev/null
docker run --rm -v ${R}_pb_data:/pb_data -v "$S:/src:ro" alpine:3.23 sh -c 'unzip -q /src/essai.zip -d /pb_data && chown -R 10001:10001 /pb_data && chmod 750 /pb_data' && ok "archive décompressée dans un volume neuf" || ko "décompression"
DR="docker compose -p $R --env-file $S/essai.env -f compose.yaml"
$DR up -d > /dev/null 2>&1
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' "$($DR ps -q semio)" 2>/dev/null)" = healthy ] && break; sleep 2; done
CR="docker run --rm --network ${R}_default curlimages/curl:latest -s"
verifier "restauration : connexion du compte" "$($CR -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"identity\":\"$MAIL\",\"password\":\"$MDP\"}" http://semio:8090/api/collections/users/auth-with-password)" "200"
verifier "restauration : superuser et réglages chiffrés lisibles" "$($CR -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"identity\":\"admin@semio.test\",\"password\":\"$MDP\"}" http://semio:8090/api/collections/_superusers/auth-with-password)" "200"
printf 'APP_URL=http://semio.test\nPB_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)" > "$S/mauvaise.env"
docker compose -p $R --env-file "$S/mauvaise.env" -f compose.yaml up -d --force-recreate > /dev/null 2>&1; sleep 12
echo "INFO  avec une autre PB_ENCRYPTION_KEY : état=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$(docker compose -p $R ps -aq semio)" 2>/dev/null) ; $(docker compose -p $R logs --tail 3 2>&1 | tail -1 | cut -c1-160)"

echo "--- nettoyage"
docker compose -p $R down -v > /dev/null 2>&1
docker volume rm ${R}_pb_data > /dev/null 2>&1
$DC down -v > /dev/null 2>&1
rm -rf "$S"
verifier "volumes d'essai restants" "$(docker volume ls -q | grep -c 'semio-essai\|semio-restaure')" "0"
[ "$ECHECS" -eq 0 ] && echo "RÉSULTAT : tous les contrôles passent" || { echo "RÉSULTAT : $ECHECS contrôle(s) en échec"; exit 1; }
