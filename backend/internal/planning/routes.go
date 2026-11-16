package planning

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"

	"semio/internal/domain"
)

var moisNoms = [...]string{"", "janvier", "février", "mars", "avril", "mai", "juin",
	"juillet", "août", "septembre", "octobre", "novembre", "décembre"}

// Champs copiés tels quels d'un plan à l'autre.
var champsPlanTache = []string{
	"tache_source", "nom_snapshot", "rubrique_nom_snapshot", "couleur_snapshot", "icone_snapshot",
	"type_snapshot", "cible_jours_semaine_snapshot", "cible_minutes_par_jour_snapshot",
}

// bindRoutes expose les deux opérations atomiques, réservées aux utilisateurs connectés.
// Le propriétaire vient toujours de la session, jamais du corps de la requête.
func bindRoutes(app core.App) {
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		g := e.Router.Group("/api/semio")
		g.Bind(apis.RequireAuth("users"))
		g.POST("/apply-template", appliquerModele)
		g.POST("/duplicate-month", dupliquerMois)
		return e.Next()
	})
}

// appliquerModele crée le plan d'un mois à partir d'une semaine type : instantané des tâches
// membres (objectifs sans créneau compris) puis copie des créneaux. Tout ou rien.
func appliquerModele(e *core.RequestEvent) error {
	var in struct {
		Modele string `json:"modele"`
		Annee  int    `json:"annee"`
		Mois   int    `json:"mois"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Requête invalide.", err)
	}
	owner := e.Auth.Id

	var plan *core.Record
	err := e.App.RunInTransaction(func(tx core.App) error {
		modele, err := tx.FindRecordById("modeles", in.Modele)
		if err != nil || modele.GetString("owner") != owner {
			return e.NotFoundError("Semaine type introuvable.", nil)
		}
		if plan, err = creerPlan(tx, owner, in.Annee, in.Mois, modele.Id); err != nil {
			return err
		}

		membres, err := tx.FindRecordsByFilter("modele_taches", "modele = {:m}", "created", 0, 0, dbx.Params{"m": modele.Id})
		if err != nil {
			return err
		}
		planTaches := map[string]string{} // tâche source → tâche du plan
		for _, membre := range membres {
			tache, err := tx.FindRecordById("taches", membre.GetString("tache"))
			if err != nil {
				return err
			}
			rubrique := ""
			if id := tache.GetString("rubrique"); id != "" {
				if r, err := tx.FindRecordById("rubriques", id); err == nil {
					rubrique = r.GetString("nom")
				}
			}
			pt, err := nouveau(tx, "plan_taches", owner, plan.Id)
			if err != nil {
				return err
			}
			pt.Set("tache_source", tache.Id)
			pt.Set("nom_snapshot", tache.GetString("nom"))
			pt.Set("rubrique_nom_snapshot", rubrique)
			pt.Set("couleur_snapshot", tache.GetString("couleur"))
			pt.Set("icone_snapshot", tache.GetString("icone"))
			pt.Set("type_snapshot", tache.GetString("type"))
			pt.Set("cible_jours_semaine_snapshot", tache.GetInt("cible_jours_semaine"))
			pt.Set("cible_minutes_par_jour_snapshot", tache.GetInt("cible_minutes_par_jour"))
			if err := tx.Save(pt); err != nil {
				return err
			}
			planTaches[tache.Id] = pt.Id
		}

		placements, err := tx.FindRecordsByFilter("modele_placements", "modele = {:m}", "", 0, 0, dbx.Params{"m": modele.Id})
		if err != nil {
			return err
		}
		return copierPlacements(tx, owner, plan.Id, placements, "tache", planTaches)
	})
	if err != nil {
		return reponseErreur(e, err)
	}
	return e.JSON(http.StatusOK, plan)
}

// dupliquerMois copie un plan vers le mois suivant : tâches et créneaux du plan source
// (jamais relus dans le modèle ou la bibliothèque), aucun suivi. Tout ou rien.
func dupliquerMois(e *core.RequestEvent) error {
	var in struct {
		Plan string `json:"plan"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Requête invalide.", err)
	}
	owner := e.Auth.Id

	var plan *core.Record
	err := e.App.RunInTransaction(func(tx core.App) error {
		source, err := tx.FindRecordById("plans_mois", in.Plan)
		if err != nil || source.GetString("owner") != owner {
			return e.NotFoundError("Mois introuvable.", nil)
		}
		annee, mois := domain.NextMonth(source.GetInt("annee"), source.GetInt("mois"))
		if plan, err = creerPlan(tx, owner, annee, mois, source.GetString("modele_source")); err != nil {
			return err
		}

		parPlan := dbx.Params{"p": source.Id}
		taches, err := tx.FindRecordsByFilter("plan_taches", "plan = {:p}", "created", 0, 0, parPlan)
		if err != nil {
			return err
		}
		planTaches := map[string]string{} // tâche du plan source → tâche du nouveau plan
		for _, t := range taches {
			pt, err := nouveau(tx, "plan_taches", owner, plan.Id)
			if err != nil {
				return err
			}
			for _, champ := range champsPlanTache {
				pt.Set(champ, t.Get(champ))
			}
			if err := tx.Save(pt); err != nil {
				return err
			}
			planTaches[t.Id] = pt.Id
		}

		placements, err := tx.FindRecordsByFilter("plan_placements", "plan = {:p}", "", 0, 0, parPlan)
		if err != nil {
			return err
		}
		return copierPlacements(tx, owner, plan.Id, placements, "plan_tache", planTaches)
	})
	if err != nil {
		return reponseErreur(e, err)
	}
	return e.JSON(http.StatusOK, plan)
}

