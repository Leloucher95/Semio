package domain

import "testing"

func TestValidSlot(t *testing.T) {
	cases := []struct {
		debut, fin int
		ok         bool
	}{
		{480, 960, true},    // 08:00–16:00
		{0, 1440, true},     // journée entière
		{480, 480, false},   // durée nulle
		{960, 480, false},   // fin avant début
		{-30, 60, false},    // négatif
		{1410, 1470, false}, // dépasse minuit
		{485, 545, false},   // hors pas de 30 min
	}
	for _, c := range cases {
		if got := ValidSlot(c.debut, c.fin) == nil; got != c.ok {
			t.Errorf("ValidSlot(%d,%d) ok=%v, attendu %v", c.debut, c.fin, got, c.ok)
		}
	}
}

func TestDaysIn(t *testing.T) {
	cases := []struct{ annee, mois, jours int }{
		{2028, 2, 29}, {2027, 2, 28}, {2100, 2, 28}, {2000, 2, 29},
		{2027, 1, 31}, {2027, 4, 30}, {2027, 12, 31},
	}
	for _, c := range cases {
		if got := DaysIn(c.annee, c.mois); got != c.jours {
			t.Errorf("DaysIn(%d,%d)=%d, attendu %d", c.annee, c.mois, got, c.jours)
		}
	}
}

func TestValidDateInMonth(t *testing.T) {
	cases := []struct {
		date        string
		annee, mois int
		ok          bool
	}{
		{"2028-02-29", 2028, 2, true},
		{"2027-02-29", 2027, 2, false}, // date non réelle
		{"2028-02-30", 2028, 2, false},
		{"2028-03-01", 2028, 2, false}, // hors mois
		{"2028-2-1", 2028, 2, false},   // format
		{"2028-02-01T00:00:00Z", 2028, 2, false},
		{"", 2028, 2, false},
	}
	for _, c := range cases {
		if got := ValidDateInMonth(c.date, c.annee, c.mois) == nil; got != c.ok {
			t.Errorf("ValidDateInMonth(%q,%d,%d) ok=%v, attendu %v", c.date, c.annee, c.mois, got, c.ok)
		}
	}
}

func TestNextMonth(t *testing.T) {
	if a, m := NextMonth(2027, 12); a != 2028 || m != 1 {
		t.Errorf("décembre → %d-%d, attendu 2028-1", a, m)
	}
	if a, m := NextMonth(2028, 2); a != 2028 || m != 3 {
		t.Errorf("février → %d-%d, attendu 2028-3", a, m)
	}
}
