import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  erreur: boolean
}

export const useToasts = defineStore('toasts', () => {
  const liste = ref<Toast[]>([])
  let suivant = 1

  function push(message: string, erreur = false) {
    const id = suivant++
    liste.value.push({ id, message, erreur })
    // Les erreurs restent plus longtemps : elles signalent un retour arrière à comprendre.
    setTimeout(() => fermer(id), erreur ? 7000 : 3500)
  }
  const ok = (message: string) => push(message)
  const erreur = (message: string) => push(message, true)

  function fermer(id: number) {
    liste.value = liste.value.filter((t) => t.id !== id)
  }

  return { liste, ok, erreur, fermer }
})
