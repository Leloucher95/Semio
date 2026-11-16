# Progression réelle — Semio

> Ce fichier décrit des faits constatés. Ne coche rien uniquement parce que l'étape a été prévue.

- [x] P0 — Bootstrap : Go/PocketBase, Vue/Vite, commandes, tests minimaux, dev fonctionnel
- [x] P1 — Auth + collections + sécurité A/B + relations + bibliothèque
- [x] P2 — Modèles + grille + formulaire + pointer drag + tests collisions
- [x] P3 — Plans mensuels + snapshot + duplication + aujourd'hui + suivi
- [x] P4 — Impression A4 semaine/mois + tests navigateur
- [x] P5 — Binaire unique + systemd + R2 + restauration jetable
- [x] P6 — `make verify` complet, audit de stabilité, compte rendu factuel

## Journal

### P0 — 2026-11-16
- **Livré** : module Go `semio` (PocketBase v0.40.6 en librairie, front embarqué avec repli SPA), front Vue 3.5/Vite 8/Pinia/Tailwind 4, `lib/dates.ts`, Makefile + équivalents Windows dans le README.
- **Vérifié** : `make test` PASS (go vet, `go test ./...` : 2 paquets ; vue-tsc ; Vitest 10/10 dont D01–D04) ; `make build` PASS (binaire 36 Mo) ; binaire lancé sur base jetable : `/`, `/planning/2028/2` et `/api/health` répondent 200.
- **Reste** : tout le fonctionnel (P1+). Go et make n'étaient pas installés sur le poste : installés via scoop.

