import { expect, type Page } from '@playwright/test'

export const MOT_DE_PASSE = 'motdepasse-1234'

/** Adresse unique : chaque test a son propre compte, donc ses propres données. */
export const emailUnique = () => `u${Date.now()}${Math.random().toString(36).slice(2, 8)}@semio.test`

export async function inscrire(page: Page, email = emailUnique()) {
  await page.goto('/connexion')
  await page.getByRole('button', { name: 'Pas encore de compte ? S’inscrire' }).click()
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page).not.toHaveURL(/connexion/)
  return email
}

export async function connecter(page: Page, email: string) {
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).not.toHaveURL(/connexion/)
}

export async function creerRubrique(page: Page, nom: string) {
  await page.goto('/bibliotheque')
  await page.getByRole('button', { name: 'Nouvelle rubrique' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill(nom)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: nom })).toBeVisible()
}

interface TacheE2E {
  nom: string
  type: 'creneau' | 'objectif'
  rubrique?: string
  duree?: number
  jours?: number
  minutes?: number
}

export async function creerTache(page: Page, t: TacheE2E) {
  if (!page.url().endsWith('/bibliotheque')) await page.goto('/bibliotheque')
  await page.getByRole('button', { name: 'Nouvelle tâche' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill(t.nom)
  await dialog.getByLabel(t.type === 'creneau' ? 'Créneau horaire' : 'Objectif à suivre').check()
  if (t.duree !== undefined) await dialog.getByLabel('Durée par défaut (minutes)').fill(String(t.duree))
  if (t.jours !== undefined) await dialog.getByLabel('Jours par semaine').fill(String(t.jours))
  if (t.minutes !== undefined) await dialog.getByLabel('Minutes par jour').fill(String(t.minutes))
  if (t.rubrique) await dialog.getByLabel('Rubrique').selectOption({ label: t.rubrique })
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByTestId('tache').filter({ hasText: t.nom })).toBeVisible()
}

export async function creerModele(page: Page, nom: string) {
  await page.goto('/semaine')
  page.once('dialog', (d) => d.accept(nom))
  await page.getByRole('button', { name: 'Créer ma semaine type' }).click()
  await expect(page.getByLabel('Semaine type affichée')).toContainText(nom)
}

// --- Préparation de données par l'API (mêmes règles serveur que l'interface), pour les tests qui n'évaluent pas la saisie.

export interface Session {
  token: string
  id: string
}

export async function session(page: Page): Promise<Session> {
  const brut = await page.evaluate(() => localStorage.getItem('pocketbase_auth'))
  const { token, record } = JSON.parse(brut!)
  return { token, id: record.id }
}

export async function creer(page: Page, s: Session, collection: string, data: Record<string, unknown>): Promise<string> {
  const reponse = await page.request.post(`/api/collections/${collection}/records`, {
    headers: { Authorization: s.token },
    data: { owner: s.id, ...data },
  })
  expect(reponse.ok(), `${collection} : ${await reponse.text()}`).toBeTruthy()
  return (await reponse.json()).id
}

export async function appliquer(page: Page, s: Session, modele: string, annee: number, mois: number) {
  const reponse = await page.request.post('/api/semio/apply-template', {
    headers: { Authorization: s.token },
    data: { modele, annee, mois },
  })
  expect(reponse.ok(), await reponse.text()).toBeTruthy()
}

/**
 * Semaine type de référence avec `nbTaches` tâches : « École » (lundi→vendredi 08:00–16:00, rubrique Études)
 * et des objectifs répartis entre Études et Personnel. Renvoie l'id du modèle.
 */
export async function semaineParApi(page: Page, s: Session, nbTaches: number) {
  const etudes = await creer(page, s, 'rubriques', { nom: 'Études', couleur: '#4a6fa5' })
  const personnel = await creer(page, s, 'rubriques', { nom: 'Personnel', couleur: '#3d6b4f' })
  const modele = await creer(page, s, 'modeles', { nom: 'Ma semaine' })
  const ecole = await creer(page, s, 'taches', { nom: 'École', type: 'creneau', couleur: '#4a6fa5', duree_defaut_min: 480, rubrique: etudes })
  await creer(page, s, 'modele_taches', { modele, tache: ecole })
  for (let jour = 1; jour <= 5; jour++) {
    await creer(page, s, 'modele_placements', { modele, tache: ecole, jour_semaine: jour, debut_min: 480, fin_min: 960 })
  }
  for (let i = 2; i <= nbTaches; i++) {
    const tache = await creer(page, s, 'taches', {
      nom: `Objectif ${String(i).padStart(2, '0')}`, type: 'objectif', couleur: '#3d6b4f',
      cible_jours_semaine: (i % 7) + 1, cible_minutes_par_jour: i % 3 === 0 ? 30 : 0, rubrique: i % 2 ? personnel : etudes,
    })
    await creer(page, s, 'modele_taches', { modele, tache })
  }
  return modele
}
