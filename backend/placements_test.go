package main

import (
	"strings"
	"testing"
)

// G03 : le serveur refuse les chevauchements même si le front est contourné.
func TestPlacementsDuModele(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.graphe(A) // École : lundi 08:00–16:00 dans le modèle
	sport := a.create(A, "taches", map[string]any{"nom": "Sport", "type": "creneau"})
	a.create(A, "modele_taches", map[string]any{"modele": ids["modeles"], "tache": sport})

	placer := func(tache string, jour, debut, fin int) (int, string) {
		return a.tryCreate(A, A.id, "modele_placements", map[string]any{
			"modele": ids["modeles"], "tache": tache, "jour_semaine": jour, "debut_min": debut, "fin_min": fin,
		})
	}

	refus := []struct {
		nom              string
		jour, debut, fin int
	}{
		{"collision partielle en fin", 1, 900, 1020},
		{"collision partielle en début", 1, 420, 510},
		{"collision englobante", 1, 420, 1020},
		{"collision englobée", 1, 600, 660},
		{"hors pas de 30 minutes", 2, 485, 545},
		{"fin avant début", 2, 600, 540},
		{"durée nulle", 2, 600, 600},
		{"au-delà de minuit", 2, 1410, 1470},
	}
	for _, c := range refus {
		code, out := placer(sport, c.jour, c.debut, c.fin)
		if code != 422 && code != 400 {
			t.Errorf("%s = %d, attendu un refus : %s", c.nom, code, out)
		}
	}
	// Le refus de chevauchement porte un message affichable tel quel.
	if code, out := placer(sport, 1, 900, 1020); code != 422 || !strings.Contains(out, "chevauche") {
		t.Errorf("chevauchement = %d %s, attendu 422 avec message", code, out)
	}

	// G01 côté serveur : l'adjacence est permise ([début, fin)), un autre jour aussi.
	code, out := placer(sport, 1, 960, 1020)
	if code != 200 {
		t.Fatalf("créneau adjacent = %d %s", code, out)
	}
	adjacent := idOf(t, out)
	if code, out := placer(sport, 2, 480, 960); code != 200 {
		t.Errorf("même horaire un autre jour = %d %s", code, out)
	}
	if code, out := placer(sport, 7, 0, 1440); code != 200 {
		t.Errorf("journée entière 00:00–24:00 = %d %s", code, out)
	}

	// Déplacement : refusé sur un créneau occupé, accepté sur place (on s'ignore soi-même).
	if code, _ := a.patch(A, "modele_placements", adjacent, map[string]any{"debut_min": 930}); code != 422 {
		t.Errorf("déplacement en collision = %d, attendu 422", code)
	}
	if code, out := a.patch(A, "modele_placements", adjacent, map[string]any{"fin_min": 1080}); code != 200 {
		t.Errorf("étirement libre = %d %s", code, out)
	}

	// Une tâche hors du modèle ne peut pas y être placée.
	hors := a.create(A, "taches", map[string]any{"nom": "Hors modèle", "type": "creneau"})
	if code, _ := placer(hors, 3, 480, 540); code != 422 {
		t.Errorf("placement d'une tâche non membre = %d, attendu 422", code)
	}

	// Retirer une tâche du modèle retire ses placements, pas la tâche.
	membre, _ := a.app.FindFirstRecordByData("modele_taches", "tache", sport)
	if code, _ := a.do("DELETE", "/api/collections/modele_taches/records/"+membre.Id, A.token, ""); code != 204 {
		t.Fatalf("retrait du modèle = %d", code)
	}
	if n, _ := a.app.CountRecords("modele_placements"); n != 1 {
		t.Errorf("%d placements restants, attendu 1 (École)", n)
	}
	if _, err := a.app.FindRecordById("taches", sport); err != nil {
		t.Errorf("la tâche source a disparu : %v", err)
	}
}

func TestPlacementsDuPlan(t *testing.T) {
	a := newAPI(t)
	A := a.signup("a@semio.test")
	ids := a.graphe(A) // École : lundi 08:00–16:00 dans le plan de février 2028

	placer := func(plan, planTache string, jour, debut, fin int) (int, string) {
		return a.tryCreate(A, A.id, "plan_placements", map[string]any{
			"plan": plan, "plan_tache": planTache, "jour_semaine": jour, "debut_min": debut, "fin_min": fin,
		})
	}
	if code, _ := placer(ids["plans_mois"], ids["plan_taches"], 1, 900, 1020); code != 422 {
		t.Errorf("chevauchement dans le plan = %d, attendu 422", code)
	}
	if code, out := placer(ids["plans_mois"], ids["plan_taches"], 1, 960, 1020); code != 200 {
		t.Errorf("adjacent dans le plan = %d %s", code, out)
	}

	// Une tâche d'un autre de MES plans ne peut pas être placée dans ce plan.
	mars := a.create(A, "plans_mois", map[string]any{"annee": 2028, "mois": 3})
	if code, _ := placer(mars, ids["plan_taches"], 2, 480, 540); code != 422 {
		t.Errorf("plan_tache d'un autre plan = %d, attendu 422", code)
	}
}
