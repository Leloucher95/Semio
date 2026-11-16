package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

type compte struct{ id, token string }

// signup inscrit puis connecte un utilisateur par la vraie API.
func (a *api) signup(email string) compte {
	a.t.Helper()
	body := fmt.Sprintf(`{"email":%q,"password":"motdepasse-1234","passwordConfirm":"motdepasse-1234"}`, email)
	if code, out := a.do("POST", "/api/collections/users/records", "", body); code != 200 {
		a.t.Fatalf("inscription %s = %d %s", email, code, out)
	}
	return a.login(email, "motdepasse-1234")
}

func (a *api) login(email, password string) compte {
	a.t.Helper()
	code, out := a.do("POST", "/api/collections/users/auth-with-password", "",
		fmt.Sprintf(`{"identity":%q,"password":%q}`, email, password))
	if code != 200 {
		a.t.Fatalf("connexion %s = %d %s", email, code, out)
	}
	var res struct {
		Token  string
		Record struct{ Id string }
	}
	if err := json.Unmarshal([]byte(out), &res); err != nil {
		a.t.Fatal(err)
	}
	return compte{id: res.Record.Id, token: res.Token}
}

// create crée un enregistrement appartenant à c et renvoie son id.
func (a *api) create(c compte, collection string, champs map[string]any) string {
	a.t.Helper()
	code, out := a.tryCreate(c, c.id, collection, champs)
	if code != 200 {
		a.t.Fatalf("création %s = %d %s", collection, code, out)
	}
	return idOf(a.t, out)
}

// tryCreate tente une création avec le token de c et un owner arbitraire.
func (a *api) tryCreate(c compte, owner, collection string, champs map[string]any) (int, string) {
	a.t.Helper()
	body := map[string]any{"owner": owner}
	for k, v := range champs {
		body[k] = v
	}
	raw, _ := json.Marshal(body)
	return a.do("POST", "/api/collections/"+collection+"/records", c.token, string(raw))
}

func (a *api) patch(c compte, collection, id string, champs map[string]any) (int, string) {
	a.t.Helper()
	raw, _ := json.Marshal(champs)
	return a.do("PATCH", "/api/collections/"+collection+"/records/"+id, c.token, string(raw))
}

func idOf(t *testing.T, out string) string {
	t.Helper()
	var res struct{ Id string }
	if err := json.Unmarshal([]byte(out), &res); err != nil || res.Id == "" {
		t.Fatalf("réponse sans id : %s", out)
	}
	return res.Id
}

// graphe crée un enregistrement dans chaque collection métier pour c.
func (a *api) graphe(c compte) map[string]string {
	a.t.Helper()
	ids := map[string]string{}
	ids["rubriques"] = a.create(c, "rubriques", map[string]any{"nom": "Études", "couleur": "#4a6fa5"})
	ids["taches"] = a.create(c, "taches", map[string]any{
		"nom": "École", "type": "creneau", "couleur": "#4a6fa5", "duree_defaut_min": 480, "rubrique": ids["rubriques"],
	})
	ids["modeles"] = a.create(c, "modeles", map[string]any{"nom": "Ma semaine"})
	ids["modele_taches"] = a.create(c, "modele_taches", map[string]any{"modele": ids["modeles"], "tache": ids["taches"]})
	ids["modele_placements"] = a.create(c, "modele_placements", map[string]any{
		"modele": ids["modeles"], "tache": ids["taches"], "jour_semaine": 1, "debut_min": 480, "fin_min": 960,
	})
	ids["plans_mois"] = a.create(c, "plans_mois", map[string]any{"annee": 2028, "mois": 2})
	ids["plan_taches"] = a.create(c, "plan_taches", map[string]any{
		"plan": ids["plans_mois"], "nom_snapshot": "École", "type_snapshot": "creneau", "couleur_snapshot": "#4a6fa5",
	})
	ids["plan_placements"] = a.create(c, "plan_placements", map[string]any{
		"plan": ids["plans_mois"], "plan_tache": ids["plan_taches"], "jour_semaine": 1, "debut_min": 480, "fin_min": 960,
	})
	ids["suivis"] = a.create(c, "suivis", map[string]any{
		"plan": ids["plans_mois"], "plan_tache": ids["plan_taches"], "date": "2028-02-01", "fait": true,
	})
	return ids
}

