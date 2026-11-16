// Package domain : règles pures de calendrier et de créneaux (aucune E/S).
package domain

import (
	"errors"
	"time"
)

// Pas de la grille en minutes.
const Pas = 30

// ValidSlot vérifie un créneau [debut, fin) en minutes depuis minuit.
func ValidSlot(debut, fin int) error {
	if debut < 0 || fin > 1440 || debut >= fin {
		return errors.New("Le créneau doit commencer avant de finir, entre 00:00 et 24:00.")
	}
	if debut%Pas != 0 || fin%Pas != 0 {
		return errors.New("Les horaires doivent tomber sur un pas de 30 minutes.")
	}
	return nil
}

// DaysIn renvoie le nombre de jours du mois civil (mois 1–12).
func DaysIn(annee, mois int) int {
	return time.Date(annee, time.Month(mois)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// ValidDateInMonth vérifie qu'une date YYYY-MM-DD est réelle et dans le mois donné.
func ValidDateInMonth(date string, annee, mois int) error {
	// time.Parse refuse les dates impossibles (30 février) et les formats approchants.
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return errors.New("Date invalide (format attendu AAAA-MM-JJ).")
	}
	if t.Year() != annee || int(t.Month()) != mois {
		return errors.New("Cette date n'appartient pas au mois du plan.")
	}
	return nil
}

// NextMonth renvoie le mois civil suivant.
func NextMonth(annee, mois int) (int, int) {
	if mois == 12 {
		return annee + 1, 1
	}
	return annee, mois + 1
}
