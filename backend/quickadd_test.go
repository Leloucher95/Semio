package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// ajoutRapide appelle la route de création rapide avec le corps donné.
func (a *api) ajoutRapide(c compte, corps map[string]any) (int, string) {
	a.t.Helper()
	raw, _ := json.Marshal(corps)
	return a.do("POST", "/api/semio/quick-add", c.token, string(raw))
}

func creneau(jour, debut, fin int) map[string]any {
	return map[string]any{"jour_semaine": jour, "debut_min": debut, "fin_min": fin}
}

// etat compte ce que la création rapide peut écrire : tâches, adhésions au modèle, créneaux.
func (a *api) etat() [3]int64 {
	return [3]int64{a.compter("taches"), a.compter("modele_taches"), a.compter("modele_placements")}
}

func TestAjoutRapideCreeTacheAdhesionEtCreneaux(t *testing.T) {
	a := newAPI(t)
	c := a.signup("a@semio.test")
	modele := a.create(c, "modeles", map[string]any{"nom": "Ma semaine"})

	code, out := a.ajoutRapide(c, map[string]any{
		"modele":   modele,
		"nouvelle": map[string]any{"nom": "  Révisions de maths  ", "type": "creneau", "duree_defaut_min": 60},
		"creneaux": []any{creneau(2, 1080, 1140), creneau(4, 1080, 1140)},
	})
	if code != 200 {
		t.Fatalf("création rapide = %d %s", code, out)
	}
	var res struct {
		Tache      struct{ Id, Nom, Owner, Type string }
		Membre     struct{ Id, Modele, Tache string }
		Placements []struct {
			Id, Tache, Modele string
			Jour_semaine      int
		}
	}
	if err := json.Unmarshal([]byte(out), &res); err != nil {
		t.Fatal(err)
	}
	if res.Tache.Nom != "Révisions de maths" || res.Tache.Owner != c.id || res.Tache.Type != "creneau" {
		t.Errorf("tâche créée = %+v", res.Tache)
	}
	if res.Membre.Tache != res.Tache.Id || res.Membre.Modele != modele {
		t.Errorf("adhésion = %+v", res.Membre)
	}
	if len(res.Placements) != 2 || res.Placements[0].Jour_semaine != 2 || res.Placements[1].Tache != res.Tache.Id {
		t.Errorf("créneaux = %+v", res.Placements)
	}
	if e := a.etat(); e != [3]int64{1, 1, 2} {
		t.Errorf("en base : %v, attendu 1 tâche, 1 adhésion, 2 créneaux", e)
	}

	// Réutiliser la tâche : aucun doublon, aucune seconde adhésion, un créneau de plus.
	code, out = a.ajoutRapide(c, map[string]any{"modele": modele, "tache": res.Tache.Id, "creneaux": []any{creneau(6, 600, 660)}})
	if code != 200 {
		t.Fatalf("réutilisation = %d %s", code, out)
	}
	if e := a.etat(); e != [3]int64{1, 1, 3} {
		t.Errorf("après réutilisation : %v, attendu 1 tâche, 1 adhésion, 3 créneaux", e)
	}
}

func TestAjoutRapideObjectifSansHoraire(t *testing.T) {
	a := newAPI(t)
	c := a.signup("a@semio.test")
	modele := a.create(c, "modeles", map[string]any{"nom": "Ma semaine"})
	rubrique := a.create(c, "rubriques", map[string]any{"nom": "Personnel", "couleur": "#3d6b4f"})

	code, out := a.ajoutRapide(c, map[string]any{
		"modele":   modele,
		"nouvelle": map[string]any{"nom": "Lire", "type": "objectif", "cible_minutes_par_jour": 30, "cible_jours_semaine": 7, "rubrique": rubrique},
	})
	if code != 200 || !strings.Contains(out, `"cible_minutes_par_jour":30`) || !strings.Contains(out, `"placements":[]`) {
		t.Fatalf("objectif = %d %s", code, out)
	}
	if e := a.etat(); e != [3]int64{1, 1, 0} {
		t.Errorf("en base : %v, attendu 1 objectif membre du modèle et aucun créneau", e)
	}
}

