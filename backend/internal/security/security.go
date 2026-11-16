// Package security : cloisonnement par propriétaire au-delà des API rules.
package security

import (
	"time"
	_ "time/tzdata" // fuseaux IANA embarqués : le VPS ou Windows peuvent ne pas les fournir

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// FuseauDefaut est le fuseau des nouveaux comptes.
const FuseauDefaut = "Africa/Porto-Novo"

// Collections métier, toutes cloisonnées par `owner`.
var Collections = []string{
	"rubriques", "taches", "modeles", "modele_taches", "modele_placements",
	"plans_mois", "plan_taches", "plan_placements", "suivis",
}

// Bind valide à chaque enregistrement (API ou serveur) que les relations restent chez le même propriétaire.
func Bind(app core.App) {
	app.OnRecordValidate(Collections...).BindFunc(func(e *core.RecordEvent) error {
		if err := CheckRelations(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	app.OnRecordValidate("users").BindFunc(func(e *core.RecordEvent) error {
		tz := e.Record.GetString("timezone")
		if tz == "" {
			tz = FuseauDefaut
			e.Record.Set("timezone", tz)
		}
		// "Local" dépend de la machine : ce n'est pas un fuseau IANA.
		if _, err := time.LoadLocation(tz); err != nil || tz == "Local" {
			return router.NewBadRequestError("Fuseau horaire inconnu.", nil)
		}
		return e.Next()
	})
}

// CheckRelations refuse toute relation pointant vers un enregistrement d'un autre propriétaire.
// Une règle `owner = @request.auth.id` ne couvre que l'enregistrement lui-même, pas ce qu'il référence.
func CheckRelations(app core.App, r *core.Record) error {
	owner := r.GetString("owner")
	for _, f := range r.Collection().Fields {
		rel, ok := f.(*core.RelationField)
		if !ok || rel.Name == "owner" {
			continue
		}
		for _, id := range r.GetStringSlice(rel.Name) {
			lie, err := app.FindRecordById(rel.CollectionId, id)
			// Même réponse pour « inexistant » et « à quelqu'un d'autre » : pas d'oracle sur les identifiants.
			if err != nil || lie.GetString("owner") != owner {
				return router.NewBadRequestError("Référence invalide : "+rel.Name+".", nil)
			}
		}
	}
	return nil
}
