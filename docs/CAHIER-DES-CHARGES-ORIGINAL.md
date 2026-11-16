# Planning de tâches quotidiennes — Brief pour l'agent IA

> Lis ce fichier en entier avant d'écrire du code. Tu es autonome : quand un point n'est pas tranché ici, prends l'option **la plus simple qui respecte les contraintes**, note-la dans `DECISIONS.md` (1 ligne : décision + raison) et continue. Ne t'arrête pas pour poser des questions.

---

## 1. Ce que veut le client (formulation d'origine résumée)

Un tableau où il **importe ses tâches** (rubriques), les **place sur la semaine** (ex. « 8h–16h école », « lire 2 h par jour », « exercices quotidiens »), les **coche chaque jour**, l'**imprime**, et **reprend le même format les mois suivants**.

### Fonctionnalités V1 (et rien de plus)
1. **Bibliothèque de tâches** réutilisables : nom, rubrique, couleur, type (voir §3).
2. **Grille semaine** jour × heure, interactive : glisser une tâche de la bibliothèque vers un créneau (la tâche reste dans la bibliothèque = clone), déplacer un bloc, étirer un bloc pour changer sa durée, supprimer.
3. **Suivi quotidien** : cocher une tâche faite pour une date donnée (et saisir des minutes pour les objectifs en durée).
4. **Modèle réutilisable** : enregistrer la semaine type comme modèle, l'appliquer à un mois, dupliquer vers le mois suivant en 1 clic.
5. **Impression** : 2 feuilles (voir §6).
6. **Comptes** : connexion e-mail + mot de passe, chacun ne voit que ses données.

Hors V1 : notifications, app mobile native, partage entre utilisateurs, statistiques avancées, upload d'images.

---

## 2. Stack imposée

| Couche | Choix | Remarque |
|---|---|---|
| Front | **Vue 3.5 + Vite + TypeScript (strict)** | SPA, pas de Nuxt, **pas de Next.js / React** |
| État | **Pinia** | source de vérité unique de l'UI |
| Style | **Tailwind CSS v4** | + feuille `print.css` dédiée |
| Drag & drop grille | **Composable maison basé sur Pointer Events** (`useGridDrag`) | voir §5, erreur n°1 |
| Réordonner la bibliothèque | `vue-draggable-plus` (optionnel) | uniquement pour une liste simple |
| Back | **Go + PocketBase utilisé comme librairie Go** | **pas** les hooks JS (`pb_hooks`) |
| Base | SQLite (intégrée à PocketBase) | |
| Fichiers | **Cloudflare R2** via le stockage S3 de PocketBase | **aucun fichier utilisateur sur le VPS** |
| Hébergement | VPS Contabo (Linux), service systemd | un seul binaire |
| Tests | Vitest (logique front), `go test` (back) | |

Autorisations : tu peux installer toute dépendance npm/Go **raisonnable et maintenue** nécessaire à la stack ci-dessus, créer/modifier tous les fichiers du dépôt, lancer builds et tests. Interdit : ajouter un autre framework front, un ORM, Docker en prod, ou un service externe payant.

---

## 3. Modèle de données (collections PocketBase)

Toutes les collections ont un champ `owner` (relation → `users`) et des **API rules** `owner = @request.auth.id` sur list/view/create/update/delete.

- **rubriques** : `nom`, `couleur`, `ordre`.
- **taches** (bibliothèque) : `nom`, `rubrique` (relation, optionnelle), `couleur`, `type` (`creneau` | `objectif`), `duree_defaut_min` (pour `creneau`), `cible_type` (`quotidien` | `fois_par_semaine` | `minutes_par_jour`), `cible_valeur` (int), `archivee` (bool), `icone` (nom d'icône Lucide ou emoji — **pas d'image**).
- **modeles** : `nom` (ex. « Semaine type rentrée »).
- **modele_placements** : `modele`, `tache`, `jour_semaine` (1 = lundi … 7 = dimanche), `debut_min`, `fin_min` (minutes depuis minuit, entiers).
- **plans_mois** : `annee`, `mois` (1–12), `modele_source` (relation, info seulement).
- **plan_placements** : **copie** des placements du modèle au moment de l'application → `plan`, `tache`, `jour_semaine`, `debut_min`, `fin_min`, `tache_nom_snapshot`, `couleur_snapshot`.
- **suivis** : `plan`, `tache`, `date` (**texte `YYYY-MM-DD`**), `fait` (bool), `minutes` (int, optionnel). Index unique `(owner, tache, date)`.

Deux types de tâches, c'est le cœur du produit :
- **`creneau`** = « École 8h–16h » → posée sur la grille horaire.
- **`objectif`** = « Lire 2 h/jour », « Exercices tous les jours », « Lire au moins 2 jours/semaine » → pas d'heure obligatoire, suivi par cases/minutes avec une cible. Elle peut *aussi* être posée sur la grille si l'utilisateur le souhaite.

---

## 4. Contraintes techniques non négociables

