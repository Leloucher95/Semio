// Présentation des tâches : palette, saisie rapide, libellé des cibles.

/** Couleurs sobres, lisibles avec un texte encre et distinguables en niveaux de gris par leur libellé. */
export const COULEURS = [
  { hex: '#4a6fa5', nom: 'Bleu ardoise' },
  { hex: '#3d6b4f', nom: 'Vert sapin' },
  { hex: '#b4532a', nom: 'Terre cuite' },
  { hex: '#8a6d1f', nom: 'Ocre' },
  { hex: '#7a4e7e', nom: 'Prune' },
  { hex: '#2f7f86', nom: 'Canard' },
  { hex: '#a23a4e', nom: 'Framboise' },
  { hex: '#5d6862', nom: 'Gris galet' },
] as const

export const COULEUR_DEFAUT = COULEURS[0].hex

/** Repère affiché quand une tâche n'a pas d'icône : « Révisions d’anglais » → « RA », « École » → « ÉC ». */
export function initiales(nom: string) {
  const mots = nom.split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 2)
  const lettres = mots.length >= 2 ? mots[0]![0]! + mots[1]![0]! : (mots[0] ?? nom.trim()).slice(0, 2)
  return lettres.toLocaleUpperCase('fr')
}

/** Saisie rapide : une tâche par ligne non vide. */
export const parseLignes = (texte: string) =>
  texte.split(/\r?\n/).map((ligne) => ligne.trim().slice(0, 120)).filter(Boolean)

export function dureeLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** « 2 h par jour · 2 jours par semaine », « tous les jours », ou chaîne vide sans cible. */
export function cibleLabel(joursSemaine: number, minutesParJour: number) {
  const parts: string[] = []
  if (minutesParJour > 0) parts.push(`${dureeLabel(minutesParJour)} par jour`)
  if (joursSemaine >= 7) parts.push('tous les jours')
  else if (joursSemaine > 0) parts.push(`${joursSemaine} jour${joursSemaine > 1 ? 's' : ''} par semaine`)
  return parts.join(' · ')
}
