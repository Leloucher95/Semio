package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// semaineType crée le jeu de référence des critères d'acceptation :
// École (créneau, lundi–vendredi 08:00–16:00), Lecture (120 min/jour, 2 jours/semaine), Exercices (7 jours/semaine).
func (a *api) semaineType(c compte) map[string]string {
	a.t.Helper()
	ids := map[string]string{}
	ids["etudes"] = a.create(c, "rubriques", map[string]any{"nom": "Études", "couleur": "#4a6fa5"})
	ids["ecole"] = a.create(c, "taches", map[string]any{
		"nom": "École", "type": "creneau", "couleur": "#4a6fa5", "icone": "🏫", "duree_defaut_min": 480, "rubrique": ids["etudes"]})
	ids["lecture"] = a.create(c, "taches", map[string]any{
		"nom": "Lecture", "type": "objectif", "couleur": "#3d6b4f", "cible_minutes_par_jour": 120, "cible_jours_semaine": 2})
	ids["exercices"] = a.create(c, "taches", map[string]any{"nom": "Exercices", "type": "objectif", "cible_jours_semaine": 7})
	ids["modele"] = a.create(c, "modeles", map[string]any{"nom": "Ma semaine"})
	for _, t := range []string{"ecole", "lecture", "exercices"} {
		a.create(c, "modele_taches", map[string]any{"modele": ids["modele"], "tache": ids[t]})
	}
	for jour := 1; jour <= 5; jour++ {
		ids[fmt.Sprintf("placement%d", jour)] = a.create(c, "modele_placements", map[string]any{
			"modele": ids["modele"], "tache": ids["ecole"], "jour_semaine": jour, "debut_min": 480, "fin_min": 960})
	}
	return ids
}

func (a *api) appliquer(c compte, modele string, annee, mois int) (int, string) {
	return a.do("POST", "/api/semio/apply-template", c.token,
		fmt.Sprintf(`{"modele":%q,"annee":%d,"mois":%d}`, modele, annee, mois))
}

func (a *api) dupliquer(c compte, plan string) (int, string) {
	return a.do("POST", "/api/semio/duplicate-month", c.token, fmt.Sprintf(`{"plan":%q}`, plan))
}

// mustPlan applique le modèle et renvoie l'id du plan créé.
func (a *api) mustPlan(c compte, modele string, annee, mois int) string {
	a.t.Helper()
	code, out := a.appliquer(c, modele, annee, mois)
	if code != 200 {
		a.t.Fatalf("application %d-%d = %d %s", annee, mois, code, out)
	}
	return idOf(a.t, out)
}

func (a *api) duPlan(collection, plan string) []*core.Record {
	a.t.Helper()
	recs, err := a.app.FindRecordsByFilter(collection, "plan = {:p}", "created", 0, 0, dbx.Params{"p": plan})
	if err != nil {
		a.t.Fatal(err)
	}
	return recs
}

func (a *api) planTache(plan, nom string) *core.Record {
	a.t.Helper()
	for _, pt := range a.duPlan("plan_taches", plan) {
		if pt.GetString("nom_snapshot") == nom {
			return pt
		}
	}
	a.t.Fatalf("tâche %q absente du plan", nom)
	return nil
}

func (a *api) compter(collection string) int64 {
	a.t.Helper()
	n, err := a.app.CountRecords(collection)
	if err != nil {
		a.t.Fatal(err)
	}
	return n
}

// M01 : l'application copie toutes les tâches du modèle, objectifs sans créneau compris.
func TestAppliquerCopieTachesEtObjectifs(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	plan := a.mustPlan(A, ids["modele"], 2028, 2)

	if n := len(a.duPlan("plan_taches", plan)); n != 3 {
		t.Fatalf("%d tâches dans le plan, attendu 3 (objectifs non placés compris)", n)
	}
	if n := len(a.duPlan("plan_placements", plan)); n != 5 {
		t.Errorf("%d créneaux dans le plan, attendu 5", n)
	}
	ecole := a.planTache(plan, "École")
	attendu := map[string]any{
		"owner": A.id, "tache_source": ids["ecole"], "rubrique_nom_snapshot": "Études",
		"couleur_snapshot": "#4a6fa5", "icone_snapshot": "🏫", "type_snapshot": "creneau",
	}
	for champ, v := range attendu {
		if ecole.GetString(champ) != v {
			t.Errorf("École.%s = %q, attendu %q", champ, ecole.GetString(champ), v)
		}
	}
	lecture := a.planTache(plan, "Lecture")
	if lecture.GetInt("cible_minutes_par_jour_snapshot") != 120 || lecture.GetInt("cible_jours_semaine_snapshot") != 2 {
		t.Errorf("cibles de Lecture non copiées : %v", lecture.PublicExport())
	}
	if a.planTache(plan, "Exercices").GetInt("cible_jours_semaine_snapshot") != 7 {
		t.Errorf("cible d'Exercices non copiée")
	}
	for _, p := range a.duPlan("plan_placements", plan) {
		if p.GetString("plan_tache") != ecole.Id || p.GetInt("debut_min") != 480 || p.GetInt("fin_min") != 960 {
			t.Errorf("créneau inattendu : %v", p.PublicExport())
		}
	}
	rec, _ := a.app.FindRecordById("plans_mois", plan)
	if rec.GetString("modele_source") != ids["modele"] || rec.GetString("owner") != A.id {
		t.Errorf("plan mal rattaché : %v", rec.PublicExport())
	}
}