// S01–S05 : chaque collection métier est fermée aux invités et aux autres comptes.
func TestIsolationEntreUtilisateurs(t *testing.T) {
	a := newAPI(t)
	A, B := a.signup("a@semio.test"), a.signup("b@semio.test")
	invite := compte{}
	idsA := a.graphe(A)
	a.graphe(B) // B a ses propres données : les listes ne sont pas vides « par hasard »

	for collection, id := range idsA {
		base := "/api/collections/" + collection + "/records"

		for nom, c := range map[string]compte{"invité": invite, "B": B} {
			// S01/S02 : list et view
			code, out := a.do("GET", base, c.token, "")
			if code != 200 || strings.Contains(out, id) {
				t.Errorf("%s list %s = %d, fuite de %s : %s", nom, collection, code, id, out)
			}
			if code, _ := a.do("GET", base+"/"+id, c.token, ""); code != 404 {
				t.Errorf("%s view %s = %d, attendu 404", nom, collection, code)
			}
			// S03 : update et delete
			if code, _ := a.do("PATCH", base+"/"+id, c.token, `{"nom":"piraté","fait":false}`); code != 404 {
				t.Errorf("%s update %s = %d, attendu 404", nom, collection, code)
			}
			if code, _ := a.do("DELETE", base+"/"+id, c.token, ""); code != 404 {
				t.Errorf("%s delete %s = %d, attendu 404", nom, collection, code)
			}
		}
		if code, out := a.do("GET", base, invite.token, ""); !strings.Contains(out, `"totalItems":0`) {
			t.Errorf("invité list %s = %d, attendu une liste vide : %s", collection, code, out)
		}

		// S05 : A ne peut pas céder son enregistrement à B.
		if code, _ := a.patch(A, collection, id, map[string]any{"owner": B.id}); code != 404 {
			t.Errorf("A change owner de %s = %d, attendu 404", collection, code)
		}
		// L'enregistrement de A est intact et lui reste visible.
		code, out := a.do("GET", base+"/"+id, A.token, "")
		if code != 200 || !strings.Contains(out, `"owner":"`+A.id+`"`) {
			t.Errorf("A view %s = %d : %s", collection, code, out)
		}
	}

	// S04 : A ne peut pas créer au nom de B, ni un invité créer quoi que ce soit.
	if code, _ := a.tryCreate(A, B.id, "rubriques", map[string]any{"nom": "Chez B"}); code != 400 {
		t.Errorf("A crée avec owner=B = %d, attendu 400", code)
	}
	if code, _ := a.tryCreate(invite, A.id, "rubriques", map[string]any{"nom": "Invité"}); code != 400 {
		t.Errorf("invité crée = %d, attendu 400", code)
	}
}

// S06/S07 : les API rules ne protègent pas les relations ; le serveur les valide.
func TestRelationsCroiseesRefusees(t *testing.T) {
	a := newAPI(t)
	A, B := a.signup("a@semio.test"), a.signup("b@semio.test")
	idsA, idsB := a.graphe(A), a.graphe(B)

	creations := []struct {
		nom, collection string
		champs          map[string]any
	}{
		{"tâche avec rubrique de B", "taches", map[string]any{"nom": "X", "type": "objectif", "rubrique": idsB["rubriques"]}},
		{"adhésion au modèle de B", "modele_taches", map[string]any{"modele": idsB["modeles"], "tache": idsA["taches"]}},
		{"adhésion d'une tâche de B", "modele_taches", map[string]any{"modele": idsA["modeles"], "tache": idsB["taches"]}},
		{"placement dans le modèle de B", "modele_placements", map[string]any{
			"modele": idsB["modeles"], "tache": idsA["taches"], "jour_semaine": 2, "debut_min": 480, "fin_min": 540}},
		{"placement d'une tâche de B", "modele_placements", map[string]any{
			"modele": idsA["modeles"], "tache": idsB["taches"], "jour_semaine": 2, "debut_min": 480, "fin_min": 540}},
		{"plan avec modèle source de B", "plans_mois", map[string]any{"annee": 2029, "mois": 1, "modele_source": idsB["modeles"]}},
		{"tâche dans le plan de B", "plan_taches", map[string]any{"plan": idsB["plans_mois"], "nom_snapshot": "X", "type_snapshot": "objectif"}},
		{"tâche de plan avec source de B", "plan_taches", map[string]any{
			"plan": idsA["plans_mois"], "tache_source": idsB["taches"], "nom_snapshot": "X", "type_snapshot": "objectif"}},
		{"placement avec plan_tache de B", "plan_placements", map[string]any{
			"plan": idsA["plans_mois"], "plan_tache": idsB["plan_taches"], "jour_semaine": 2, "debut_min": 480, "fin_min": 540}},
		{"placement dans le plan de B", "plan_placements", map[string]any{
			"plan": idsB["plans_mois"], "plan_tache": idsA["plan_taches"], "jour_semaine": 2, "debut_min": 480, "fin_min": 540}},
		{"suivi sur plan_tache de B", "suivis", map[string]any{
			"plan": idsA["plans_mois"], "plan_tache": idsB["plan_taches"], "date": "2028-02-02", "fait": true}},
		{"suivi dans le plan de B", "suivis", map[string]any{
			"plan": idsB["plans_mois"], "plan_tache": idsA["plan_taches"], "date": "2028-02-02", "fait": true}},
	}
	for _, c := range creations {
		if code, out := a.tryCreate(A, A.id, c.collection, c.champs); code != 400 {
			t.Errorf("%s = %d, attendu 400 : %s", c.nom, code, out)
		}
	}

	// Même refus en modification d'un enregistrement existant de A.
	if code, out := a.patch(A, "taches", idsA["taches"], map[string]any{"rubrique": idsB["rubriques"]}); code != 400 {
		t.Errorf("A greffe la rubrique de B par update = %d, attendu 400 : %s", code, out)
	}
	if code, out := a.patch(A, "suivis", idsA["suivis"], map[string]any{"plan_tache": idsB["plan_taches"]}); code != 400 {
		t.Errorf("A greffe le plan_tache de B par update = %d, attendu 400 : %s", code, out)
	}
	// Un identifiant inexistant et un identifiant étranger donnent la même réponse (pas d'oracle).
	codeEtranger, _ := a.tryCreate(A, A.id, "taches", map[string]any{"nom": "X", "type": "objectif", "rubrique": idsB["rubriques"]})
	codeInconnu, _ := a.tryCreate(A, A.id, "taches", map[string]any{"nom": "X", "type": "objectif", "rubrique": "inexistant00000"})
	if codeEtranger != codeInconnu {
		t.Errorf("statuts différents pour id étranger (%d) et inconnu (%d)", codeEtranger, codeInconnu)
	}
}

