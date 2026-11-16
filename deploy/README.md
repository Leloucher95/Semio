# Déployer Semio avec Dokploy

Une application Docker Compose, un seul service : le binaire Go statique qui embarque le front Vue, PocketBase et SQLite. Les données vivent dans un volume Docker nommé monté sur `/pb_data`. Aucun port n'est publié sur l'hôte : Dokploy branche Traefik sur le service quand vous ajoutez le domaine. Sauvegardes quotidiennes vers Cloudflare R2, 14 archives conservées.

| Fichier | Rôle |
|---|---|
| `compose.yaml` (racine) | Le service, ses variables, son volume, son healthcheck, son durcissement |
| `Dockerfile` (racine) | Build en trois étapes : Vue (Node 24) → Go 1.27.4 → Alpine 3.23, utilisateur non-root, ~50 Mo |
| `.env.example` (racine) | Liste des variables à saisir dans Dokploy. Aucun secret réel |
| `deploy/essai-compose.sh` | Essai local complet de la pile sur une base jetable |
| `deploy/sauvegarder.sh` | Devient `semio-sauvegarde` dans l'image : sauvegarde immédiate depuis le terminal du conteneur |
| `deploy/systemd.md` | Ancienne méthode (binaire + systemd + reverse proxy), conservée comme alternative |

> **Ordre imposé** : déployer **sans domaine** → créer le superuser → tester une vraie sauvegarde R2 et sa restauration → seulement ensuite ajouter le domaine. Tant qu'aucun domaine n'est ajouté, le service n'est joignable que depuis le réseau Docker du serveur.