### Dates et heures (source n°1 de bugs)
- Fuseau du client : **Africa/Porto-Novo (UTC+1, pas d'heure d'été)**. Le rendre configurable par utilisateur (`users.timezone`, défaut ci-dessus).
- **Ne jamais stocker un jour coché en datetime UTC.** Un `2026-11-16T00:00:00Z` affiché en UTC+1 ou UTC-5 change de jour. Stocker la date locale en texte `YYYY-MM-DD`.
- Heures de créneau = **minutes depuis minuit** (entiers). Pas d'objets `Date` pour un créneau récurrent.
- Semaine qui commence le **lundi**, libellés via `Intl.DateTimeFormat('fr-FR')`. Aucune lib de dates lourde ; `date-fns` autorisé si besoin.
- Les mois n'ont pas la même longueur et les jours de la semaine glissent : un modèle s'applique **par jour de semaine**, jamais par numéro de jour.

### Historique
- Modifier un modèle **ne doit jamais modifier les mois déjà appliqués**. D'où `plan_placements` = copie + snapshots de nom/couleur.
- Supprimer une tâche de la bibliothèque = **archivage** (`archivee = true`), pas de suppression physique si elle a des `suivis`.

### Grille
- Pas de grille : **30 min** ; plage affichée configurable (défaut 6h–22h).
- **Chevauchement interdit** en V1 pour les `creneau` sur un même jour : refuser le dépôt, faire revenir le bloc à sa place et afficher un message clair. Logique dans une fonction pure testée (`overlaps()`).
- Un créneau peut couvrir plusieurs heures (école 8h–16h = 16 lignes) : rendu en **bloc positionné en absolu** dans la colonne du jour (`top`/`height` calculés depuis les minutes), pas « une tâche par cellule ».

