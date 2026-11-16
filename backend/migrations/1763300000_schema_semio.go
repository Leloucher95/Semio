// Package migrations : schéma Semio en migrations Go versionnées.
package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// Règles communes à toutes les collections métier (cf. docs/ARCHITECTURE.md §3).
const (
	regleOwner  = `@request.auth.id != "" && owner = @request.auth.id`
	regleCreate = `@request.auth.id != "" && @request.body.owner = @request.auth.id`
	regleUpdate = regleOwner + ` && @request.body.owner:changed = false`
)

const patternCouleur = `^#[0-9a-fA-F]{6}$`

func init() {
	m.Register(up, down)
}

func entier(nom string, min, max float64) *core.NumberField {
	// Jamais Required : PocketBase traite 0 comme vide, or 0 est une valeur légitime (minuit, pas de cible).
	return &core.NumberField{Name: nom, OnlyInt: true, Min: &min, Max: &max}
}

func relation(nom string, cible *core.Collection, requis, cascade bool) *core.RelationField {
	return &core.RelationField{Name: nom, CollectionId: cible.Id, MaxSelect: 1, Required: requis, CascadeDelete: cascade}
}

func typeTache(nom string) *core.SelectField {
	return &core.SelectField{Name: nom, Values: []string{"creneau", "objectif"}, MaxSelect: 1, Required: true}
}

func creneau() []core.Field {
	un, sept := 1.0, 7.0
	return []core.Field{
		&core.NumberField{Name: "jour_semaine", OnlyInt: true, Min: &un, Max: &sept, Required: true},
		entier("debut_min", 0, 1440),
		entier("fin_min", 0, 1440),
	}
}

func up(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	users.Fields.RemoveByName("avatar") // aucun fichier utilisateur en V1
	users.Fields.Add(&core.TextField{Name: "timezone", Max: 64})
	users.OAuth2.MappedFields.AvatarURL = ""
	if err := app.Save(users); err != nil {
		return err
	}

	// creer enregistre une collection métier : owner + règles explicites + champs.
	creer := func(nom string, champs ...core.Field) (*core.Collection, error) {
		c := core.NewBaseCollection(nom)
		c.ListRule = types.Pointer(regleOwner)
		c.ViewRule = types.Pointer(regleOwner)
		c.CreateRule = types.Pointer(regleCreate)
		c.UpdateRule = types.Pointer(regleUpdate)
		c.DeleteRule = types.Pointer(regleOwner)
		c.Fields.Add(relation("owner", users, true, true))
		c.Fields.Add(champs...)
		c.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true})
		c.Fields.Add(&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
		return c, app.Save(c)
	}
	unique := func(c *core.Collection, colonnes string) error {
		c.AddIndex("idx_"+c.Name+"_unique", true, colonnes, "")
		return app.Save(c)
	}

	rubriques, err := creer("rubriques",
		&core.TextField{Name: "nom", Required: true, Max: 80},
		&core.TextField{Name: "couleur", Pattern: patternCouleur},
		entier("ordre", 0, 100000),
	)
	if err != nil {
		return err
	}

	taches, err := creer("taches",
		relation("rubrique", rubriques, false, false),
		&core.TextField{Name: "nom", Required: true, Max: 120},
		typeTache("type"),
		&core.TextField{Name: "couleur", Pattern: patternCouleur},
		&core.TextField{Name: "icone", Max: 16},
		entier("duree_defaut_min", 0, 1440),
		entier("cible_jours_semaine", 0, 7),
		entier("cible_minutes_par_jour", 0, 1440),
		&core.BoolField{Name: "archivee"},
	)
	if err != nil {
		return err
	}

	modeles, err := creer("modeles", &core.TextField{Name: "nom", Required: true, Max: 80})
	if err != nil {
		return err
	}

	// tache sans cascade : PocketBase refuse de supprimer une tâche encore utilisée par un modèle.
	modeleTaches, err := creer("modele_taches",
		relation("modele", modeles, true, true),
		relation("tache", taches, true, false),
	)
	if err != nil {
		return err
	}
	if err := unique(modeleTaches, "modele, tache"); err != nil {
		return err
	}

	if _, err := creer("modele_placements", append([]core.Field{
		relation("modele", modeles, true, true),
		relation("tache", taches, true, false),
	}, creneau()...)...); err != nil {
		return err
	}

	anMin, anMax, moisMin, moisMax := 2000.0, 2100.0, 1.0, 12.0
	plans, err := creer("plans_mois",
		&core.NumberField{Name: "annee", OnlyInt: true, Min: &anMin, Max: &anMax, Required: true},
		&core.NumberField{Name: "mois", OnlyInt: true, Min: &moisMin, Max: &moisMax, Required: true},
		relation("modele_source", modeles, false, false),
	)
	if err != nil {
		return err
	}
	if err := unique(plans, "owner, annee, mois"); err != nil {
		return err
	}

	// Instantané figé : tout ce qu'il faut pour afficher, suivre et imprimer sans relire la bibliothèque.
	planTaches, err := creer("plan_taches",
		relation("plan", plans, true, true),
		relation("tache_source", taches, false, false),
		&core.TextField{Name: "nom_snapshot", Required: true, Max: 120},
		&core.TextField{Name: "rubrique_nom_snapshot", Max: 80},
		&core.TextField{Name: "couleur_snapshot", Pattern: patternCouleur},
		&core.TextField{Name: "icone_snapshot", Max: 16},
		typeTache("type_snapshot"),
		entier("cible_jours_semaine_snapshot", 0, 7),
		entier("cible_minutes_par_jour_snapshot", 0, 1440),
	)
	if err != nil {
		return err
	}

	if _, err := creer("plan_placements", append([]core.Field{
		relation("plan", plans, true, true),
		relation("plan_tache", planTaches, true, true),
	}, creneau()...)...); err != nil {
		return err
	}

	suivis, err := creer("suivis",
		relation("plan", plans, true, true),
		relation("plan_tache", planTaches, true, true),
		&core.TextField{Name: "date", Required: true, Pattern: `^\d{4}-\d{2}-\d{2}$`}, // date locale, jamais un datetime UTC
		&core.BoolField{Name: "fait"},
		entier("minutes", 0, 1440),
	)
	if err != nil {
		return err
	}
	return unique(suivis, "owner, plan_tache, date")
}

func down(app core.App) error {
	// Ordre inverse des dépendances.
	for _, nom := range []string{
		"suivis", "plan_placements", "plan_taches", "plans_mois",
		"modele_placements", "modele_taches", "modeles", "taches", "rubriques",
	} {
		c, err := app.FindCollectionByNameOrId(nom)
		if err != nil {
			continue
		}
		if err := app.Delete(c); err != nil {
			return err
		}
	}
	return nil
}
