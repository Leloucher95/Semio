---
name: livrer-slice
description: Implémente une tranche verticale de Semio de bout en bout, avec les tests ciblés, la sécurité, les dates et une mise à jour courte du suivi. À utiliser quand on demande de construire, corriger ou finaliser une fonctionnalité de planning, modèles, objectifs, impression ou déploiement.
argument-hint: "<fonctionnalité ou phase P0–P6>"
---

# Livrer une tranche verticale de Semio

Tu es en mode réalisation, pas en mode réflexion abstraite. Mission : **$ARGUMENTS** (si vide, prendre la prochaine tranche incomplète dans `PROGRESS.md`).

## Lire juste le nécessaire
1. Ouvrir `CLAUDE.md`, `PROGRESS.md`, et les paragraphes pertinents de `docs/ARCHITECTURE.md`, `docs/MATRICE-TESTS.md`.
2. Explorer les modules actuels et leurs tests : ne jamais supposer qu'un fichier ou une commande existe.
3. Formuler dans ton travail un résultat utilisateur observable en une phrase; éviter de créer un plan de 30 sous-tâches avant de coder.

## Boucle exécutable
1. Repérer chemin fonctionnel et contrats API indispensables.
2. Ajouter des tests pertinents **avant/pendant** l'implémentation pour la logique risquée. Pour une tâche UI simple, privilégier une implémentation directe + un test de comportement au lieu de TDD formaliste.
3. Implémenter serveur, validation, état Pinia et interface en une seule tranche, avec les détails UX nécessaires (loading, erreur, empty state, mobile).
4. Exécuter les tests ciblés. En cas d'échec, corriger immédiatement et relancer. Aucun `.skip`, `todo` ou changement de snapshot destiné à cacher un problème.
5. Vérifier un parcours réel du navigateur via Playwright si les changements touchent le flux utilisateur.
6. Actualiser `PROGRESS.md` avec faits **observés** et `DECISIONS.md` si arbitrage.

## Sécurité et intégrité : contrôles systématiques
- Avant d'écrire : utilisateur authentifié, propriétaire vérifié, relations appartiennent au même owner.
- Dates `YYYY-MM-DD` validées + appartenance au mois; heures minuit/minutes et fuseau IANA.
- Transactions pour application/duplication; pas de demi-planning; mois existant jamais écrasé.
- Pas de perte d'historique ou de cibles quand la bibliothèque évolue.
- Optimisme front = rollback + erreur compréhensible.

## Tests recommandés selon la tranche
- Auth/données : `go test` d'intégration API avec utilisateurs A/B, tentative d'injection d'un ID B depuis A.
- Calendrier : unités Vitest/Go pour chevauchements, années bissextiles, mois à 31 jours et dimanche initial.
- Grille : unités fonctions pures + E2E souris; mobile touch si outillage disponible, alternative `Placer` toujours présente.
- Mensuel : E2E appliquer → modifier modèle → consulter ancien mois; dupliquer → créer suivi; collision vérifiée.
- Impression : `@media print`, snapshots/mesures navigateur, pas de ligne invisible, Safari non requis V1.
- Production : build embarqué, route profonde directe, R2 mock si sans identifiants, restauration réelle déclarée non exécutée tant que non faite.

## Budget de tests sans sacrifier la vitesse
- Chaque changement : subset minimal pertinent, typecheck touché.
- Fin de phase : suite Go + Vitest + typecheck + E2E smoke ciblé.
- V1 : `make verify` complet.

## Stop ou poursuite
- Poursuivre automatiquement à la prochaine tranche si tous les tests ciblés passent et que le propriétaire a demandé une implémentation complète.
- S'arrêter avant action externe irréversible : VPS prod, effacement de données, secrets réels, dépenses, configuration DNS.
- Si un service indisponible bloque seulement une sous-partie : documenter le test **non exécuté**, fournir stub local et poursuivre le reste.

## Format bref de sortie
**Livré** : ...
**Vérifié** : commandes exactes, PASS/FAIL/non exécuté.
**Suite** : prochaine tranche ou blocage externe, sans inventer de réussite.