// M02/M03 : la bibliothèque et le modèle évoluent, le mois appliqué ne bouge pas.
func TestHistoriqueFige(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	plan := a.mustPlan(A, ids["modele"], 2028, 2)

	// M02 : renommer, changer la cible, archiver.
	if code, out := a.patch(A, "taches", ids["lecture"], map[string]any{
		"nom": "Lecture du soir", "cible_minutes_par_jour": 30, "cible_jours_semaine": 5, "couleur": "#a23a4e"}); code != 200 {
		t.Fatalf("modification de la tâche = %d %s", code, out)
	}
	a.patch(A, "taches", ids["exercices"], map[string]any{"archivee": true})
	a.patch(A, "rubriques", ids["etudes"], map[string]any{"nom": "Scolarité"})

	// M03 : déplacer un créneau du modèle, en retirer un, retirer une tâche du modèle.
	a.patch(A, "modele_placements", ids["placement1"], map[string]any{"debut_min": 540, "fin_min": 1020})
	a.do("DELETE", "/api/collections/modele_placements/records/"+ids["placement2"], A.token, "")
	membre, _ := a.app.FindFirstRecordByData("modele_taches", "tache", ids["lecture"])
	a.do("DELETE", "/api/collections/modele_taches/records/"+membre.Id, A.token, "")

	lecture := a.planTache(plan, "Lecture") // toujours sous son ancien nom
	if lecture.GetInt("cible_minutes_par_jour_snapshot") != 120 || lecture.GetInt("cible_jours_semaine_snapshot") != 2 ||
		lecture.GetString("couleur_snapshot") != "#3d6b4f" {
		t.Errorf("l'instantané de Lecture a changé : %v", lecture.PublicExport())
	}
	if a.planTache(plan, "École").GetString("rubrique_nom_snapshot") != "Études" {
		t.Errorf("le nom de rubrique copié a changé")
	}
	a.planTache(plan, "Exercices") // l'archivage ne retire rien du plan
	placements := a.duPlan("plan_placements", plan)
	if len(placements) != 5 {
		t.Fatalf("%d créneaux dans le plan après modification du modèle, attendu 5", len(placements))
	}
	for _, p := range placements {
		if p.GetInt("debut_min") != 480 || p.GetInt("fin_min") != 960 {
			t.Errorf("un créneau du plan a suivi le modèle : %v", p.PublicExport())
		}
	}

	// Supprimer le modèle lui-même ne détruit pas le mois.
	if code, _ := a.do("DELETE", "/api/collections/modeles/records/"+ids["modele"], A.token, ""); code != 204 {
		t.Fatalf("suppression du modèle = %d", code)
	}
	if n := len(a.duPlan("plan_taches", plan)); n != 3 {
		t.Errorf("%d tâches dans le plan après suppression du modèle, attendu 3", n)
	}
}

