import { onBeforeUnmount, shallowRef } from 'vue'
import { cibleDuGeste, type Geste } from '../lib/grid'
import type { Creneau } from '../lib/types'

const APPUI_LONG_MS = 200
const SEUIL_SOURIS_PX = 4
const TOLERANCE_APPUI_PX = 10

/**
 * Glisser-déposer de la grille en Pointer Events (souris et tactile identiques).
 * Le DOM n'est jamais modifié ici : on calcule un aperçu, puis `terminer` met à jour le store et Vue redessine.
 * Les colonnes de jour portent `data-jour` ; elles sont retrouvées sous le pointeur par `elementFromPoint`.
 */
export function useGridDrag<Meta>(options: {
  /** Minute (non arrondie) correspondant à `clientY` dans une colonne de jour. */
  minuteEn: (colonne: HTMLElement, clientY: number) => number
  terminer: (meta: Meta, cible: Creneau) => void
}) {
  const apercu = shallowRef<Creneau | null>(null)
  const enCours = shallowRef<Meta | null>(null)
  let nettoyer = () => {}

  function demarrer(e: PointerEvent, geste: Geste, meta: Meta) {
    if (e.button !== 0) return
    nettoyer()
    const origine = { x: e.clientX, y: e.clientY }
    // Au doigt, un appui long distingue le glisser d'un simple toucher.
    let arme = e.pointerType !== 'touch'
    const appuiLong = setTimeout(() => (arme = true), APPUI_LONG_MS)

    const bouger = (ev: PointerEvent) => {
      const distance = Math.hypot(ev.clientX - origine.x, ev.clientY - origine.y)
      if (!arme) {
        if (distance > TOLERANCE_APPUI_PX) nettoyer() // le doigt est parti avant l'appui long
        return
      }
      if (!enCours.value && distance < SEUIL_SOURIS_PX) return // un clic n'est pas un glisser
      enCours.value = meta
      const colonne = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-jour]')
      apercu.value = colonne
        ? cibleDuGeste(geste, Number(colonne.dataset.jour), options.minuteEn(colonne, ev.clientY))
        : null
    }

    const lacher = () => {
      const cible = apercu.value
      const aGlisse = enCours.value !== null
      nettoyer()
      if (!aGlisse) return
      // Le relâchement produit aussi un `click` sur le bloc : il ne doit pas ouvrir son formulaire.
      const avaler = (ev: Event) => ev.stopPropagation()
      document.addEventListener('click', avaler, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', avaler, { capture: true }))
      if (cible) options.terminer(meta, cible)
    }

    const touche = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') nettoyer()
    }

    nettoyer = () => {
      clearTimeout(appuiLong)
      document.removeEventListener('pointermove', bouger)
      document.removeEventListener('pointerup', lacher)
      document.removeEventListener('pointercancel', nettoyer)
      document.removeEventListener('keydown', touche)
      apercu.value = null
      enCours.value = null
      nettoyer = () => {}
    }
    document.addEventListener('pointermove', bouger)
    document.addEventListener('pointerup', lacher)
    document.addEventListener('pointercancel', nettoyer)
    document.addEventListener('keydown', touche)
  }

  onBeforeUnmount(() => nettoyer())

  return { apercu, enCours, demarrer }
}
