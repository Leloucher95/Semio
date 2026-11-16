# Progression réelle — Semio

> Ce fichier décrit des faits constatés. Ne coche rien uniquement parce que l'étape a été prévue.

- [x] P0 — Bootstrap : Go/PocketBase, Vue/Vite, commandes, tests minimaux, dev fonctionnel
- [ ] P1 — Auth + collections + sécurité A/B + relations + bibliothèque
- [ ] P2 — Modèles + grille + formulaire + pointer drag + tests collisions
- [ ] P3 — Plans mensuels + snapshot + duplication + aujourd'hui + suivi
- [ ] P4 — Impression A4 semaine/mois + tests navigateur
- [ ] P5 — Binaire unique + systemd + R2 + restauration jetable
- [ ] P6 — `make verify` complet, audit de stabilité, compte rendu factuel

## Journal

### P0 — 2026-11-16
- **Livré** : module Go `semio` (PocketBase v0.40.6 en librairie, front embarqué avec repli SPA), front Vue 3.5/Vite 8/Pinia/Tailwind 4, `lib/dates.ts`, Makefile + équivalents Windows dans le README.
- **Vérifié** : `make test` PASS (go vet, `go test ./...` : 2 paquets ; vue-tsc ; Vitest 10/10 dont D01–D04) ; `make build` PASS (binaire 36 Mo) ; binaire lancé sur base jetable : `/`, `/planning/2028/2` et `/api/health` répondent 200.
- **Reste** : tout le fonctionnel (P1+). Go et make n'étaient pas installés sur le poste : installés via scoop.
