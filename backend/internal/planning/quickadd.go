package planning

import (
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ajoutRapide place une activité dans une semaine type en un seul geste : crée la tâche si elle est nouvelle,
// l'ajoute au modèle si besoin, puis crée ses créneaux (aucun pour un objectif sans horaire). Tout ou rien :
// chaque écriture repasse par les validations habituelles (propriétaire, relations, bornes, chevauchement).
func ajoutRapide(e *core.RequestEvent) error {
	var in struct {
		Modele   string `json:"modele"`
		Tache    string `json:"tache"` // tâche existante à réutiliser ; vide = en créer une
		Nouvelle struct {
			Nom                 string `json:"nom"`
			Type                string `json:"type"`
			Rubrique            string `json:"rubrique"`
			Couleur             string `json:"couleur"`
			DureeDefautMin      int    `json:"duree_defaut_min"`
			CibleJoursSemaine   int    `json:"cible_jours_semaine"`
			CibleMinutesParJour int    `json:"cible_minutes_par_jour"`
		} `json:"nouvelle"`
		Creneaux []struct {
			Jour  int `json:"jour_semaine"`
			Debut int `json:"debut_min"`
			Fin   int `json:"fin_min"`
		} `json:"creneaux"`
	}
	if err := e.BindBody(&in); err != nil {
		return e.BadRequestError("Requête invalide.", err)
	}
	if len(in.Creneaux) > 7 {
		return refus("Sept créneaux au plus par ajout : un par jour de la semaine.")
	}
	owner := e.Auth.Id // jamais lu dans le corps de la requête

	var tache, membre *core.Record
	placements := []*core.Record{}
	err := e.App.RunInTransaction(func(tx core.App) error {
		modele, err := tx.FindRecordById("modeles", in.Modele)
		if err != nil || modele.GetString("owner") != owner {
			return e.NotFoundError("Semaine type introuvable.", nil)
		}

		if in.Tache != "" {
			if tache, err = tx.FindRecordById("taches", in.Tache); err != nil || tache.GetString("owner") != owner {
				return e.NotFoundError("Tâche introuvable.", nil)
			}
			if tache.GetBool("archivee") {
				return refus("Cette tâche est archivée : restaurez-la dans la bibliothèque avant de la placer.")
			}
		} else {
			nom := strings.TrimSpace(in.Nouvelle.Nom)
			if nom == "" {
				return refus("Donnez un nom à l'activité.")
			}
			if tache, err = enregistrement(tx, "taches", owner); err != nil {
				return err
			}
			tache.Set("nom", nom)
			tache.Set("type", in.Nouvelle.Type)
			tache.Set("rubrique", in.Nouvelle.Rubrique)
			tache.Set("couleur", in.Nouvelle.Couleur)
			tache.Set("duree_defaut_min", in.Nouvelle.DureeDefautMin)
			tache.Set("cible_jours_semaine", in.Nouvelle.CibleJoursSemaine)
			tache.Set("cible_minutes_par_jour", in.Nouvelle.CibleMinutesParJour)
			if err := tx.Save(tache); err != nil {
				return err
			}
		}

		membre, err = tx.FindFirstRecordByFilter("modele_taches", "modele = {:m} && tache = {:t}",
			dbx.Params{"m": modele.Id, "t": tache.Id})
		if err != nil { // pas encore membre du modèle
			if membre, err = enregistrement(tx, "modele_taches", owner); err != nil {
				return err
			}
			membre.Set("modele", modele.Id)
			membre.Set("tache", tache.Id)
			if err := tx.Save(membre); err != nil {
				return err
			}
		}

		for _, c := range in.Creneaux {
			p, err := enregistrement(tx, "modele_placements", owner)
			if err != nil {
				return err
			}
			p.Set("modele", modele.Id)
			p.Set("tache", tache.Id)
			p.Set("jour_semaine", c.Jour)
			p.Set("debut_min", c.Debut)
			p.Set("fin_min", c.Fin)
			if err := tx.Save(p); err != nil {
				return err
			}
			placements = append(placements, p)
		}
		return nil
	})
	if err != nil {
		return reponseErreur(e, err)
	}
	return e.JSON(http.StatusOK, map[string]any{"tache": tache, "membre": membre, "placements": placements})
}

func enregistrement(tx core.App, collection, owner string) (*core.Record, error) {
	col, err := tx.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	r := core.NewRecord(col)
	r.Set("owner", owner)
	return r, nil
}
