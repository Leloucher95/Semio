import { defineStore } from 'pinia'
import { ref } from 'vue'
import { messageErreur, owner, pb } from '../lib/pb'
import { apresCoche, apresMinutes, type Etat } from '../lib/suivi'
import { creerSync } from '../lib/sync'
import type { PlanMois, PlanPlacement, PlanTache, Suivi } from '../lib/types'
import { usePlacements } from './placements'
import { useToasts } from './toasts'

/** Plan d'un mois : instantané indépendant du modèle (tâches, créneaux) et son suivi quotidien. */
export const usePlan = defineStore('plan', () => {
  const toasts = useToasts()
  const plan = ref<PlanMois | null>(null)
  const taches = ref<PlanTache[]>([])
  const suivis = ref<Suivi[]>([])
  const placements = usePlacements<PlanPlacement>('plan_placements', 'plan')
  /** Mois actuellement chargé (« 2028-2 »), vide pendant un chargement. */
  const moisCharge = ref('')

  async function load(annee: number, mois: number) {
    const cle = `${annee}-${mois}`
    if (moisCharge.value === cle) return
    moisCharge.value = ''
    const { items } = await pb.collection('plans_mois').getList<PlanMois>(1, 1, {
      filter: pb.filter('annee = {:annee} && mois = {:mois}', { annee, mois }),
    })
    plan.value = items[0] ?? null
    const id = plan.value?.id ?? ''
    const filter = pb.filter('plan = {:id}', { id })
    const [t, s] = await Promise.all([
      id ? pb.collection('plan_taches').getFullList<PlanTache>({ filter, sort: 'created' }) : [],
      id ? pb.collection('suivis').getFullList<Suivi>({ filter }) : [],
      placements.charger(id),
    ])
    taches.value = t
    suivis.value = s
    moisCharge.value = cle
  }

  // Créer ou supprimer un plan invalide le mois chargé : le prochain `load` relit le serveur.

  /** Applique une semaine type à un mois (transaction serveur ; conflit si le mois existe). */
  async function appliquer(modele: string, annee: number, mois: number) {
    await pb.send('/api/semio/apply-template', { method: 'POST', body: { modele, annee, mois } })
    moisCharge.value = ''
  }

  /** Duplique le mois chargé vers le mois suivant, sans le suivi. */
  async function dupliquer() {
    await pb.send('/api/semio/duplicate-month', { method: 'POST', body: { plan: plan.value?.id } })
    moisCharge.value = ''
  }

  async function supprimer() {
    if (!plan.value) return
    await pb.collection('plans_mois').delete(plan.value.id)
    moisCharge.value = ''
  }

  // --- Suivi : coches et minutes, optimistes, envoi immédiat, annulés si le serveur refuse.
  const cleDe = (planTache: string, date: string) => `${planTache}|${date}`
  const suiviDe = (planTache: string, date: string) =>
    suivis.value.find((s) => s.plan_tache === planTache && s.date === date)
  const etatDe = (planTache: string, date: string): Etat => {
    const s = suiviDe(planTache, date)
    return { fait: s?.fait ?? false, minutes: s?.minutes ?? 0 }
  }

  const sync = creerSync<Etat>({
    lire: (cle) => etatDe(...(cle.split('|') as [string, string])),
    ecrire: (cle, etat) => {
      const [plan_tache, date] = cle.split('|') as [string, string]
      const s = suiviDe(plan_tache, date)
      if (s) Object.assign(s, etat)
      // Pas encore d'enregistrement serveur : id vide jusqu'à la création.
      else suivis.value.push({ id: '', owner: owner(), plan: plan.value?.id ?? '', plan_tache, date, ...etat })
    },
    envoyer: async (cle, etat) => {
      const [plan_tache, date] = cle.split('|') as [string, string]
      const s = suiviDe(plan_tache, date)
      if (!s) return
      if (s.id) await pb.collection('suivis').update(s.id, etat)
      else s.id = (await pb.collection('suivis').create<Suivi>({ ...etat, plan_tache, date, plan: s.plan, owner: s.owner })).id
    },
    surEchec: (e) => toasts.erreur(messageErreur(e, 'Le suivi n’a pas pu être enregistré : la modification a été annulée.')),
    delai: 0,
  })

  const cocher = (t: PlanTache, date: string, fait: boolean) =>
    sync.appliquer(cleDe(t.id, date), apresCoche(etatDe(t.id, date), t.cible_minutes_par_jour_snapshot, fait))

  const saisirMinutes = (t: PlanTache, date: string, minutes: number) =>
    sync.appliquer(cleDe(t.id, date), apresMinutes(minutes, t.cible_minutes_par_jour_snapshot))

  return {
    plan, taches, suivis, moisCharge,
    placements: placements.liste,
    load, appliquer, dupliquer, supprimer, etatDe, cocher, saisirMinutes,
    placer: placements.placer, deplacer: placements.deplacer, retirer: placements.retirer,
  }
})
