// Formes des enregistrements PocketBase (cf. backend/migrations).

interface Base {
  id: string
  owner: string
}

export type TypeTache = 'creneau' | 'objectif'

export interface Rubrique extends Base {
  nom: string
  couleur: string
  ordre: number
}

export interface Tache extends Base {
  rubrique: string
  nom: string
  type: TypeTache
  couleur: string
  icone: string
  duree_defaut_min: number
  cible_jours_semaine: number
  cible_minutes_par_jour: number
  archivee: boolean
}

export interface Modele extends Base {
  nom: string
}

export interface ModeleTache extends Base {
  modele: string
  tache: string
}

/** Créneau récurrent : jour ISO 1–7, minutes depuis minuit, intervalle [debut, fin). */
export interface Creneau {
  jour_semaine: number
  debut_min: number
  fin_min: number
}

export interface ModelePlacement extends Base, Creneau {
  modele: string
  tache: string
}

export interface PlanMois extends Base {
  annee: number
  mois: number
  modele_source: string
}

export interface PlanTache extends Base {
  plan: string
  tache_source: string
  nom_snapshot: string
  rubrique_nom_snapshot: string
  couleur_snapshot: string
  icone_snapshot: string
  type_snapshot: TypeTache
  cible_jours_semaine_snapshot: number
  cible_minutes_par_jour_snapshot: number
}

export interface PlanPlacement extends Base, Creneau {
  plan: string
  plan_tache: string
}

export interface Suivi extends Base {
  plan: string
  plan_tache: string
  date: string
  fait: boolean
  minutes: number
}
