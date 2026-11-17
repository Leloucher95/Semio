# Semio — Architecture V1

Ce fichier complète le cahier des charges original là où son modèle ne garantit pas les objectifs non planifiés, l'isolation relationnelle ou l'atomicité des duplications. **Ce n'est pas une demande d'élargissement fonctionnel.**

## 1. Flux de données

```
Vue + Pinia + SDK PocketBase
  -> /api/collections/* (CRUD simple, API rules + validations serveur)
  -> /api/semio/apply-template (transaction serveur)
  -> /api/semio/duplicate-month (transaction serveur)
Go / PocketBase (migrations Go, hooks, handlers métier)
  -> SQLite / pb_data
  -> PocketBase backup S3 => Cloudflare R2 (bucket de sauvegarde uniquement)
```

Pour les routes spéciales, utiliser l'auth PocketBase du vrai utilisateur, **jamais** un token superuser côté client. Le serveur valide `owner` et ses relations indépendamment des API rules. Les noms/chemins des routes sont des propositions à fixer dans les tests.

## 2. Collections proposées

| Collection | Champs importants | Invariants |
|---|---|---|
| `users` | `timezone` IANA, défaut `Africa/Porto-Novo` | un compte, un propriétaire |
| `rubriques` | `owner`, `nom`, `couleur`, `ordre` | unique ID, owner obligatoire |
| `taches` | `owner`, `rubrique?`, `nom`, `type`, `couleur`, `icone`, `duree_defaut_min`, `cible_jours_semaine`, `cible_minutes_par_jour`, `archivee` | cibles 0..7 et 0..1440; 0 = absence de cible; ne jamais détruire si référencée |
| `modeles` | `owner`, `nom` | modèle éditable |
| `modele_taches` | `owner`, `modele`, `tache` | unique (modele, tache), comprend objectifs sans placements |
| `modele_placements` | `owner`, `modele`, `tache`, `jour_semaine`, `debut_min`, `fin_min` | appartenances; tâche membre du modèle; pas de chevauchement |
| `plans_mois` | `owner`, `annee`, `mois`, `modele_source?` | unique (owner,annee,mois); source informative |
| `plan_taches` | `owner`, `plan`, `tache_source?`, `nom_snapshot`, `rubrique_nom_snapshot`, `couleur_snapshot`, `icone_snapshot`, `type_snapshot`, `cible_jours_semaine_snapshot`, `cible_minutes_par_jour_snapshot` | **instantané figé** de toutes les tâches du plan, y compris objectifs sans horaire |
| `plan_placements` | `owner`, `plan`, `plan_tache`, `jour_semaine`, `debut_min`, `fin_min` | plan_tache appartient au même plan; calendrier récurrent par jour de semaine |
| `suivis` | `owner`, `plan`, `plan_tache`, `date` texte, `fait`, `minutes` | unique(owner,plan_tache,date), date dans le mois du plan |

Les noms SQL/relations définitifs peuvent être ajustés à la version de PocketBase, avec traçabilité `DECISIONS.md`. On préfère copier le **nom de rubrique** plutôt que créer un sous-modèle historique de rubriques V1.

**Objectifs** : `cible_jours_semaine = 7` pour quotidien; `2` pour deux jours par semaine; `cible_minutes_par_jour = 120` pour deux heures/jour. Les deux cibles peuvent coexister. `fait` est un booléen de suivi; pour un objectif minutes, le serveur synchronise `fait = (minutes >= cible_minutes_par_jour_snapshot)` quand la durée est saisie, évitant deux valeurs contradictoires. Pour des objectifs sans durée, la coche est manuelle. L'utilisateur peut saisir plus de minutes que sa cible; `minutes` est non négatif et borné raisonnablement.

**Import rapide** : plusieurs lignes texte → création de tâches une à une ou en opération simple; aucune pièce jointe.

## 3. Relations et sécurité

Exemples (la syntaxe exacte est celle de la version PocketBase épinglée) :
- `list/view/delete`: `@request.auth.id != "" && owner = @request.auth.id`.
- `create`: `@request.auth.id != "" && @request.body.owner = @request.auth.id`.
- `update`: propriétaire actuel + `@request.body.owner:changed = false`.
- Dans chaque hook/route mutateur : contrôler que chaque relation pointe vers un enregistrement de même `owner`, et que `plan_tache.plan == plan`. Les API rules **ne rendent pas automatiquement une relation sûre**.
- `users`: n'autoriser que son propre profil en lecture/édition, création de compte selon règles d'inscription, champs système/profil protégés.

Tests avec 2 utilisateurs + invité sur chaque opération, y compris tentative de greffer `modele`/`rubrique`/`plan_tache` du compte B sur un record de A. Le résultat attendu est rejet (400/403/404 suivant action et règles), **jamais** une relation acceptée.