// creerPlan insère le plan du mois, ou renvoie un conflit s'il existe déjà (jamais d'écrasement).
// Les transactions PocketBase sont sérialisées et l'index unique (owner, annee, mois) sert de filet.
func creerPlan(tx core.App, owner string, annee, mois int, modeleSource string) (*core.Record, error) {
	existant, err := tx.FindRecordsByFilter("plans_mois", "owner = {:o} && annee = {:a} && mois = {:m}", "", 1, 0,
		dbx.Params{"o": owner, "a": annee, "m": mois})
	if err != nil {
		return nil, err
	}
	if len(existant) > 0 {
		return nil, router.NewApiError(http.StatusConflict,
			fmt.Sprintf("Le mois de %s %d existe déjà : il n'a pas été modifié.", moisNoms[mois], annee), nil)
	}
	col, err := tx.FindCollectionByNameOrId("plans_mois")
	if err != nil {
		return nil, err
	}
	plan := core.NewRecord(col)
	plan.Set("owner", owner)
	plan.Set("annee", annee)
	plan.Set("mois", mois)
	plan.Set("modele_source", modeleSource)
	return plan, tx.Save(plan)
}

func nouveau(tx core.App, collection, owner, plan string) (*core.Record, error) {
	col, err := tx.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("owner", owner)
	r.Set("plan", plan)
	return r, nil
}

// copierPlacements recrée chaque créneau dans le plan ; tx.Save repasse par les validations
// (bornes, chevauchement, appartenance), donc un modèle incohérent fait échouer toute la transaction.
func copierPlacements(tx core.App, owner, plan string, sources []*core.Record, champRef string, planTaches map[string]string) error {
	for _, s := range sources {
		planTache, ok := planTaches[s.GetString(champRef)]
		if !ok {
			return refus("Un créneau référence une tâche absente : rien n'a été créé.")
		}
		p, err := nouveau(tx, "plan_placements", owner, plan)
		if err != nil {
			return err
		}
		p.Set("plan_tache", planTache)
		p.Set("jour_semaine", s.GetInt("jour_semaine"))
		p.Set("debut_min", s.GetInt("debut_min"))
		p.Set("fin_min", s.GetInt("fin_min"))
		if err := tx.Save(p); err != nil {
			return err
		}
	}
	return nil
}

// reponseErreur garde les erreurs métier telles quelles et présente le reste comme une requête refusée.
func reponseErreur(e *core.RequestEvent, err error) error {
	var apiErr *router.ApiError
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return e.BadRequestError("Opération impossible : rien n'a été créé.", err)
}