// M04/M05/M06 : la duplication copie le plan source (pas le modèle), sans le suivi, décembre → janvier.
func TestDupliquerLeMois(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	fevrier := a.mustPlan(A, ids["modele"], 2028, 2)

	// Le plan de février vit sa vie : une tâche renommée, un créneau retiré, du suivi saisi.
	lecture := a.planTache(fevrier, "Lecture")
	a.patch(A, "plan_taches", lecture.Id, map[string]any{"nom_snapshot": "Lecture de février"})
	a.do("DELETE", "/api/collections/plan_placements/records/"+a.duPlan("plan_placements", fevrier)[0].Id, A.token, "")
	a.create(A, "suivis", map[string]any{"plan": fevrier, "plan_tache": lecture.Id, "date": "2028-02-02", "minutes": 120})
	a.create(A, "suivis", map[string]any{
		"plan": fevrier, "plan_tache": a.planTache(fevrier, "Exercices").Id, "date": "2028-02-01", "fait": true})
	// Le modèle, lui, change dans une autre direction.
	a.patch(A, "taches", ids["lecture"], map[string]any{"nom": "Lecture (modèle)"})
	a.create(A, "modele_placements", map[string]any{
		"modele": ids["modele"], "tache": ids["ecole"], "jour_semaine": 6, "debut_min": 480, "fin_min": 600})

	code, out := a.dupliquer(A, fevrier)
	if code != 200 {
		t.Fatalf("duplication = %d %s", code, out)
	}
	var mars struct {
		Id          string
		Annee, Mois int
	}
	json.Unmarshal([]byte(out), &mars)
	if mars.Annee != 2028 || mars.Mois != 3 {
		t.Fatalf("mois cible = %d-%d, attendu 2028-3", mars.Annee, mars.Mois)
	}

	// M04 : mars reflète février tel qu'il est, pas le modèle.
	a.planTache(mars.Id, "Lecture de février")
	if n := len(a.duPlan("plan_taches", mars.Id)); n != 3 {
		t.Errorf("%d tâches en mars, attendu 3", n)
	}
	if n := len(a.duPlan("plan_placements", mars.Id)); n != 4 {
		t.Errorf("%d créneaux en mars, attendu 4 (ceux de février, sans le samedi ajouté au modèle)", n)
	}
	for _, p := range a.duPlan("plan_placements", mars.Id) {
		pt, _ := a.app.FindRecordById("plan_taches", p.GetString("plan_tache"))
		if pt.GetString("plan") != mars.Id {
			t.Errorf("un créneau de mars pointe vers une tâche d'un autre plan")
		}
	}
	// M05 : aucun suivi copié, ceux de février intacts.
	if n := len(a.duPlan("suivis", mars.Id)); n != 0 {
		t.Errorf("%d suivis copiés en mars, attendu 0", n)
	}
	if n := len(a.duPlan("suivis", fevrier)); n != 2 {
		t.Errorf("%d suivis en février, attendu 2", n)
	}

	// M06 : décembre → janvier de l'année suivante.
	decembre := a.mustPlan(A, ids["modele"], 2027, 12)
	code, out = a.dupliquer(A, decembre)
	if code != 200 || !strings.Contains(out, `"annee":2028`) || !strings.Contains(out, `"mois":1`) {
		t.Errorf("décembre 2027 → %d %s, attendu janvier 2028", code, out)
	}
}

// M07 : mois cible existant = conflit explicite, rien n'est écrasé.
func TestMoisExistantJamaisEcrase(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	fevrier := a.mustPlan(A, ids["modele"], 2028, 2)
	mars := a.mustPlan(A, ids["modele"], 2028, 3)
	suivi := a.create(A, "suivis", map[string]any{
		"plan": mars, "plan_tache": a.planTache(mars, "Exercices").Id, "date": "2028-03-01", "fait": true})
	avant := [4]int64{a.compter("plans_mois"), a.compter("plan_taches"), a.compter("plan_placements"), a.compter("suivis")}

	code, out := a.dupliquer(A, fevrier)
	if code != 409 || !strings.Contains(out, "mars 2028") {
		t.Errorf("duplication vers un mois existant = %d %s, attendu 409 nommant le mois", code, out)
	}
	if code, _ := a.appliquer(A, ids["modele"], 2028, 3); code != 409 {
		t.Errorf("application sur un mois existant = %d, attendu 409", code)
	}
	apres := [4]int64{a.compter("plans_mois"), a.compter("plan_taches"), a.compter("plan_placements"), a.compter("suivis")}
	if avant != apres {
		t.Errorf("des écritures ont eu lieu malgré le conflit : %v → %v", avant, apres)
	}
	if _, err := a.app.FindRecordById("suivis", suivi); err != nil {
		t.Errorf("le suivi de mars a disparu")
	}
}

