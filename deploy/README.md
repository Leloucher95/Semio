# Déployer Semio

Un binaire Go unique (API PocketBase + front embarqué), un service systemd non-root en écoute sur `127.0.0.1:8090`, un reverse proxy HTTPS devant, des sauvegardes quotidiennes vers Cloudflare R2. Pas de Docker, pas de Node sur le serveur.

> **Avant d'ouvrir au public** : les deux points de la section [Validation de production](#validation-de-production) ne sont pas faits tant que vous ne les avez pas exécutés vous-même. Sans R2 configuré, Semio démarre mais **sans aucune sauvegarde** (alerte dans les journaux).

## 1. Construire le binaire

Sur le poste de développement (Go ≥ 1.27, Node ≥ 22) :

```bash
make verify        # tests Go, Vitest, typecheck, build, parcours Playwright
```

```bash
make build-linux   # → backend/semio-linux-amd64 (linux/amd64, sans CGO)
```

Sans make : `cd frontend && npm ci && npm run build`, puis `cd backend && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o semio-linux-amd64 .`

## 2. Préparer le serveur (une fois)

```bash
sudo useradd --system --home /var/lib/semio --shell /usr/sbin/nologin semio
sudo install -d -o semio -g semio -m 750 /var/lib/semio /var/lib/semio/pb_data
sudo install -d -o root -g semio -m 750 /etc/semio
```

Copier depuis le poste de développement : `backend/semio-linux-amd64`, `deploy/semio.service`, `.env.example`.

```bash
sudo install -o root -g root -m 755 semio-linux-amd64 /usr/local/bin/semio
sudo install -o root -g semio -m 640 .env.example /etc/semio/semio.env
sudo install -o root -g root -m 644 semio.service /etc/systemd/system/semio.service
```

Éditer `/etc/semio/semio.env` : `APP_ENV=production`, `APP_URL=https://votre-domaine`, `PB_ENCRYPTION_KEY` (`openssl rand -hex 16`, à conserver hors du serveur), les variables `R2_*`, et `TRUSTED_PROXY_HEADERS` selon votre proxy (voir le fichier).

## 3. Compte administrateur PocketBase

L'admin (`/_/`) sert à consulter les journaux et les sauvegardes, pas à modifier le schéma (il vit dans les migrations Go). Mot de passe long et unique, jamais dans le dépôt.

```bash
sudo -u semio sh -c 'set -a; . /etc/semio/semio.env; exec /usr/local/bin/semio superuser upsert admin@votre-domaine "MOT-DE-PASSE-LONG" --dir=/var/lib/semio/pb_data --encryptionEnv=PB_ENCRYPTION_KEY'
```

## 4. Démarrer

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now semio
```

```bash
curl -s http://127.0.0.1:8090/api/health
```

```bash
sudo journalctl -u semio -n 50 --no-pager | grep -i alerte
```

La dernière commande ne doit rien afficher. `ALERTE : SAUVEGARDES DÉSACTIVÉES` signifie que la configuration R2 est absente ou incomplète.

## 5. Reverse proxy

- **Aucun proxy sur le VPS** : installer Caddy et adapter `Caddyfile.example` (HTTPS automatique).
- **Caddy déjà en place** : ajouter uniquement le bloc du domaine Semio, puis `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
- **Nginx déjà en place** : ajouter un `server` pour ce domaine, sans modifier les autres :

```nginx
server {
    server_name semio.example.com;
    listen 443 ssl;                      # certificats : selon votre installation (certbot…)
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 360s;         # PocketBase garde des connexions ouvertes (temps réel)
    }
}
```

Toujours valider la configuration (`nginx -t`, `caddy validate`) **avant** de recharger, et vérifier ensuite que les autres sites répondent.

Derrière le proxy Cloudflare (nuage orange) : `TRUSTED_PROXY_HEADERS=CF-Connecting-IP`, et n'accepter sur 443 que les adresses de Cloudflare, sinon cet en-tête est falsifiable. Sans Cloudflare : `TRUSTED_PROXY_HEADERS=X-Forwarded-For`.

## 6. Mettre à jour

```bash
sudo install -o root -g root -m 755 /usr/local/bin/semio /usr/local/bin/semio.precedent
sudo install -o root -g root -m 755 semio-linux-amd64 /usr/local/bin/semio
sudo systemctl restart semio && sudo journalctl -u semio -n 20 --no-pager
```

Les migrations de schéma s'appliquent au démarrage. Déclencher une sauvegarde avant toute mise à jour (admin → Settings → Backups). Retour arrière : remettre `semio.precedent` **et** restaurer la sauvegarde si une migration a tourné.

## 7. Sauvegardes et restauration

Avec les variables `R2_*`, Semio règle PocketBase à chaque démarrage : sauvegarde complète de `pb_data` (archive zip) tous les jours à 02:00 dans le bucket R2, 14 archives conservées. Rien n'est gardé sur le disque du VPS. Clé d'API R2 : limitée au bucket de sauvegarde, lecture + écriture.

**Restaurer** (sur un serveur de test d'abord) :

1. Télécharger l'archive voulue depuis R2 (tableau de bord Cloudflare, ou admin Semio → Settings → Backups).
2. Arrêter le service et mettre de côté les données actuelles :

```bash
sudo systemctl stop semio && sudo mv /var/lib/semio/pb_data /var/lib/semio/pb_data.avant-restauration
```

3. Décompresser l'archive dans un `pb_data` neuf et redémarrer :

```bash
sudo install -d -o semio -g semio -m 750 /var/lib/semio/pb_data && sudo -u semio unzip sauvegarde.zip -d /var/lib/semio/pb_data && sudo systemctl start semio
```

4. Se connecter avec un compte existant et vérifier un mois récent. La même `PB_ENCRYPTION_KEY` est nécessaire.

Cette procédure (décompresser dans un dossier vide, démarrer, retrouver comptes, plans et suivi) est exécutée automatiquement par le test `TestSauvegardePuisRestauration` sur une base jetable, avec une archive locale. Sous Linux, l'admin propose aussi « Restore » directement sur une archive.

## Validation de production

À faire par le propriétaire, avec ses accès ; non exécutable depuis le poste de développement :

| Réf. | Contrôle | État |
|---|---|---|
| O03 | Sauvegarde réelle vers un bucket R2 de test, puis restauration sur un serveur jetable, données vérifiées | **non exécuté** (pas d'identifiants R2) |
| O04 | Après ajout du bloc de reverse proxy, les autres sites du VPS répondent toujours | **non exécuté** (pas d'accès au VPS) |
| — | Aperçu avant impression dans Firefox (semaine et suivi du mois) | **non exécuté** (Firefox de test bloqué sur le poste) |
| — | Glisser-déposer au doigt sur un vrai téléphone | **non exécuté** (le bouton « Placer » est testé) |

## Exploitation courante

- Journaux : `sudo journalctl -u semio -f` ; requêtes et erreurs applicatives dans l'admin → Logs.
- Mot de passe oublié d'un utilisateur, sans SMTP : admin → collection `users` → modifier le mot de passe.
- Données : uniquement `/var/lib/semio/pb_data` (base SQLite). Aucun fichier utilisateur n'est stocké en V1.
- L'inscription est ouverte : pour la fermer, admin → collection `users` → API Rules → Create rule réservée aux superusers.
