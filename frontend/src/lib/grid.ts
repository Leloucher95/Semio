// Logique pure de la grille horaire : aucune dépendance au DOM ni à Vue.
import type { Creneau } from './types'

export const PAS = 30
const MINUIT = 1440

/** Intervalles semi-ouverts [début, fin) : 08:00–09:00 et 09:00–10:00 ne se chevauchent pas. */
export const overlaps = (a: Creneau, b: Creneau) =>
  a.jour_semaine === b.jour_semaine && a.debut_min < b.fin_min && b.debut_min < a.fin_min

/** Vrai si `cible` chevauche un des blocs, en ignorant celui que l'on déplace. */
export const collision = (cible: Creneau, blocs: (Creneau & { id: string })[], ignoreId?: string) =>
  blocs.some((b) => b.id !== ignoreId && overlaps(cible, b))

export const snap = (minutes: number) => Math.round(minutes / PAS) * PAS

const borner = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export type Geste =
  | { type: 'creer'; duree: number }
  | { type: 'deplacer'; creneau: Creneau; /** minutes entre le haut du bloc et le pointeur */ prise: number }
  | { type: 'etirer'; creneau: Creneau }

/** Créneau visé par un geste quand le pointeur est sur `jour` à `minute` (non arrondie). */
export function cibleDuGeste(geste: Geste, jour: number, minute: number): Creneau {
  if (geste.type === 'etirer') {
    const { jour_semaine, debut_min } = geste.creneau
    return { jour_semaine, debut_min, fin_min: borner(snap(minute), debut_min + PAS, MINUIT) }
  }
  const duree = geste.type === 'creer' ? geste.duree : geste.creneau.fin_min - geste.creneau.debut_min
  const prise = geste.type === 'creer' ? 0 : geste.prise
  const debut = borner(snap(minute - prise), 0, MINUIT - duree)
  return { jour_semaine: jour, debut_min: debut, fin_min: debut + duree }
}

/** Fenêtre affichée : 06:00–22:00, élargie à l'heure pleine si un bloc en sort (jamais de bloc coupé). */
export function plageAffichee(blocs: Creneau[], debut = 360, fin = 1320) {
  for (const b of blocs) {
    debut = Math.min(debut, Math.floor(b.debut_min / 60) * 60)
    fin = Math.max(fin, Math.ceil(b.fin_min / 60) * 60)
  }
  return { debut, fin }
}
