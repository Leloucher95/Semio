# Progression réelle — Semio

> Ce fichier décrit des faits constatés. Ne coche rien uniquement parce que l'étape a été prévue.

- [x] P0 — Bootstrap : Go/PocketBase, Vue/Vite, commandes, tests minimaux, dev fonctionnel
- [x] P1 — Auth + collections + sécurité A/B + relations + bibliothèque
- [x] P2 — Modèles + grille + formulaire + pointer drag + tests collisions
- [ ] P3 — Plans mensuels + snapshot + duplication + aujourd'hui + suivi
- [ ] P4 — Impression A4 semaine/mois + tests navigateur
- [ ] P5 — Binaire unique + systemd + R2 + restauration jetable
- [ ] P6 — `make verify` complet, audit de stabilité, compte rendu factuel

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
