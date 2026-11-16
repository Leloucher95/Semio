import { ref, type Ref } from 'vue'
import { collision } from '../lib/grid'
import { messageErreur, owner, pb } from '../lib/pb'
import { creerSync } from '../lib/sync'
import type { Creneau } from '../lib/types'
import { useToasts } from './toasts'

const COLLISION = 'Ce créneau chevauche un autre créneau du même jour : rien n’a été modifié.'

/**
 * Créneaux d'un parent (modèle ou plan mensuel) : même comportement pour les deux grilles.
 * Les déplacements sont optimistes, regroupés sur 300 ms, annulés si le serveur refuse.
 */
export function usePlacements<T extends Creneau & { id: string }>(
  collection: 'modele_placements' | 'plan_placements',
  parent: 'modele' | 'plan',
) {
  const toasts = useToasts()
  const liste = ref([]) as Ref<T[]>
  let parentId = ''

  async function charger(id: string) {
    parentId = id
    liste.value = id
      ? await pb.collection(collection).getFullList<T>({ filter: pb.filter(`${parent} = {:id}`, { id }) })
      : []
  }

  const trouver = (id: string) => liste.value.find((p) => p.id === id)

  const sync = creerSync<Creneau>({
    lire: (id) => {
      const { jour_semaine, debut_min, fin_min } = trouver(id) as T
      return { jour_semaine, debut_min, fin_min }
    },
    ecrire: (id, creneau) => {
      const p = trouver(id)
      if (p) Object.assign(p, creneau)
    },
    envoyer: (id, creneau) => pb.collection(collection).update(id, creneau),
    surEchec: (e) => toasts.erreur(messageErreur(e, 'Le déplacement n’a pas pu être enregistré : le bloc est revenu à sa place.')),
    delai: 300,
  })

  /** Déplace ou étire un bloc ; refusé sans rien changer en cas de chevauchement. */
  function deplacer(id: string, cible: Creneau) {
    if (!trouver(id)) return
    if (collision(cible, liste.value, id)) return toasts.erreur(COLLISION)
    sync.appliquer(id, cible)
  }

  /** Crée un bloc par créneau pour la référence donnée (tâche ou tâche du plan). Tout ou rien côté écran. */
  async function placer(reference: Record<string, string>, creneaux: Creneau[]) {
    if (creneaux.some((c) => collision(c, liste.value))) return toasts.erreur(COLLISION)
    try {
      for (const c of creneaux) {
        liste.value.push(await pb.collection(collection).create<T>({ ...reference, ...c, [parent]: parentId, owner: owner() }))
      }
    } catch (e) {
      toasts.erreur(messageErreur(e, 'Le créneau n’a pas pu être enregistré.'))
    }
  }

  async function retirer(id: string) {
    try {
      await pb.collection(collection).delete(id)
      liste.value = liste.value.filter((p) => p.id !== id)
    } catch (e) {
      toasts.erreur(messageErreur(e, 'Le créneau n’a pas pu être retiré.'))
    }
  }

  return { liste, charger, placer, deplacer, retirer }
}
