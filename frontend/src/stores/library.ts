import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { owner, pb } from '../lib/pb'
import type { Rubrique, Tache } from '../lib/types'

export type TacheSaisie = Omit<Tache, 'id' | 'owner' | 'archivee'>

/** Bibliothèque : rubriques et tâches réutilisables. Reflète l'état du serveur. */
export const useLibrary = defineStore('library', () => {
  const rubriques = ref<Rubrique[]>([])
  const taches = ref<Tache[]>([])
  const charge = ref(false)

  const actives = computed(() => taches.value.filter((t) => !t.archivee))
  const archivees = computed(() => taches.value.filter((t) => t.archivee))
  const tacheParId = computed(() => new Map(taches.value.map((t) => [t.id, t])))
  const rubriqueParId = computed(() => new Map(rubriques.value.map((r) => [r.id, r])))

  async function load() {
    const [r, t] = await Promise.all([
      pb.collection('rubriques').getFullList<Rubrique>({ sort: 'ordre,created' }),
      pb.collection('taches').getFullList<Tache>({ sort: 'created' }),
    ])
    rubriques.value = r
    taches.value = t
    charge.value = true
  }

  const remplacer = <T extends { id: string }>(liste: T[], item: T) =>
    liste.some((x) => x.id === item.id) ? liste.map((x) => (x.id === item.id ? item : x)) : [...liste, item]

  /** Verse dans la bibliothèque une tâche créée ailleurs (création rapide depuis la semaine type). */
  const integrer = (tache: Tache) => {
    taches.value = remplacer(taches.value, tache)
  }

  async function saveRubrique(data: { nom: string; couleur: string }, id?: string) {
    const rec = id
      ? await pb.collection('rubriques').update<Rubrique>(id, data)
      : await pb.collection('rubriques').create<Rubrique>({ ...data, ordre: rubriques.value.length, owner: owner() })
    rubriques.value = remplacer(rubriques.value, rec)
  }

  async function removeRubrique(id: string) {
    await pb.collection('rubriques').delete(id)
    rubriques.value = rubriques.value.filter((r) => r.id !== id)
    // Le serveur détache la rubrique des tâches (relation facultative).
    taches.value = taches.value.map((t) => (t.rubrique === id ? { ...t, rubrique: '' } : t))
  }

  async function saveTache(data: Partial<TacheSaisie> & { archivee?: boolean }, id?: string) {
    const rec = id
      ? await pb.collection('taches').update<Tache>(id, data)
      : await pb.collection('taches').create<Tache>({ ...data, owner: owner() })
    taches.value = remplacer(taches.value, rec)
    return rec
  }

  /** Suppression définitive ; le serveur la refuse si un modèle utilise encore la tâche. */
  async function removeTache(id: string) {
    await pb.collection('taches').delete(id)
    taches.value = taches.value.filter((t) => t.id !== id)
  }

  /** Saisie rapide : une tâche par nom ; renvoie le nombre réellement créé. */
  async function quickAdd(noms: string[], defauts: Omit<TacheSaisie, 'nom'>) {
    let crees = 0
    for (const nom of noms) {
      try {
        await saveTache({ ...defauts, nom })
      } catch {
        break // l'appelant compare au nombre demandé et garde les lignes restantes
      }
      crees++
    }
    return crees
  }

  return {
    rubriques, taches, charge, actives, archivees, tacheParId, rubriqueParId,
    load, integrer, saveRubrique, removeRubrique, saveTache, removeTache, quickAdd,
  }
})