### Sécurité / PocketBase
- PocketBase est en **0.x** (API pas encore figée) : **épingler la version exacte** dans `go.mod`, lire le changelog avant toute montée de version. Vérifier la syntaxe dans la doc **de la version épinglée** (l'API Go a beaucoup changé à partir de 0.23).
- Schéma créé par **migrations Go versionnées dans le dépôt** (`migratecmd`). Automigrate activé en dev seulement. Ne jamais créer de collection en prod à la main dans l'admin.
- **Chaque collection doit avoir ses API rules.** Une collection sans règle = données publiques ou bloquées. Écrire un test qui vérifie qu'un utilisateur B ne lit pas les données de A.
- Admin PocketBase (`/_/`) : mot de passe fort, compte créé en CLI (`superuser upsert`), jamais d'identifiants dans le dépôt.
- Secrets (clés R2, SMTP) via **variables d'environnement** (`.env` non commité + `.env.example` commité).

---

## 5. Erreurs à éviter (détectées dès maintenant)

1. **Utiliser une librairie de listes triables pour la grille horaire.** SortableJS/vue-draggable-plus est fait pour des listes : avec des blocs multi-heures, de l'étirement et un calcul de créneau sous le pointeur, ça devient du bricolage. En plus, Sortable modifie le DOM directement et entre en conflit avec Vue. → Composable `useGridDrag` en **Pointer Events** (souris + tactile identiques) : `pointerdown` → fantôme qui suit → `document.elementFromPoint` pour trouver la colonne/jour → arrondi au pas de 30 min → **mise à jour du store Pinia uniquement** ; Vue redessine.
2. **Oublier le tactile.** Le client cochera sur téléphone. `touch-action: none` sur les poignées de drag uniquement (pas sur toute la grille, sinon plus de scroll), appui long ~200 ms pour démarrer un drag sur mobile, cibles ≥ 44 px.
3. **Pas d'alternative au glisser-déposer.** Prévoir un bouton « Placer » (jour + heure début/fin via formulaire) : accessibilité clavier et filet de sécurité mobile.
4. **Sauvegarde bloquante.** Mise à jour optimiste dans Pinia, envoi à l'API, **rollback + toast** si erreur. Coches : envoi immédiat. Déplacements : debounce 300 ms.
5. **Confusion modèle / mois appliqué** (cf. §4 Historique).
6. **Cases à cocher indexées par placement.** Un suivi est lié à `(tache, date)`, pas à un bloc de la grille : si le bloc bouge, la coche reste.
7. **Impression couleur qui disparaît.** Les navigateurs suppriment les fonds à l'impression → `print-color-adjust: exact` + ne jamais porter l'info par la couleur seule (nom de la tâche toujours écrit, bordure).
8. **Polices externes.** Polices auto-hébergées (fichiers dans le build), pas de Google Fonts : l'impression et le chargement en dépendent.
9. **SPA qui renvoie 404 au rechargement** d'une route profonde → servir le build avec fallback sur `index.html`.
10. **IP réelle masquée par Cloudflare.** Si le domaine passe par le proxy Cloudflare (nuage orange), configurer dans PocketBase les *trusted proxy headers* (`CF-Connecting-IP`), sinon le rate limiting voit tous les visiteurs comme une seule IP.
11. **Images sur le VPS.** Interdit (cf. §7). En V1 il n'y a **aucun champ fichier** : icônes = Lucide ou emoji.
12. **Rendu « généré par IA ».** Pas de grille de cartes icône + titre + sous-titre, pas de badges en pilule partout, pas de dégradés violets. L'UI doit ressembler à un **bel agenda papier** : grille nette, typographie soignée, couleurs de tâches sobres, beaucoup d'air.

---

## 6. Impression

Deux vues d'impression, accessibles par un bouton « Imprimer » (`window.print()`), **A4 paysage**, `@page { size: A4 landscape; margin: 10mm; }` :

1. **Planning de la semaine** : colonnes lun→dim, lignes horaires, blocs avec nom + heures.
2. **Suivi du mois** : lignes = tâches (regroupées par rubrique), colonnes = jours 1→28/29/30/31 avec initiale du jour, case vide à cocher au stylo. Cases déjà cochées en ligne imprimées cochées (option « imprimer vierge »). Week-ends légèrement grisés.

Masquer à l'impression : navigation, boutons, bibliothèque. Une feuille = une page (`break-inside: avoid`). Tester dans Chrome **et** Firefox (aperçu avant impression).

---

## 7. Hébergement VPS + Cloudflare R2

### Build et service
- Le front Vite est compilé puis **embarqué dans le binaire Go** (`embed.FS`) et servi avec fallback SPA. Résultat : **un seul binaire** à déployer.
- Le binaire écoute sur `127.0.0.1:8090` (pas sur 80/443).
- Service **systemd** (`Restart=always`, utilisateur dédié non-root, `WorkingDirectory` contenant `pb_data/`).
- Le VPS héberge peut-être déjà d'autres sites : s'il y a déjà un reverse proxy (Caddy/Nginx/Traefik), **ajouter un bloc pour ce domaine sans toucher aux autres**. S'il n'y en a pas, utiliser **Caddy** (HTTPS automatique). Fournir le fichier de config dans `deploy/`.
- Fournir `deploy/README.md` : build, copie du binaire, création du superuser, activation du service, mise à jour, restauration de sauvegarde.

### Cloudflare R2 (stockage S3 de PocketBase)
- Ce qui va dans R2 : **les sauvegardes de la base** (bucket `planning-backups`) et, plus tard, tout fichier envoyé (bucket séparé `planning-files`). `pb_data` sur le VPS ne contient que la base SQLite.
- Réglages S3 pour R2 : endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, région `auto`, **force path-style activé**, clés d'API R2 limitées aux buckets concernés.
- Appliquer ces réglages **au démarrage depuis les variables d'environnement** (code Go), pas à la main dans l'admin.
- Sauvegarde automatique **quotidienne** vers R2 + rétention 14 jours. Tester une restauration au moins une fois et documenter la procédure.
- **Repli** si les variables R2 sont absentes : l'app démarre quand même, sauvegardes désactivées, avertissement clair dans les logs. Ne jamais se rabattre sur le stockage local de fichiers en prod.

---

## 8. Organisation du dépôt

```
/backend        main.go, migrations/, hooks Go, tests
/frontend       app Vue (src/stores, src/composables, src/components, src/views, src/print)
/deploy         planning.service, Caddyfile (exemple), README.md
.env.example
DECISIONS.md
README.md       lancer en local en 3 commandes
```

En local : `make dev` lance PocketBase (port 8090) + Vite (proxy `/api` → 8090).

---

## 9. Ordre de travail et critères de fin

1. Squelette back + migrations + règles d'accès + test d'isolation entre utilisateurs.
2. Auth front + bibliothèque de tâches (CRUD, rubriques, couleurs).
3. Grille semaine : affichage des blocs, puis `useGridDrag` (déposer, déplacer, étirer, refus de chevauchement), puis bouton « Placer ».
4. Modèles → appliquer à un mois → dupliquer au mois suivant.
5. Suivi quotidien (vue « Aujourd'hui » optimisée mobile + vue mois).
6. Impression (2 feuilles).
7. Sauvegardes R2 + dossier `deploy/`.

**C'est terminé quand :** tous les tests passent ; `overlaps()`, l'application d'un modèle à un mois (février, mois de 31 jours, mois commençant un dimanche) et la gestion des dates ont des tests unitaires ; un utilisateur B ne voit rien de A ; l'impression tient sur une page A4 paysage dans Chrome et Firefox ; le drag fonctionne à la souris et au doigt ; le binaire unique démarre avec le build front embarqué ; aucun fichier utilisateur n'est écrit sur le VPS.

---

## 10. Points à confirmer avec le client (ne bloquent pas le dev)

Le modèle de données ci-dessus couvre toutes les réponses possibles. Implémente sans attendre.
- « Lire au moins 2 jours et 2 heures » : 2 h par jour, au moins 2 jours par semaine ? → configurable via `cible_type` / `cible_valeur`.
- Un compte pour une seule personne, ou un parent qui gère le planning d'un enfant (« école ») ? → V1 : un compte = une personne.
- Vue mobile prioritaire pour cocher ? → V1 : oui, vue « Aujourd'hui ».