### P1 — 2026-11-16
- **Livré** : migration Go de toutes les collections (owner, API rules explicites, index uniques, `users.timezone`, plus de champ fichier), hook serveur `security.CheckRelations` (toute relation doit appartenir au même propriétaire), inscription/connexion/déconnexion, profil avec fuseau IANA, bibliothèque (rubriques, tâches créneau/objectif, archivage, saisie rapide multiligne).
- **Vérifié** : `go test ./...` PASS — S01–S08 par vraie API HTTP avec comptes A, B et invité sur les 9 collections (list/view/update/delete/owner/relations croisées) ; contrôle inverse : hook désactivé ⇒ 16 assertions rouges. `vue-tsc` PASS, Vitest 14/14. Playwright Chromium 3/3 sur le binaire (parcours bibliothèque + reconnexion, isolation A/B à l'écran, mauvais mot de passe).
- **Reste / limites** : l'inscription révèle qu'une adresse existe déjà (inhérent à une inscription ouverte) ; pas d'écran « mot de passe oublié » (voir DECISIONS).

### P2 — 2026-11-16
- **Livré** : semaines types (créer, renommer, supprimer, tâches membres y compris objectifs sans horaire), grille lundi–dimanche 06:00–22:00 au pas de 30 min (élargie si un bloc en sort), bouton « Placer » (un ou plusieurs jours, modification et retrait d'un bloc), glisser-déposer maison en Pointer Events (`useGridDrag` : dépôt depuis la liste, déplacement, étirement, fantôme, appui long tactile, Échap), refus de chevauchement côté écran **et** côté serveur, déplacements optimistes regroupés sur 300 ms avec retour arrière.
- **Vérifié** : `make test` PASS — Go : G03 (collisions partielle/englobante/englobée, adjacence permise, pas de 30 min, bornes, tâche non membre, `plan_tache` d'un autre plan) ; Vitest 32/32 dont G01, G02, G04 (`lib/grid`) et G05, G06 (`lib/sync` : rollback, réponse obsolète ignorée). `make e2e` PASS 6/6 — E03 souris (dépôt, déplacement, étirement, collision annulée sans requête), E04 clavier, E04 mobile (Pixel 7, cible ≥ 44 px).
- **Reste / limites** : glisser **au doigt** non automatisé (Playwright ne simule pas l'appui long tactile de façon fiable) — à valider à la main sur téléphone ; « Placer » est le chemin garanti sur mobile. Bug trouvé et corrigé par E04 mobile : la grille élargissait la page sur petit écran.

### P3 — 2026-11-16
- **Livré** : `POST /api/semio/apply-template` et `/api/semio/duplicate-month` (transactions, propriétaire tiré de la session, conflit 409 si le mois existe), instantané `plan_taches` (objectifs sans créneau compris), règles du suivi (date réelle dans le mois, tâche du même plan, `fait` dérivé des minutes quand il y a une cible), vue Mois (tableau tâches × jours, coches, navigation, appliquer, dupliquer, supprimer), vue Aujourd'hui/jour (coches 44 px, minutes, progression hebdomadaire, navigation), grille de la semaine d'un mois (modifiable sans toucher au modèle), fuseau du profil appliqué partout.
- **Vérifié** : `make verify` PASS. Go : M01–M09 (M09 = 6 duplications simultanées ⇒ 1 seul plan, répété 8 fois), D05, T01–T03, sécurité des routes (invité 401, compte B 404, mois invalides 400). Vitest 37/37 (dont `lib/suivi`). Playwright 9/9 : E01 (critères d'acceptation 1 à 8 et 10 sur février/mars 2028), E02 mobile (coche, minutes 60/120, rechargement, **annulation visible sur erreur 500**, navigation, pas de défilement horizontal, cible ≥ 44 px), fuseau (horloge figée à 23:30 UTC, navigateur à New York : Porto-Novo ⇒ 17 novembre, New York ⇒ 16).
- **Reste / limites** : la progression « x/N jours cette semaine » ne compte que les jours du mois affiché (semaine à cheval sur deux mois comptée en deux parties). Pas d'édition du nom/des cibles d'une tâche déjà copiée dans un mois (l'API l'autorise, pas d'écran). `go test -race` non exécuté (pas de compilateur C sur ce poste).

### P4 — 2026-11-16
- **Livré** : bouton « Imprimer » sur la semaine type, la semaine d'un mois et le suivi du mois ; `print.css` A4 paysage (`@page`, `print-color-adjust: exact`, interface masquée, semaine toujours sur une page, tableau mensuel avec en-tête répété et lignes insécables) ; option « Version vierge » (cases vides à l'impression, écran et données inchangés) ; avertissement à l'écran quand le suivi dépassera une page.
- **Vérifié** : Playwright Chromium 4/4 — P01 (semaine type et semaine de février 2028 : jours, heures, nom + horaires dans chaque bloc, aucune navigation/bouton/poignée, pas de débordement, PDF 1 page 842 × 595 pt), P02 (28/29/30/31 colonnes, initiale du 1er, nombre de colonnes de week-end, tableau rectangulaire, 1 page), P03 (12 et 16 tâches sur 31 jours ⇒ 1 page avec lignes ≥ 8 mm, cases ≥ 6 mm, texte ≥ 8 pt ; 30 tâches ⇒ plusieurs pages, les 30 lignes visibles), P04 (vierge). **Seuil mesuré : 16 tâches sur une page, 17 ⇒ 2 pages** (31 jours, 2 rubriques). PDF de référence relus à l'œil (semaine et mois 12 tâches). `make verify` PASS (13 parcours E2E).
- **NON EXÉCUTÉ — Firefox** : le Firefox de Playwright a été supprimé par la protection Windows du poste au premier lancement (`spawn UNKNOWN`, binaire disparu) ; non contourné. Reproduction ailleurs : `npx playwright install firefox` puis `E2E_FIREFOX=1 npm run e2e`. L'aperçu avant impression réel de Firefox reste à contrôler à la main.
- **Limite** : avec plus de 2 rubriques le seuil d'une page baisse d'environ une tâche par rubrique supplémentaire ; l'avertissement (seuil fixe à 16) peut donc arriver une ou deux tâches trop tard — la pagination, elle, reste correcte.

### P5 — 2026-11-16
- **Livré** : `backend/exploitation.go` (à chaque démarrage, depuis l'environnement : sauvegardes R2 dans `backups.s3`, quotidien 02:00, rétention 14 ; en-têtes de proxy de confiance ; limitation de débit en production ; SMTP facultatif), alerte `SAUVEGARDES DÉSACTIVÉES` sur la sortie d'erreur et dans les logs PocketBase quand R2 manque, repli SPA limité au front (une route d'API inconnue reste un 404 JSON), `make build-linux`, `deploy/` (`semio.service` durci, `Caddyfile.example`, README : installation, superuser, proxy Caddy/Nginx sans toucher aux autres sites, mise à jour, sauvegarde, restauration), `.env.example` aligné sur les variables réellement lues.
- **Vérifié** : `make verify` PASS (Go, Vitest 37/37, 16 parcours E2E). Go : O02 (sans R2 ou R2 incomplet ⇒ alerte, cron vide, S3 désactivé ; R2 complet ⇒ `backups.s3` exact ; retrait des variables ⇒ retour à désactivé), proxy/limitation, **restauration sur environnement jetable** (`TestSauvegardePuisRestauration` : archive PocketBase → dossier vide → démarrage → comptes, plans et suivi intacts, mot de passe valide). Playwright : O01/E05 sur le binaire (`/`, 5 routes profondes, script embarqué, rechargement connecté, API d'administration fermée). Binaire lancé sans R2 : alerte lue dans sa sortie, aucun dossier `backups` local créé. `make build-linux` : ELF x86-64 statique de 26 Mo.
- **NON EXÉCUTÉ — bloquant pour la mise en production** : O03 (sauvegarde réelle vers R2 puis restauration : pas d'identifiants), O04 (non-régression des autres sites du VPS : pas d'accès). Le binaire Linux n'a pas été lancé (poste Windows) : seule sa compilation est vérifiée ; le même code tourne dans le binaire Windows testé.

### P6 — 2026-11-16 — validation finale
- **Reprise depuis un clone propre** (`git clone` dans un dossier vide, commit `8f88b85`) : `make install` (0 vulnérabilité npm) puis `make verify` ⇒ code de sortie 0. Go : 2 paquets `ok` (24 tests). `vue-tsc` sans erreur. Vitest : 5 fichiers, 37/37. Build front + binaire. Playwright : 16/16 (14 ordinateur 1440 px, 2 téléphone Pixel 7).
- **`make dev`** : Vite répond sur 5173, `/api/health` passe par le proxy vers PocketBase (200), route profonde servie.
- **Corrigé pendant la validation** : un enregistrement pouvait changer de plan ou de modèle parent par l'API (test `TestParentImmuable`, rouge puis vert) ; une route d'API inconnue renvoyait la page du front (test O01, rouge puis vert).
- **Hygiène git** : 85 fichiers suivis, aucun `.env`, binaire, `pb_data` ni `node_modules` ; aucun secret détecté ; aucun test désactivé (`skip`/`only`/`todo`) ; 9 commits au nom du propriétaire, sans mention d'outil.

## Bilan V1

| Matrice | État |
|---|---|
| S01–S08 sécurité (API réelle, comptes A/B/invité) | PASS |
| M01–M09 modèles, instantanés, duplication, atomicité, concurrence | PASS |
| D01–D05 dates et fuseaux | PASS |
| G01–G06 grille, collisions, rollback, réponses obsolètes | PASS |
| T01–T03 suivi | PASS |
| E01–E05 parcours Playwright (ordinateur et téléphone) | PASS |
| P01–P04 impression (Chromium, PDF) | PASS |
| O01–O02 binaire embarqué, absence de R2 signalée | PASS |
| O03 sauvegarde R2 réelle + restauration | **NON EXÉCUTÉ** — pas d'identifiants R2 ; bloquant pour la production |
| O04 non-régression des autres sites du VPS | **NON EXÉCUTÉ** — pas d'accès au VPS ; bloquant pour la production |
| Impression dans Firefox | **NON EXÉCUTÉ** — binaire de test supprimé par la protection Windows du poste |
| Glisser-déposer au doigt sur un vrai téléphone | **NON EXÉCUTÉ** — non automatisable de façon fiable ; « Placer » testé sur mobile |
| `go test -race` | **NON EXÉCUTÉ** — pas de compilateur C sur le poste |
| Lancement du binaire Linux | **NON EXÉCUTÉ** — compilé seulement (poste Windows) |

Limites connues : voir les entrées « Reste / limites » de chaque phase et les deux commentaires `shortcut:` du code.

## V1.1 — design validé (branche `design-v1.1`) — 2026-11-16

- **Livré (frontend uniquement ; backend, migrations, règles métier et contrats d'API inchangés)** :
  - Socle : jetons du Semio Design System dans `style.css` (accent, filet fort, surbrillance, fonds de message), en-tête de page à filet d'encre, états vides, case à cocher « papier », boutons et champs à rayon de 4 px.
  - Navigation téléphone : cinq onglets de largeur égale, pictogramme + libellé sur une ligne, séparés par un filet, onglet actif marqué.
  - Connexion : bascule « J'ai un compte / Créer un compte », afficher/masquer le mot de passe. Profil : sections Compte / Fuseau horaire / Session, liste IANA complète du navigateur conservée.
  - Aujourd'hui : bandeau des sept jours avec jauge, bilan du jour, sections « Au programme » et « Objectifs », sept cases de la semaine par objectif, boutons −15 / +15 en plus du champ libre des minutes.
  - Suivi du mois : colonne du jour en surbrillance, « Supprimer ce mois » dans un menu discret, total mensuel « Jours » conservé (pas de colonne « Semaine »).
  - Semaine type et semaine d'un mois : menu discret (Nouvelle semaine type, Renommer, Supprimer), blocs d'une demi-heure qui s'ouvrent au survol/focus/sélection, barre d'actions du bloc sélectionné (début ±30, durée ±30, copie vers un jour libre, Modifier…, Retirer).
  - Bibliothèque : en-tête avec décompte, initiales calculées à l'affichage quand une tâche n'a pas d'icône (champ `icone` inchangé, aucune migration), sélecteur de type à deux positions, saisie rapide lignée.
- **Vérifié** : `make verify` PASS — Go 2 paquets `ok`, `vue-tsc` sans erreur, Vitest 39/39 (dont 2 nouveaux tests `initiales`), Playwright 18/18 (les 16 parcours V1 + 2 nouveaux dans `tests/e2e/v11.spec.ts` : barre d'actions, boutons ±15). Rendu contrôlé dans Chromium à 390 × 844 et 1440 × 900 sur les six écrans avec des données de démonstration (base jetable locale) : aucun défilement horizontal, cinq onglets de 78 px sans libellé coupé, aucune erreur console ; barre d'actions exercée (durée +30, copie vers vendredi) ; formulaire « Nouvelle tâche » vide à l'ouverture.
- **Tests modifiés** : une ligne de `tests/e2e/helpers.ts` (le bouton « Pas encore de compte ? S'inscrire » est devenu la bascule « Créer un compte »). Aucun test désactivé ni assoupli. Deux régressions trouvées par les E2E et corrigées dans le code, pas dans les tests : bouton radio du type de tâche devenu incliquable, libellé « Fuseau horaire » porté par deux éléments.
- **Écarts assumés par rapport aux maquettes** (les maquettes sont des références, la logique réelle prime) :
  - Un clic sur un bloc ouvre toujours son formulaire (comportement testé en V1) ; la barre d'actions apparaît pour ce bloc après le clic, un glisser ou le focus clavier. Dans la maquette, le clic sélectionnait sans ouvrir le formulaire.
  - Création et modification d'une tâche restent dans une boîte de dialogue (pas de panneau latéral) ; créer/renommer une semaine type et les confirmations de suppression utilisent encore les boîtes natives du navigateur.
  - Supprimer une rubrique reste autorisé : ses tâches passent « Sans rubrique » (règle V1), contrairement à la démonstration de la maquette.
  - Le choix de la semaine type reste une liste déroulante (pas d'onglets).
- **NON EXÉCUTÉ** : thème sombre (non intégré) ; impression dans Firefox ; glisser au doigt sur un vrai téléphone ; lecteur d'écran réel ; les deux nouveaux tests E2E ont été écrits après le code (ils n'ont pas été vus en échec avant de passer).