// M08 : un échec au milieu de la copie annule tout.
func TestApplicationAtomique(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)

	// Modèle corrompu en base (validations contournées) : un créneau chevauche École le lundi.
	col, _ := a.app.FindCollectionByNameOrId("modele_placements")
	corrompu := core.NewRecord(col)
	corrompu.Load(map[string]any{
		"owner": A.id, "modele": ids["modele"], "tache": ids["ecole"], "jour_semaine": 1, "debut_min": 600, "fin_min": 660})
	if err := a.app.SaveNoValidate(corrompu); err != nil {
		t.Fatal(err)
	}

	code, out := a.appliquer(A, ids["modele"], 2028, 2)
	if code == 200 {
		t.Fatalf("un modèle incohérent a été appliqué : %s", out)
	}
	for _, c := range []string{"plans_mois", "plan_taches", "plan_placements"} {
		if n := a.compter(c); n != 0 {
			t.Errorf("écriture partielle : %d enregistrement(s) dans %s", n, c)
		}
	}

	// Une fois le modèle réparé, le même mois s'applique normalement.
	a.app.Delete(corrompu)
	a.mustPlan(A, ids["modele"], 2028, 2)
}

// M09 : deux duplications simultanées ne créent qu'un plan.
func TestDuplicationsConcurrentes(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	fevrier := a.mustPlan(A, ids["modele"], 2028, 2)

	const n = 6
	codes := make([]int, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i], _ = a.dupliquer(A, fevrier)
		}()
	}
	wg.Wait()

	succes := 0
	for _, code := range codes {
		switch code {
		case 200:
			succes++
		case 409:
		default:
			t.Errorf("statut inattendu %d", code)
		}
	}
	if succes != 1 {
		t.Errorf("%d duplications réussies sur %d, attendu exactement 1 (%v)", succes, n, codes)
	}
	if n := a.compter("plans_mois"); n != 2 {
		t.Errorf("%d plans, attendu 2 (février et mars)", n)
	}
	if n := a.compter("plan_taches"); n != 6 {
		t.Errorf("%d tâches de plan, attendu 6 (pas de copie en double)", n)
	}
}

// Les routes métier recalculent le propriétaire depuis la session.
func TestRoutesPlanningSecurite(t *testing.T) {
	a := newAPI(t)
	A, B := a.signup("a@semio.test"), a.signup("b@semio.test")
	ids := a.semaineType(A)
	fevrier := a.mustPlan(A, ids["modele"], 2028, 2)

	if code, _ := a.appliquer(compte{}, ids["modele"], 2028, 4); code != 401 {
		t.Errorf("invité applique = %d, attendu 401", code)
	}
	if code, _ := a.dupliquer(compte{}, fevrier); code != 401 {
		t.Errorf("invité duplique = %d, attendu 401", code)
	}
	// S07 : B ne peut ni appliquer le modèle de A ni dupliquer son mois.
	if code, _ := a.appliquer(B, ids["modele"], 2028, 4); code != 404 {
		t.Errorf("B applique le modèle de A = %d, attendu 404", code)
	}
	if code, _ := a.dupliquer(B, fevrier); code != 404 {
		t.Errorf("B duplique le mois de A = %d, attendu 404", code)
	}
	if n := a.compter("plans_mois"); n != 1 {
		t.Errorf("%d plans après tentatives de B, attendu 1", n)
	}
	// Mois invalides.
	for _, m := range [][2]int{{2028, 13}, {2028, 0}, {1800, 1}} {
		if code, _ := a.appliquer(A, ids["modele"], m[0], m[1]); code != 400 {
			t.Errorf("application sur %d-%d = %d, attendu 400", m[0], m[1], code)
		}
	}
	// B peut avoir son propre février 2028 : l'unicité est par propriétaire.
	idsB := a.semaineType(B)
	a.mustPlan(B, idsB["modele"], 2028, 2)
}