// S08 : inscription, session, profil ; la liste des utilisateurs est fermée.
func TestAuthEtProfil(t *testing.T) {
	a := newAPI(t)
	A, B := a.signup("a@semio.test"), a.signup("b@semio.test")

	if code, _ := a.do("POST", "/api/collections/users/auth-with-password", "",
		`{"identity":"a@semio.test","password":"mauvais-mot-de-passe"}`); code != 400 {
		t.Errorf("mauvais mot de passe = %d, attendu 400", code)
	}
	// Session : le token ouvre auth-refresh, son absence non.
	if code, _ := a.do("POST", "/api/collections/users/auth-refresh", A.token, ""); code != 200 {
		t.Errorf("auth-refresh avec token = %d", code)
	}
	if code, _ := a.do("POST", "/api/collections/users/auth-refresh", "", ""); code != 401 {
		t.Errorf("auth-refresh sans token = %d, attendu 401", code)
	}

	// users.list : un invité ne voit personne, A ne voit que lui.
	_, out := a.do("GET", "/api/collections/users/records", "", "")
	if !strings.Contains(out, `"totalItems":0`) {
		t.Errorf("invité liste les utilisateurs : %s", out)
	}
	_, out = a.do("GET", "/api/collections/users/records", A.token, "")
	if !strings.Contains(out, A.id) || strings.Contains(out, B.id) || !strings.Contains(out, `"totalItems":1`) {
		t.Errorf("A doit ne voir que son profil : %s", out)
	}
	if code, _ := a.do("GET", "/api/collections/users/records/"+A.id, B.token, ""); code != 404 {
		t.Errorf("B lit le profil de A = %d, attendu 404", code)
	}
	if code, _ := a.patch(B, "users", A.id, map[string]any{"timezone": "Asia/Tokyo"}); code != 404 {
		t.Errorf("B modifie le profil de A = %d, attendu 404", code)
	}

	// Fuseau : défaut Africa/Porto-Novo, modifiable, validé.
	_, out = a.do("GET", "/api/collections/users/records/"+A.id, A.token, "")
	if !strings.Contains(out, `"timezone":"Africa/Porto-Novo"`) {
		t.Errorf("fuseau par défaut absent : %s", out)
	}
	if code, out := a.patch(A, "users", A.id, map[string]any{"timezone": "America/New_York"}); code != 200 {
		t.Errorf("A change son fuseau = %d %s", code, out)
	}
	if code, _ := a.patch(A, "users", A.id, map[string]any{"timezone": "Mars/Olympus"}); code != 400 {
		t.Errorf("fuseau invalide accepté = %d", code)
	}
}
