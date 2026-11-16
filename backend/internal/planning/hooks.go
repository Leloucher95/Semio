// Package planning : règles métier des créneaux, du suivi et des plans mensuels.
package planning

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"semio/internal/domain"
)

// refus : rejet métier dont le message français est affiché tel quel par le front (422).
func refus(message string) error {
	return router.NewApiError(422, message, nil)
}

// Bind branche les validations sur OnRecordValidate : elles valent pour l'API
// comme pour les écritures serveur (appliquer un modèle, dupliquer un mois).
func Bind(app core.App) {
	app.OnRecordValidate("modele_placements").BindFunc(func(e *core.RecordEvent) error {
		r := e.Record
		if err := checkCreneau(e.App, r, "modele"); err != nil {
			return err
		}
		if _, err := e.App.FindFirstRecordByFilter("modele_taches", "modele = {:m} && tache = {:t}",
			dbx.Params{"m": r.GetString("modele"), "t": r.GetString("tache")}); err != nil {
			return refus("Cette tâche ne fait pas partie du modèle.")
		}
		return e.Next()
	})

	app.OnRecordValidate("plan_placements").BindFunc(func(e *core.RecordEvent) error {
		if err := checkCreneau(e.App, e.Record, "plan"); err != nil {
			return err
		}
		if err := checkMemePlan(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	})

	// Retirer une tâche d'un modèle retire ses créneaux de ce modèle (jamais la tâche).
	app.OnRecordDelete("modele_taches").BindFunc(func(e *core.RecordEvent) error {
		placements, err := e.App.FindRecordsByFilter("modele_placements", "modele = {:m} && tache = {:t}", "", 0, 0,
			dbx.Params{"m": e.Record.GetString("modele"), "t": e.Record.GetString("tache")})
		if err != nil {
			return err
		}
		for _, p := range placements {
			if err := e.App.Delete(p); err != nil {
				return err
			}
		}
		return e.Next()
	})
}

// checkCreneau valide les bornes et refuse tout chevauchement le même jour chez le même parent.
// Intervalles semi-ouverts [début, fin) : deux créneaux adjacents ne se chevauchent pas.
// shortcut: la lecture précède l'écriture sans verrou — deux créations simultanées du même compte
// pourraient se chevaucher ; passer la vérification dans une transaction si cela devient réel.
func checkCreneau(app core.App, r *core.Record, parent string) error {
	debut, fin := r.GetInt("debut_min"), r.GetInt("fin_min")
	if err := domain.ValidSlot(debut, fin); err != nil {
		return refus(err.Error())
	}
	autres, err := app.FindRecordsByFilter(r.Collection(),
		parent+" = {:parent} && jour_semaine = {:jour} && id != {:id} && debut_min < {:fin} && fin_min > {:debut}",
		"", 1, 0, dbx.Params{
			"parent": r.GetString(parent), "jour": r.GetInt("jour_semaine"), "id": r.Id, "debut": debut, "fin": fin,
		})
	if err != nil {
		return err
	}
	if len(autres) > 0 {
		return refus("Ce créneau chevauche un autre créneau du même jour.")
	}
	return nil
}

// checkMemePlan : `plan_tache` doit appartenir au `plan` de l'enregistrement.
func checkMemePlan(app core.App, r *core.Record) error {
	planTache, err := app.FindRecordById("plan_taches", r.GetString("plan_tache"))
	if err != nil || planTache.GetString("plan") != r.GetString("plan") {
		return refus("Cette tâche n'appartient pas à ce mois.")
	}
	return nil
}