// D05, T01, T02, T03 : règles du suivi quotidien.
func TestSuivi(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.semaineType(A)
	fevrier := a.mustPlan(A, ids["modele"], 2028, 2)
	fevrier27 := a.mustPlan(A, ids["modele"], 2027, 2)
	lecture, exercices, ecole := a.planTache(fevrier, "Lecture"), a.planTache(fevrier, "Exercices"), a.planTache(fevrier, "École")

	suivre := func(plan, planTache, date string, champs map[string]any) (int, string) {
		body := map[string]any{"plan": plan, "plan_tache": planTache, "date": date}
		for k, v := range champs {
			body[k] = v
		}
		return a.tryCreate(A, A.id, "suivis", body)
	}

	// D05 : dates non réelles, hors mois, mal formées ; minutes hors bornes.
	if code, _ := suivre(fevrier, exercices.Id, "2028-02-29", map[string]any{"fait": true}); code != 200 {
		t.Errorf("29 février 2028 (bissextile) refusé : %d", code)
	}
	exercices27 := a.planTache(fevrier27, "Exercices").Id
	for _, date := range []string{"2027-02-29", "2027-02-30", "2027-03-01", "2027-01-31", "2027-2-1", "2027-02-01T00:00:00Z", ""} {
		if code, _ := suivre(fevrier27, exercices27, date, map[string]any{"fait": true}); code != 422 && code != 400 {
			t.Errorf("date %q acceptée (%d)", date, code)
		}
	}
	for _, minutes := range []int{-5, 1441} {
		if code, _ := suivre(fevrier, lecture.Id, "2028-02-10", map[string]any{"minutes": minutes}); code != 400 {
			t.Errorf("%d minutes acceptées (%d)", minutes, code)
		}
	}
	// Une tâche d'un autre de mes plans ne se suit pas dans ce plan.
	if code, _ := suivre(fevrier, exercices27, "2028-02-03", map[string]any{"fait": true}); code != 422 {
		t.Errorf("suivi d'une tâche d'un autre plan = %d, attendu 422", code)
	}

	// T02 : pour un objectif en minutes, `fait` découle des minutes — 119 ne suffit pas, 120 oui.
	code, out := suivre(fevrier, lecture.Id, "2028-02-02", map[string]any{"minutes": 119, "fait": true})
	if code != 200 || !strings.Contains(out, `"fait":false`) {
		t.Fatalf("119 minutes : %d %s, attendu fait=false", code, out)
	}
	suiviLecture := idOf(t, out)
	if code, out := a.patch(A, "suivis", suiviLecture, map[string]any{"minutes": 120}); code != 200 || !strings.Contains(out, `"fait":true`) {
		t.Errorf("120 minutes : %d %s, attendu fait=true", code, out)
	}
	if _, out := a.patch(A, "suivis", suiviLecture, map[string]any{"minutes": 150}); !strings.Contains(out, `"fait":true`) {
		t.Errorf("150 minutes (au-delà de la cible) : %s, attendu fait=true", out)
	}
	// Sans cible en minutes, la coche est manuelle.
	if _, out := suivre(fevrier, exercices.Id, "2028-02-01", map[string]any{"fait": true}); !strings.Contains(out, `"fait":true`) {
		t.Errorf("coche manuelle perdue : %s", out)
	}

	// T01 : le suivi tient à (tâche du plan, date) — retirer ou déplacer les créneaux ne le touche pas.
	_, out = suivre(fevrier, ecole.Id, "2028-02-07", map[string]any{"fait": true})
	suiviEcole := idOf(t, out)
	for _, p := range a.duPlan("plan_placements", fevrier) {
		a.do("DELETE", "/api/collections/plan_placements/records/"+p.Id, A.token, "")
	}
	if rec, err := a.app.FindRecordById("suivis", suiviEcole); err != nil || !rec.GetBool("fait") {
		t.Errorf("la coche d'École a disparu avec ses créneaux")
	}

	// T03 : un seul suivi par (tâche, date) — deux jours par semaine exigent deux dates différentes.
	faits := func() string {
		_, out := a.do("GET", "/api/collections/suivis/records?filter="+
			"(plan_tache='"+lecture.Id+"'%26%26fait=true%26%26date>='2028-02-07'%26%26date<='2028-02-13')", A.token, "")
		return out
	}
	suivre(fevrier, lecture.Id, "2028-02-08", map[string]any{"minutes": 120})
	if code, _ := suivre(fevrier, lecture.Id, "2028-02-08", map[string]any{"minutes": 120}); code != 400 {
		t.Errorf("second suivi le même jour = %d, attendu 400", code)
	}
	if !strings.Contains(faits(), `"totalItems":1`) {
		t.Errorf("après deux saisies le même jour : %s, attendu 1 jour accompli", faits())
	}
	suivre(fevrier, lecture.Id, "2028-02-10", map[string]any{"minutes": 119}) // jour insuffisant : ne compte pas
	if !strings.Contains(faits(), `"totalItems":1`) {
		t.Errorf("un jour à 119 minutes a compté : %s", faits())
	}
	suivre(fevrier, lecture.Id, "2028-02-12", map[string]any{"minutes": 130})
	if !strings.Contains(faits(), `"totalItems":2`) {
		t.Errorf("deux dates différentes : %s, attendu 2 jours accomplis", faits())
	}
}
