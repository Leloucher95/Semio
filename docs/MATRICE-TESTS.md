# Semio — Matrice de tests pragmatique

Objectif : coder vite en protégeant les invariants. Chaque test doit correspondre à un vrai risque. Ne pas créer une suite E2E de 100 scénarios instables.

| ID | Couche | Scénario à prouver | Priorité | Phase |
|---|---|---|---|---|
| S01 | Go/API | Invité ne peut lister les rubriques/tâches privées | P0 | P1 |
| S02 | Go/API | B ne voit pas les données A (list et view) | P0 | P1 |
| S03 | Go/API | B ne peut modifier/supprimer les données A | P0 | P1 |
| S04 | Go/API | A ne peut créer avec `owner=B` | P0 | P1 |
| S05 | Go/API | A ne peut changer `owner` d'un record existant | P0 | P1 |
| S06 | Go/API | A ne peut lier une rubrique de B à sa tâche | P0 | P1 |
| S07 | Go/API | A ne peut lier modèle/plan/plan_tache de B | P0 | P1/P3 |
| S08 | Go/API | Auth inscription, session, logout; users.list fermé | P0 | P1 |
| M01 | Go | Application modèle copie tous les objectifs même non placés | P0 | P3 |
| M02 | Go | Modification/archivage de tâche source après application ne modifie pas ancien plan | P0 | P3 |
| M03 | Go | Modification des placements du modèle ne modifie pas ancien mois | P0 | P3 |
| M04 | Go | Duplication utilise le plan source, pas le modèle d'origine | P0 | P3 |
| M05 | Go | Duplication ne copie pas les coches ni minutes | P0 | P3 |
| M06 | Go | Décembre → janvier année suivante | P0 | P3 |
| M07 | Go | Mois cible déjà existant = rejet, données intactes | P0 | P3 |
| M08 | Go | Échec au milieu de l'application = aucune écriture partielle | P0 | P3 |
| M09 | Go | Deux duplications concurrentes = au plus un plan | P1 | P3 |
| D01 | Vitest | Fevrier 2028 a 29 jours, février 2027 a 28 | P0 | P2/P3 |
| D02 | Vitest | Mois à 31 jours, mois commençant un dimanche | P0 | P2/P3 |
| D03 | Vitest | Décalage jour de semaine d'un mois à l'autre | P0 | P2/P3 |
| D04 | Vitest | Aujourd'hui selon Africa/Porto-Novo alors que runtime TZ différent | P0 | P3 |
| D05 | Go | Refus date non réelle, date hors mois ou minutes négatives | P0 | P3 |
| G01 | Vitest | Intervalles adjacents autorisés | P0 | P2 |
| G02 | Vitest | Collision partielle et englobante refusée | P0 | P2 |
| G03 | Go | Rejet serveur d'un placement chevauchant (contournement front) | P0 | P2 |
| G04 | Vitest | arrondi coordonnées → 30 min; resize borné | P1 | P2 |
| G05 | Vue/Vitest | Erreur API après drag/coche => rollback visible | P0 | P2/P3 |
| G06 | Vue/Vitest | Deux gestes rapides : réponse obsolète ne gagne pas | P1 | P2 |
| T01 | Go/API | Coche identifiée par plan_tache+date, pas placement | P0 | P3 |
| T02 | Go/API | 120 minutes atteint la cible; 119 ne l'atteint pas | P0 | P3 |
| T03 | Go/API | Deux jours/semaine atteints uniquement avec 2 dates différentes | P0 | P3 |
| E01 | Playwright | Desktop : inscription → tâche → modèle → placement formulaire → mois → coche | P0 | P3 |
| E02 | Playwright | Mobile : Aujourd'hui, coche, minutes, navigation | P0 | P3 |
| E03 | Playwright | Drag souris : dépôt, déplacement, redimensionnement, annulation collision | P1 | P2 |
| E04 | Playwright | Fallback « Placer » au clavier et sur petit écran | P0 | P2 |
| E05 | Playwright | Rechargement direct `/planning/annee/mois` ne donne pas 404 | P0 | P5 |
| P01 | Playwright | Print semaine A4 référence : titres/heures visibles, aucun élément UI parasite | P0 | P4 |
| P02 | Playwright | Print mois 28,29,30,31 jours : colonnes correctes | P0 | P4 |
| P03 | Playwright | Print 12 tâches lisible sur 1 page; dépassement paginé, pas coupé | P0 | P4 |
| P04 | Playwright | « Imprimer vierge » n'affiche pas les coches enregistrées | P0 | P4 |
| O01 | Go/smoke | Binaire final embarque front, sert `/` et route profonde | P0 | P5 |
| O02 | Test conf | Sans env R2 : alerte explicite, pas de local backup silencieux | P0 | P5 |
| O03 | Intégration externe | Backup vers R2 de test, restauration sur DB jetable, data intacte | P0 prod | P5 |
| O04 | Smoke | Ne touche pas aux autres sites/services du reverse proxy | P0 prod | P5 |

## Niveaux de vitesse

- **Sur chaque fichier modifié** : tests unitaires/intégration concernés + format/lint/types si pertinent.
- **Fin de phase** : `go test ./...` dans backend; `npm test -- --run` et `npm run typecheck` dans frontend; E2E smoke associé.
- **Avant la livraison V1** : `make verify` pour tous les tests P0/P1; record des commandes exécutées, erreurs, tests manuels.

Pour E2E : utiliser une base PocketBase temporaire isolée et déterministe. Exécuter une vérification navigateur mobile pour les coches; le vrai drag tactile peut rester **validation manuelle obligatoire** si le driver Playwright ne simule pas de vrais gestes tactiles, mais jamais « testé » sans preuve.

Pour l'impression : Chromium permet d'exporter un PDF lors des tests, Firefox peut confirmer les règles de `@media print` et les dimensions avec des contrôles DOM; vérifier l'aperçu réel Firefox manuellement si automate insuffisant. Ne jamais réécrire les snapshots pour masquer des régressions.
