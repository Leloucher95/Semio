import PocketBase, { ClientResponseError } from 'pocketbase'

// Même origine : Vite proxifie /api en dev, le binaire Go sert tout en production.
export const pb = new PocketBase('/')
// L'annulation automatique des requêtes « identiques » ferait échouer des coches rapprochées.
pb.autoCancellation(false)

/** Identifiant du compte connecté (les règles serveur exigent owner = session). */
export const owner = () => pb.authStore.record?.id ?? ''

/**
 * Message affichable pour une erreur d'API.
 * Le serveur Semio répond 409/422 avec un message français destiné à l'utilisateur ;
 * les autres erreurs (messages PocketBase en anglais) reçoivent le texte par défaut de l'appelant.
 */
export function messageErreur(e: unknown, defaut: string): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return 'Serveur injoignable. Vérifiez votre connexion.'
    if ((e.status === 409 || e.status === 422) && typeof e.response.message === 'string') return e.response.message
  }
  return defaut
}