## 4. Modèles, snapshots, duplication

**Appliquer un modèle M au mois Y-MM** (une transaction serveur) :
1. Auth & propriété du modèle, toutes ses tâches et ses placements.
2. Valider Y-MM et unicité du mois cible.
3. Insérer `plans_mois`.
4. Pour chaque `modele_taches`, créer `plan_taches` en copiant les attributs affichés et les cibles; construire correspondance source-tâche → tâche-du-plan.
5. Copier les placements avec nouvelle référence `plan_tache`, vérifier horaires et absence de chevauchement.
6. Commit ou rollback intégral.

**Dupliquer le mois M vers mois M+1** : copier `plan_taches` **du plan source**, et `plan_placements`; ne pas relire les modèles ou tâches source; ne copier **aucun `suivis`** (nouveau mois à cocher). Gérer décembre→janvier et mois cible existant sans perte ni écrasement. Si plusieurs requêtes arrivent en même temps, l'index unique et la transaction règlent la collision.

**Modifier le plan d'un mois** : la copie mensuelle peut évoluer sans toucher au modèle ou à un autre mois. Les actions qui changent une tâche du plan (nom/cible) n'altèrent pas les résultats historiques d'autres plans.

## 5. Dates et horaires

- `timezone` IANA utilisateur, déterminé du profil côté client et serveur; `today` calculé dans ce fuseau. Ne jamais utiliser `toISOString().slice(0,10)` pour trouver le jour local.
- Dates civiles au format `YYYY-MM-DD`, validées contre les jours du mois et année bissextile; stockage PocketBase TextField.
- Jours semaine ISO 1..7 (lundi..dimanche); positions de modèles et plans récurrents sur chaque semaine du mois par même jour.
- Bornes horaires : 0..1440 min, début < fin; durée multiple de 30 min, snap sur pas de 30, affichage 06:00..22:00 configurable. Si un événement sort de la fenêtre affichée, permettre d'élargir la grille plutôt que couper les données.
- Chevauchement = `a.start < b.end && b.start < a.end` pour le même jour, en ignorant l'ID de l'élément qu'on déplace. Adjacence permise.

## 6. UX et impression

- Desktop : bibliothèque/rubriques à gauche et calendrier principal au centre. Mobile : onglet Aujourd'hui d'abord, grosses cibles, formulaire alternatif au drag.
- États explicites : vide, chargement, sauvegarde, rollback, conflit de mois, absence de compte.
- Drag Pointer Events : handles pour resize; `touch-action:none` sur les poignées uniquement; ghost et `elementFromPoint`, source Pinia unique, commit API après geste. Support clavier par bouton Placer.
- Impression : pages séparées semaine et mois, A4 paysage; `@page`, `print-color-adjust:exact`, pas de navigation. Cas d'essai de référence 12 tâches/31 jours = 1 page lisible; si davantage, pages supplémentaires propres, jamais masquage/troncation silencieuse.

- Création rapide (V1.2) : `POST /api/semio/quick-add` crée ou réutilise une tâche, l'ajoute au modèle et pose ses créneaux dans une seule transaction, propriétaire pris dans la session ; mêmes validations que les écritures unitaires. Le front n'envoie rien pendant la frappe (recherche dans le store).

## 7. Embedding et sauvegardes

- Vite build → `backend/web/dist`; seul le contenu sous `backend/web` est embarqué, pas un chemin parent interdit par `embed.FS`. En dev PocketBase sert `/api`, Vite sert l'interface et proxy.
- Déploiement de référence (depuis le 2026-11-16) : Dokploy + Docker Compose, un service, un réplica. Image en trois étapes (Node → Go → Alpine), binaire statique sous utilisateur non-root, écoute `0.0.0.0:8090` **dans le conteneur** sans port publié sur l'hôte, volume nommé monté sur `/pb_data`, healthcheck `/api/health`, routage HTTPS par Traefik via les domaines de Dokploy. Ne pas toucher aux autres applications du VPS.
- Alternative conservée : binaire Go avec systemd user dédié sur `127.0.0.1:8090` derrière un reverse proxy (`deploy/systemd.md`).
- Sauvegarde R2 : paramètres `backups.s3` (différents du stockage utilisateur `s3`) et planification quotidienne/rétention 14; endpoint R2 et path-style paramétrables par env. Pour V1 aucun bucket files n'est utile. Ne pas activer le stockage local de backup par défaut en production.
- Test de restauration sur **base jetable**; consigner les variables de configuration sans valeurs sensibles. Absence de R2 bloque validation de **production** mais pas les tests locaux du logiciel.