Les libellés d'interface ci-dessous viennent de la documentation Dokploy (docs.dokploy.com) ; ils peuvent varier légèrement selon votre version. Je n'ai pas eu accès à votre instance : les étapes Dokploy sont **documentées, non exécutées**. Ce qui a été réellement exécuté est listé dans [Ce qui a été vérifié](#ce-qui-a-été-vérifié).

## 0. Avant de commencer

1. **Essai local** (Docker requis), depuis la racine du dépôt :

```bash
bash deploy/essai-compose.sh
```

   Il doit se terminer par `RÉSULTAT : tous les contrôles passent`.

2. **Clé de chiffrement**, à générer une fois et à ranger dans votre gestionnaire de mots de passe, hors du serveur :

```bash
openssl rand -hex 16
```

   Elle chiffre les réglages stockés en base (dont les clés R2). **Sans elle, une sauvegarde est inutilisable** : avec une autre clé, Semio refuse de démarrer (`cipher: message authentication failed`). Ne jamais la changer après la mise en service.

3. **Cloudflare R2** : un bucket privé dédié (ex. `semio-backups`) et un jeton d'API R2 limité à ce bucket, en lecture et écriture. Notez l'identifiant de compte, l'identifiant de clé et le secret.

4. **DNS** : préparez l'enregistrement du domaine vers le VPS, mais ne l'utilisez dans Dokploy qu'à l'étape 6.

## 1. Créer le service Docker Compose

Dans Dokploy : créer (ou ouvrir) un projet, puis créer un service **Compose** et choisir le type **Docker Compose** (pas « Stack » : le mode Swarm ne construit pas d'image).

## 2. Connecter le dépôt GitHub

Dans l'onglet **General** du service, section fournisseur : **GitHub**, dépôt `Leloucher95/Semio`. Si GitHub n'est pas encore relié à Dokploy, l'autoriser d'abord dans les réglages Git de Dokploy, en limitant l'accès à ce seul dépôt.

## 3. Branche et chemin du fichier Compose

- **Branche** : celle qui contient `compose.yaml` (`main` une fois la branche `deploy-dokploy` fusionnée).
- **Compose Path** : `./compose.yaml`
- **Auto Deploy** (onglet General) : **désactivé** pour commencer. Chaque déploiement se lance à la main, après une sauvegarde.

Enregistrer, sans déployer encore.

## 4. Variables secrètes

Onglet **Environment** : coller les lignes ci-dessous avec vos valeurs. Dokploy les écrit dans un fichier `.env` à côté de `compose.yaml`, qui les lit par `${VARIABLE}`. Elles ne sont ni dans Git ni dans l'image.

```
APP_URL=https://semio.votre-domaine.fr
PB_ENCRYPTION_KEY=<les 32 caractères générés à l'étape 0>
R2_ACCOUNT_ID=<identifiant de compte Cloudflare>
R2_BACKUPS_BUCKET=semio-backups
R2_ACCESS_KEY_ID=<identifiant de la clé R2>
R2_SECRET_ACCESS_KEY=<secret de la clé R2>
```

- `APP_URL` et `PB_ENCRYPTION_KEY` sont obligatoires : sans eux, le déploiement échoue tout de suite avec un message explicite.
- Variables R2 absentes ou incomplètes : Semio démarre **sans aucune sauvegarde** et l'écrit dans ses journaux (`ALERTE : SAUVEGARDES DÉSACTIVÉES`). Ne pas ajouter de domaine dans cet état.
- Derrière le proxy Cloudflare (nuage orange), ajouter `TRUSTED_PROXY_HEADERS=CF-Connecting-IP`. Sinon ne rien mettre : la valeur par défaut `X-Forwarded-For` correspond à Traefik.
- Les autres variables (`BACKUP_CRON`, `BACKUP_KEEP`, `SMTP_*`…) sont facultatives : voir `.env.example`.

## 5. Volume SQLite

Rien à créer à la main. `compose.yaml` déclare le volume nommé `pb_data`, monté sur `/pb_data`, le dossier de données de PocketBase (`serve --dir=/pb_data`). Docker le crée au premier déploiement sous le nom `<nom-de-l-application-dokploy>_pb_data` et le conserve d'un déploiement à l'autre.

- Ne pas activer de montage supplémentaire sur `/pb_data`, ne pas remplacer le volume par un chemin de l'hôte.
- Ne jamais lancer `docker compose down -v` ni « supprimer les volumes » sur ce service : c'est la base de données.
- Un seul réplica : SQLite n'accepte qu'un processus écrivain.

## 6. Premier démarrage, sans domaine

1. Cliquer sur **Deploy**. Le premier build prend quelques minutes (téléchargement des dépendances).
2. Onglet **Logs** : attendre `Server started at http://0.0.0.0:8090`. Vérifier qu'il n'y a **aucune** ligne `ALERTE`. Dans la liste des conteneurs, l'état doit passer à `healthy` (healthcheck sur `/api/health`).
3. Ouvrir le terminal du conteneur dans Dokploy (ou, en SSH sur le VPS, `docker exec -it <conteneur> sh`) et créer le superuser, avec un mot de passe long, unique, sans guillemet ni antislash :

```bash
semio superuser upsert admin@votre-domaine.fr 'MOT-DE-PASSE-LONG-ET-UNIQUE' --dir=/pb_data --encryptionEnv=PB_ENCRYPTION_KEY
```

   Au tout premier démarrage, PocketBase écrit dans les journaux un lien d'installation temporaire : ne pas le partager, la commande ci-dessus le rend inutile.

4. Santé, toujours depuis le terminal du conteneur :

```bash
wget -qO- http://127.0.0.1:8090/api/health
```

## 7. Tester la sauvegarde R2 et la restauration

**À faire avant d'ajouter le domaine.** Ce test n'a pas pu être exécuté à votre place (pas d'identifiants R2).

1. Dans le terminal du conteneur :

```bash
semio-sauvegarde
```

   La commande demande le compte superuser, crée une archive `manuelle-AAAAMMJJ-HHMMSS.zip` et liste les archives. En cas d'échec, les journaux du conteneur donnent la cause (bucket, clé, droits).

2. Dans le tableau de bord Cloudflare, vérifier que l'archive est bien dans le bucket, puis la télécharger sur votre poste.

3. **Restauration sur une base jetable, sur votre poste** (pas sur le VPS) — depuis la racine du dépôt, avec l'archive renommée `sauvegarde.zip` dans le dossier courant et un fichier `restaure.env` contenant `APP_URL=http://localhost` et **la même** `PB_ENCRYPTION_KEY` :

```bash
docker volume create semio-restaure_pb_data
```

```bash
docker run --rm -v semio-restaure_pb_data:/pb_data -v "$PWD:/src:ro" alpine:3.23 sh -c 'unzip -q /src/sauvegarde.zip -d /pb_data && chown -R 10001:10001 /pb_data'
```

```bash
docker compose -p semio-restaure --env-file restaure.env run --rm -p 127.0.0.1:8090:8090 semio
```

   Le port n'est publié que sur votre poste (`127.0.0.1`). Ouvrir `http://127.0.0.1:8090`, se connecter avec un compte existant et vérifier un mois récent, puis arrêter avec Ctrl+C. Nettoyer ensuite et supprimer `restaure.env` et `sauvegarde.zip` :

```bash
docker compose -p semio-restaure down -v
```

```bash
docker volume rm semio-restaure_pb_data
```

4. La sauvegarde planifiée tourne chaque jour à 02:00 (UTC). Le lendemain du déploiement, vérifier qu'une archive datée est apparue dans le bucket, puis une fois par mois que le bucket en contient 14 au plus.

**Restaurer la production** : arrêter le service dans Dokploy, vider le volume `<application>_pb_data` et y décompresser l'archive avec la même commande `docker run … unzip … chown` que ci-dessus (en remplaçant le nom du volume), puis redéployer avec la même `PB_ENCRYPTION_KEY`.

## 8. Restreindre l'administration PocketBase

L'admin (`/_/`) et l'API des superusers seront servies sur le même domaine que l'application. Stratégie retenue :

- **Un seul superuser**, créé par la ligne de commande dans le conteneur, mot de passe long et unique stocké dans un gestionnaire de mots de passe. Pas de création depuis le navigateur.
- **Limitation de débit** de PocketBase active en production (`APP_ENV=production`, fixé par `compose.yaml`) : elle freine les essais de mots de passe.
- **Pas de SMTP** tant qu'il n'est pas nécessaire : aucune réinitialisation de mot de passe par e-mail n'est alors possible.
- L'admin sert à lire les journaux et les sauvegardes, pas à modifier le schéma (il vit dans les migrations Go) ni les règles d'accès.
- **Durcissement supplémentaire, non testé ici** : limiter `/_/` et `/api/collections/_superusers/` à votre adresse IP. La gestion native des domaines de Dokploy ne le propose pas pour un service Compose d'après sa documentation ; cela demande des labels Traefik écrits à la main (routeur dédié + middleware `ipallowlist`) ou une règle Cloudflare (WAF) si le domaine passe par Cloudflare. À ne mettre en place qu'après l'avoir essayé sur un domaine de test.

## 9. Ajouter le domaine et le HTTPS

Seulement après les étapes 7 et 8.

1. Onglet **Domains** → **Add Domain** : service `semio`, **Host** = votre domaine (le même que `APP_URL`), **Container Port** = `8090`, **HTTPS** activé, **Certificate** = `letsencrypt`.
2. **Redéployer** : pour un service Compose, un domaine ajouté ou modifié ne prend effet qu'au déploiement suivant. Dokploy ajoute lui-même les labels Traefik et le réseau `dokploy-network` ; `compose.yaml` n'en contient pas et n'en a pas besoin (bouton **Preview Compose** pour voir le fichier final).
3. Laisser une dizaine de secondes à Traefik pour obtenir le certificat, puis vérifier :

```bash
curl -s https://semio.votre-domaine.fr/api/health
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://semio.votre-domaine.fr/planning/2028/2
```

   La seconde commande doit afficher `200` (route profonde servie par l'application).

4. Vérifier que les autres sites du VPS répondent toujours, et qu'aucun port de Semio n'est publié : `docker ps --format '{{.Names}} {{.Ports}}'` doit montrer `8090/tcp` sans `0.0.0.0:`.
5. L'inscription est ouverte à tous par défaut. Pour la fermer : admin → collection `users` → API Rules → Create rule réservée aux superusers.

## 10. Mettre à jour et revenir en arrière

**Mettre à jour**

1. `make verify` au vert sur le commit à déployer, puis fusion dans la branche déployée.
2. Dans le terminal du conteneur : `semio-sauvegarde` (les migrations de schéma s'appliquent au démarrage et ne se défont pas).
3. Dokploy → **Deploy**. Suivre les journaux jusqu'à `Server started`, vérifier l'état `healthy` puis `/api/health`.

Le service est recréé à chaque déploiement : comptez quelques secondes d'indisponibilité (un seul réplica, voulu).

**Revenir en arrière**

- Sans migration entre les deux versions : `git revert` du commit fautif sur la branche déployée (ou repointer la branche sur le commit précédent), puis **Deploy**. Le volume n'est pas touché.
- Si une migration a tourné : revenir au code précédent **et** restaurer la sauvegarde prise à l'étape 2 (voir « Restaurer la production »).

La documentation Dokploy consultée ne décrit pas de retour arrière automatique pour les services Compose : la procédure ci-dessus est manuelle.

## Ce qui a été vérifié

Exécuté en local (Docker 29, Compose v5) par `deploy/essai-compose.sh`, sur une base jetable :

- construction de l'image (49,6 Mo), démarrage, healthcheck `healthy` ;
- aucun port publié sur l'hôte ; processus sous l'uid 10001 ; racine en lecture seule ; ni Node ni Go dans l'image ; écoute sur `0.0.0.0:8090` ;
- `/api/health`, interface, route profonde, script embarqué, 404 JSON d'une route d'API inconnue — interrogés depuis le réseau Docker, comme le fera Traefik ;
- variables : refus sans `APP_URL`, alerte sans R2, `APP_URL`, limitation de débit et en-tête de proxy appliqués, réglages chiffrés en base ; avec des variables R2 complètes (factices) : plus d'alerte, planification `0 2 * * *`, 14 archives ;
- persistance après `up --force-recreate` puis `down` / `up` ;
- `semio-sauvegarde`, puis restauration de l'archive dans un volume neuf (compte et superuser retrouvés) ; refus de démarrer avec une autre clé de chiffrement ;
- la commande de restauration d'essai (`compose run -p 127.0.0.1:…`) : santé et interface joignables depuis le poste, port lié à `127.0.0.1` seulement ;
- présence des certificats racine dans l'image (nécessaires à R2).

**Non exécuté** : tout ce qui se passe dans Dokploy et sur le VPS (étapes 1 à 10), le routage Traefik et le certificat, une sauvegarde réelle vers R2 et sa restauration, la restriction par adresse IP de l'admin, la non-régression des autres sites du VPS.

## Exploitation courante

- Journaux : onglet **Logs** de Dokploy ; requêtes et erreurs applicatives dans l'admin → Logs.
- Mot de passe oublié d'un utilisateur, sans SMTP : admin → collection `users` → modifier le mot de passe.
- Données : uniquement le volume `pb_data`. Aucun fichier utilisateur n'est stocké.
