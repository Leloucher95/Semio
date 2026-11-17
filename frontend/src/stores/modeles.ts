import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { owner, pb } from '../lib/pb'
import type { Creneau, Modele, ModelePlacement, ModeleTache, Tache } from '../lib/types'
import { usePlacements } from './placements'

/** Semaines types : un modèle = des tâches membres (objectifs compris) + des créneaux par jour de semaine. */
export const useModeles = defineStore('modeles', () => {
  const modeles = ref<Modele[]>([])
  const courantId = ref('')
  const membres = ref<ModeleTache[]>([])
  const placements = usePlacements<ModelePlacement>('modele_placements', 'modele')
  const charge = ref(false)

  const courant = computed(() => modeles.value.find((m) => m.id === courantId.value))
  const estMembre = (tache: string) => membres.value.some((m) => m.tache === tache)

  async function load() {
    modeles.value = await pb.collection('modeles').getFullList<Modele>({ sort: 'created' })
    await ouvrir(courant.value?.id ?? modeles.value[0]?.id ?? '')
    charge.value = true
  }

  async function ouvrir(id: string) {
    courantId.value = id
    const [m] = await Promise.all([
      id
        ? pb.collection('modele_taches').getFullList<ModeleTache>({ filter: pb.filter('modele = {:id}', { id }), sort: 'created' })
        : Promise.resolve([]),
      placements.charger(id),
    ])
    membres.value = m
  }

  async function creer(nom: string) {
    const modele = await pb.collection('modeles').create<Modele>({ nom, owner: owner() })
    modeles.value.push(modele)
    await ouvrir(modele.id)
  }

  async function renommer(nom: string) {
    const modele = await pb.collection('modeles').update<Modele>(courantId.value, { nom })
    modeles.value = modeles.value.map((m) => (m.id === modele.id ? modele : m))
  }

  async function supprimer() {
    await pb.collection('modeles').delete(courantId.value)
    modeles.value = modeles.value.filter((m) => m.id !== courantId.value)
    await ouvrir(modeles.value[0]?.id ?? '')
  }

  /** Ajoute la tâche au modèle si elle n'y est pas (le serveur exige l'adhésion avant tout créneau). */
  async function assurerMembre(tache: string) {
    if (estMembre(tache)) return
    membres.value.push(
      await pb.collection('modele_taches').create<ModeleTache>({ modele: courantId.value, tache, owner: owner() }),
    )
  }

  /** Retire la tâche du modèle ; le serveur retire ses créneaux de ce modèle. */
  async function retirerMembre(tache: string) {
    const membre = membres.value.find((m) => m.tache === tache)
    if (!membre) return
    await pb.collection('modele_taches').delete(membre.id)
    membres.value = membres.value.filter((m) => m.id !== membre.id)
    placements.liste.value = placements.liste.value.filter((p) => p.tache !== tache)
  }

  /**
   * Création rapide : tâche (nouvelle ou existante), adhésion au modèle et créneaux en une seule transaction serveur.
   * En cas de refus rien n'est créé et l'état local ne bouge pas. Renvoie la tâche, à verser dans la bibliothèque.
   */
  async function ajoutRapide(corps: {
    tache?: string
    nouvelle?: Partial<Pick<Tache, 'nom' | 'type' | 'rubrique' | 'couleur' | 'duree_defaut_min' | 'cible_jours_semaine' | 'cible_minutes_par_jour'>>
    creneaux: Creneau[]
  }) {
    const reponse = await pb.send<{ tache: Tache; membre: ModeleTache; placements: ModelePlacement[] }>(
      '/api/semio/quick-add', { method: 'POST', body: { modele: courantId.value, ...corps } },
    )
    if (!estMembre(reponse.tache.id)) membres.value.push(reponse.membre)
    placements.liste.value.push(...reponse.placements)
    return reponse.tache
  }

  return {
    modeles, courantId, courant, membres, charge, estMembre,
    placements: placements.liste,
    load, ouvrir, creer, renommer, supprimer, assurerMembre, retirerMembre, ajoutRapide,
    placer: placements.placer, deplacer: placements.deplacer, retirer: placements.retirer,
  }
})
