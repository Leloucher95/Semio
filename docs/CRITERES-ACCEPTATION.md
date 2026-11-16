# Semio — Critères d'acceptation V1

## Parcours utilisateur (données de référence)

1. Un nouvel utilisateur s'inscrit, se connecte et crée les rubriques « Études » et « Personnel ».
2. Il crée « École » (créneau, 8h–16h), « Lecture » (objectif : 120 min/jour, au moins 2 jours/semaine), « Exercices » (objectif : 7 jours/semaine).
3. Il constitue un modèle « Ma semaine » incluant **les trois tâches**, même si « Lecture » et « Exercices » n'ont pas de placement.
4. Il positionne « École » du lundi au vendredi, 8h–16h; tente de mettre un autre créneau overlapping, reçoit une erreur claire, l'ancien planning ne bouge pas.
5. Il applique « Ma semaine » à février 2028, coche « Exercices » le 1er, saisit 120 minutes de « Lecture » le 2 et visualise sa progression sur Aujourd'hui et Mois.
6. Il édite la tâche « Lecture » dans la bibliothèque (renommage et cible), puis modifie le modèle; **février 2028 conserve les valeurs copiées**.
7. Il duplique février vers mars 2028; mars conserve les tâches/placements de février mais commence avec des coches et minutes vierges.
8. Une seconde tentative de créer mars 2028 retourne un conflit, sans effacer mars.
9. Il imprime la semaine A4 et le suivi de février A4 avec les 29 colonnes de jours, puis imprime une version vierge.
10. Un utilisateur B se connecte : il ne lit, n'édite ni ne référence aucune donnée A.

## UX

- En viewport mobile ~390px, Aujourd'hui reste lisible, chaque cible tactile importante atteint 44px, pas de scroll horizontal pour cocher.
- Desktop ~1440px : bibliothèque et grille utilisables sans zoom; blocs horaires positionnés à la bonne hauteur, correctement étiquetés.
- Le bouton « Placer » fonctionne sans drag, au clavier, sur mobile.
- Opérations importantes affichent chargement, réussite ou erreur réelle; les échecs d'enregistrement sont visibles avec rollback.
- Changement de fuseau IANA dans le profil : « Aujourd'hui » correspond au jour local de cet utilisateur.

## Impression

- 1 page A4 paysage pour la semaine de référence (06h–22h), et 1 page pour un mois de 31 jours contenant **12 tâches** au plus si lisibilité préservée par mesures navigateur.
- Si la bibliothèque dépasse le seuil de lisibilité, une pagination claire est préférable à des tâches invisibles. Documenter le seuil final mesuré et le choix.
- Aucune information transmise seulement par la couleur. Heures, noms et dates lisibles en monochrome.

## Déploiement et sécurité

- Aucun fichier `.env` ni clé n'entre dans git. Un seul binaire Go inclut le front et sa route SPA rechargée.
- Production : service systemd non-root + reverse proxy existant, sans écraser les vhosts déjà en place.
- Sauvegarde quotidienne R2, rétention 14; restauration exécutée sur un environnement jetable avec résultat consigné avant de considérer la production prête.
- Tests automatisés P0 passants et rapport de tests **réel**, avec exceptions documentées si outil absent.
