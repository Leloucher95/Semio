// Mise à jour optimiste : l'écran change tout de suite, le serveur suit, on revient en arrière s'il refuse.
// Sert aux déplacements de blocs (délai 300 ms) comme aux coches (envoi immédiat).

interface Options<E> {
  lire: (cle: string) => E
  ecrire: (cle: string, etat: E) => void
  envoyer: (cle: string, etat: E) => Promise<unknown>
  surEchec: (erreur: unknown) => void
  /** Attente avant envoi, pour regrouper des gestes rapprochés. 0 = immédiat. */
  delai: number
}

export function creerSync<E>({ lire, ecrire, envoyer, surEchec, delai }: Options<E>) {
  const confirme = new Map<string, E>() // dernier état accepté par le serveur
  const version = new Map<string, number>() // numéro du dernier geste, par clé
  const file = new Map<string, Promise<void>>() // un seul envoi à la fois par clé
  const minuteurs = new Map<string, ReturnType<typeof setTimeout>>()

  function appliquer(cle: string, etat: E) {
    if (!confirme.has(cle)) confirme.set(cle, lire(cle))
    ecrire(cle, etat)
    const v = (version.get(cle) ?? 0) + 1
    version.set(cle, v)
    const dernier = () => version.get(cle) === v

    const partir = () => {
      const tache = (file.get(cle) ?? Promise.resolve()).then(async () => {
        if (!dernier()) return // dépassé avant même d'être envoyé
        try {
          await envoyer(cle, etat)
          confirme.set(cle, etat)
        } catch (erreur) {
          // Une réponse obsolète ne gagne pas : seul l'échec du geste le plus récent annule l'affichage.
          if (dernier()) {
            ecrire(cle, confirme.get(cle) as E)
            surEchec(erreur)
          }
        }
        // Plus rien en attente : le prochain geste relira l'état courant comme référence.
        if (dernier()) {
          confirme.delete(cle)
          file.delete(cle)
        }
      })
      file.set(cle, tache)
    }

    clearTimeout(minuteurs.get(cle))
    if (delai > 0) minuteurs.set(cle, setTimeout(partir, delai))
    else partir()
  }

  return { appliquer }
}
