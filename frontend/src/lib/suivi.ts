// Règles pures du suivi quotidien. Un suivi tient à (tâche du plan, date), jamais à un bloc de la grille.

export interface Etat {
  fait: boolean
  minutes: number
}

/** Nombre de jours accomplis pour une tâche parmi les dates données (une semaine, un mois…). */
export const joursFaits = (
  suivis: { plan_tache: string; date: string; fait: boolean }[],
  planTache: string,
  dates: string[],
) => suivis.filter((s) => s.plan_tache === planTache && s.fait && dates.includes(s.date)).length

/**
 * État après un clic sur la coche. Avec une cible en minutes, la coche découle de la durée
 * (même règle que le serveur) : cocher inscrit la cible, décocher remet la durée à zéro.
 */
export function apresCoche(etat: Etat, cibleMinutes: number, fait: boolean): Etat {
  if (cibleMinutes <= 0) return { fait, minutes: etat.minutes }
  return fait ? { fait: true, minutes: Math.max(etat.minutes, cibleMinutes) } : { fait: false, minutes: 0 }
}

/** État après saisie d'une durée pour un objectif en minutes. */
export function apresMinutes(saisie: number, cibleMinutes: number): Etat {
  const minutes = Math.min(Math.max(Math.round(saisie) || 0, 0), 1440)
  return { fait: minutes >= cibleMinutes, minutes }
}

/** Tâches regroupées par nom de rubrique (ordre alphabétique), « Sans rubrique » en dernier. */
export function groupesParRubrique<T extends { rubrique_nom_snapshot: string }>(taches: T[]) {
  const groupes = new Map<string, T[]>()
  for (const t of taches) {
    const liste = groupes.get(t.rubrique_nom_snapshot) ?? []
    liste.push(t)
    groupes.set(t.rubrique_nom_snapshot, liste)
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'fr')))
    .map(([rubrique, taches]) => ({ rubrique: rubrique || 'Sans rubrique', taches }))
}
