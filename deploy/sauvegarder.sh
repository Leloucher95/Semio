#!/bin/sh
# Installé dans l'image sous le nom `semio-sauvegarde`.
# Déclenche tout de suite une sauvegarde PocketBase (vers R2 si les variables R2_* sont complètes, sinon dans
# /pb_data/backups) puis liste les archives vues par PocketBase. À lancer DANS le conteneur :
#   semio-sauvegarde
# Le compte superuser est demandé au clavier (ou lu dans SEMIO_ADMIN / SEMIO_ADMIN_PASSWORD). Rien n'est enregistré.
set -eu
API=http://127.0.0.1:8090/api

if [ -z "${SEMIO_ADMIN:-}" ]; then
  printf 'E-mail du superuser : ' >&2
  read -r SEMIO_ADMIN
fi
if [ -z "${SEMIO_ADMIN_PASSWORD:-}" ]; then
  printf 'Mot de passe (non affiché) : ' >&2
  stty -echo 2>/dev/null || true
  read -r SEMIO_ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  printf '\n' >&2
fi

# shortcut: le JSON est assemblé à la main, donc pas de guillemet ni d'antislash dans l'e-mail ou le mot de passe ;
# passer par l'admin (/_/ → Settings → Backups) si le mot de passe en contient.
JETON=$(wget -qO- --header 'Content-Type: application/json' \
  --post-data "{\"identity\":\"$SEMIO_ADMIN\",\"password\":\"$SEMIO_ADMIN_PASSWORD\"}" \
  "$API/collections/_superusers/auth-with-password" | sed 's/.*"token":"\([^"]*\)".*/\1/') || {
  echo 'ÉCHEC : connexion du superuser refusée.' >&2
  exit 1
}

NOM="manuelle-$(date -u +%Y%m%d-%H%M%S).zip"
wget -qO- --header "Authorization: $JETON" --header 'Content-Type: application/json' \
  --post-data "{\"name\":\"$NOM\"}" "$API/backups" || {
  echo "ÉCHEC : la sauvegarde $NOM n'a pas été créée (voir les journaux du conteneur : identifiants ou bucket R2 ?)." >&2
  exit 1
}
echo "Sauvegarde créée : $NOM"
echo 'Archives connues de PocketBase :'
wget -qO- --header "Authorization: $JETON" "$API/backups" | sed 's/},{/}\n{/g'
echo
