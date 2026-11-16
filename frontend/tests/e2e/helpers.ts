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