// Tout ou rien : une erreur sur un seul créneau ne laisse ni tâche orpheline, ni adhésion, ni créneau partiel.
func TestAjoutRapideAtomique(t *testing.T) {
	a := newAPI(t)
	c := a.signup("a@semio.test")
	ids := a.semaineType(c) // École : lundi → vendredi 08:00–16:00
	avant := a.etat()

	cas := []struct {
		nom     string
		corps   map[string]any
		statut  int
		extrait string
	}{
		{"chevauchement sur le dernier jour", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "creneau"},
			"creneaux": []any{creneau(6, 600, 660), creneau(7, 600, 660), creneau(1, 900, 1020)}}, 422, "chevauche"},
		{"deux créneaux de la requête qui se chevauchent", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "creneau"},
			"creneaux": []any{creneau(6, 600, 660), creneau(6, 630, 690)}}, 422, "chevauche"},
		{"horaire hors de la journée", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "creneau"},
			"creneaux": []any{creneau(6, 1410, 1470)}}, 422, ""},
		{"horaire hors du pas de 30 minutes", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "creneau"},
			"creneaux": []any{creneau(6, 605, 665)}}, 422, ""},
		{"nom vide", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "   ", "type": "creneau"},
			"creneaux": []any{creneau(6, 600, 660)}}, 422, "nom"},
		{"type inconnu", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "autre"},
			"creneaux": []any{creneau(6, 600, 660)}}, 400, ""},
		{"tâche existante en conflit", map[string]any{
			"modele": ids["modele"], "tache": ids["lecture"], "creneaux": []any{creneau(6, 600, 660), creneau(2, 480, 540)}}, 422, "chevauche"},
		{"trop de créneaux", map[string]any{
			"modele": ids["modele"], "nouvelle": map[string]any{"nom": "Sport", "type": "creneau"},
			"creneaux": []any{creneau(6, 0, 30), creneau(6, 30, 60), creneau(6, 60, 90), creneau(6, 90, 120),
				creneau(6, 120, 150), creneau(6, 150, 180), creneau(6, 180, 210), creneau(6, 210, 240)}}, 422, ""},
	}
	for _, c2 := range cas {
		code, out := a.ajoutRapide(c, c2.corps)
		if code != c2.statut || !strings.Contains(out, c2.extrait) {
			t.Errorf("%s = %d %s, attendu %d contenant %q", c2.nom, code, out, c2.statut, c2.extrait)
		}
		if apres := a.etat(); apres != avant {
			t.Errorf("%s : état modifié %v → %v (tâche orpheline ou créneau partiel)", c2.nom, avant, apres)
		}
	}
}

func TestAjoutRapideIsolation(t *testing.T) {
	a := newAPI(t)
	ca, cb := a.signup("a@semio.test"), a.signup("b@semio.test")
	deA := a.semaineType(ca)
	modeleB := a.create(cb, "modeles", map[string]any{"nom": "Semaine de B"})
	avant := a.etat()
	nouvelle := map[string]any{"nom": "Intrus", "type": "creneau"}
	libre := []any{creneau(7, 600, 660)}

	if code, _ := a.do("POST", "/api/semio/quick-add", "", `{}`); code != 401 {
		t.Errorf("invité = %d, attendu 401", code)
	}
	cas := []struct {
		nom   string
		corps map[string]any
	}{
		{"modèle d'un autre compte", map[string]any{"modele": deA["modele"], "nouvelle": nouvelle, "creneaux": libre}},
		{"tâche d'un autre compte", map[string]any{"modele": modeleB, "tache": deA["ecole"], "creneaux": libre}},
		{"rubrique d'un autre compte", map[string]any{"modele": modeleB, "creneaux": libre,
			"nouvelle": map[string]any{"nom": "Intrus", "type": "creneau", "rubrique": deA["etudes"]}}},
		{"modèle inexistant", map[string]any{"modele": "inexistant00000", "nouvelle": nouvelle, "creneaux": libre}},
	}
	for _, c := range cas {
		code, out := a.ajoutRapide(cb, c.corps)
		if code != 404 && code != 400 {
			t.Errorf("%s = %d %s, attendu un refus 404 ou 400", c.nom, code, out)
		}
		if strings.Contains(out, "École") || strings.Contains(out, deA["ecole"]) {
			t.Errorf("%s : la réponse révèle des données de A : %s", c.nom, out)
		}
		if apres := a.etat(); apres != avant {
			t.Errorf("%s : état modifié %v → %v", c.nom, avant, apres)
		}
	}

	// Le propriétaire vient de la session : un `owner` glissé dans le corps est ignoré.
	code, out := a.ajoutRapide(cb, map[string]any{"modele": modeleB, "creneaux": libre,
		"nouvelle": map[string]any{"nom": "À moi", "type": "creneau", "owner": ca.id}})
	if code != 200 || !strings.Contains(out, `"owner":"`+cb.id+`"`) || strings.Contains(out, ca.id) {
		t.Errorf("owner du corps = %d %s, attendu une tâche appartenant à B", code, out)
	}

	// Une tâche archivée ne se replace pas par la création rapide.
	a.patch(ca, "taches", deA["exercices"], map[string]any{"archivee": true})
	if code, out := a.ajoutRapide(ca, map[string]any{"modele": deA["modele"], "tache": deA["exercices"], "creneaux": libre}); code != 422 {
		t.Errorf("tâche archivée = %d %s, attendu 422", code, out)
	}
}
