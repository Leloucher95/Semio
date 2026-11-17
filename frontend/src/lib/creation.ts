// Logique pure de la création rapide dans la grille : aucune dépendance au DOM, à Vue ou au réseau.
import { collision, PAS } from './grid'
import type { Creneau } from './types'

const MINUIT = 1440

/** Comparaison de noms : sans casse, sans accents, sans espaces en trop. */
const normaliser = (texte: string) =>
  texte.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')

/** Tâches déjà chargées dont le nom contient la saisie ; celles qui commencent par elle d'abord. */
export function suggestions<T extends { nom: string }>(taches: T[], saisie: string, max = 6): T[] {
  const q = normaliser(saisie)
  if (!q) return []
  const rang = (t: T) => (normaliser(t.nom).startsWith(q) ? 0 : 1)
  return taches
    .filter((t) => normaliser(t.nom).includes(q))
    .sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, max)
}

/** Tâche portant exactement ce nom : la réutiliser évite un doublon involontaire. */
export const existante = <T extends { nom: string }>(taches: T[], saisie: string) => {
  const q = normaliser(saisie)
  return q ? taches.find((t) => normaliser(t.nom) === q) : undefined
}

/** Début (pas de 30 minutes) de la demi-heure dans laquelle tombe un clic à `minute`. */
export const debutDepuisClic = (minute: number) =>
  Math.min(Math.max(Math.floor(minute / PAS) * PAS, 0), MINUIT - PAS)

/** Durées proposables depuis `debut` sans dépasser minuit, et celle à présélectionner (`souhaitee`, 60 par défaut). */
export function dureesPossibles(debut: number, souhaitee = 60) {
  const max = MINUIT - debut
  const liste = [30, 60, 90, 120, 180, 240, 300, 360, 420, 480].filter((d) => d <= max)
  if (!liste.includes(souhaitee) && souhaitee <= max && souhaitee % PAS === 0) liste.push(souhaitee)
  liste.sort((a, b) => a - b)
  return { liste, defaut: liste.includes(souhaitee) ? souhaitee : liste[liste.length - 1]! }
}

export type Repetition = 'jour' | 'semaine' | 'tous' | 'choix'

/** Jours ISO (1 = lundi) concernés par un choix de répétition. */
export function joursPour(repetition: Repetition, jour: number, choisis: number[]): number[] {
  if (repetition === 'semaine') return [1, 2, 3, 4, 5]
  if (repetition === 'tous') return [1, 2, 3, 4, 5, 6, 7]
  return repetition === 'choix' ? [...new Set(choisis)].sort((a, b) => a - b) : [jour]
}

/** Jours où le créneau [debut, fin) chevaucherait un bloc existant. */
export const conflits = (jours: number[], debut: number, fin: number, blocs: (Creneau & { id: string })[]) =>
  jours.filter((jour_semaine) => collision({ jour_semaine, debut_min: debut, fin_min: fin }, blocs))
