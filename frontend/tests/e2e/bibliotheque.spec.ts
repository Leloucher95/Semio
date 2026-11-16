import { expect, test } from '@playwright/test'
import { connecter, creerRubrique, creerTache, inscrire } from './helpers'

test('inscription, rubriques, tâches, saisie rapide, puis reconnexion', async ({ page }) => {
  const email = await inscrire(page)

  await creerRubrique(page, 'Études')
  await creerTache(page, { nom: 'École', type: 'creneau', duree: 480, rubrique: 'Études' })
  await creerTache(page, { nom: 'Lecture', type: 'objectif', jours: 2, minutes: 120 })
  await expect(page.getByTestId('tache').filter({ hasText: 'École' })).toContainText('Créneau · 8 h')
  await expect(page.getByTestId('tache').filter({ hasText: 'Lecture' })).toContainText('2 h par jour · 2 jours par semaine')

  // Saisie rapide : une tâche par ligne non vide.
  await page.getByLabel('Une tâche par ligne').fill('Exercices\n\n  Révisions  ')
  await page.getByRole('button', { name: 'Ajouter 2 tâches' }).click()
  await expect(page.getByTestId('tache')).toHaveCount(4)
  await expect(page.getByLabel('Une tâche par ligne')).toHaveValue('')

  // Archiver retire la tâche de la liste active sans la détruire.
  await page.getByRole('button', { name: 'Archiver Révisions' }).click()
  await expect(page.getByTestId('tache')).toHaveCount(3)
  await page.getByRole('button', { name: /Afficher les tâches archivées \(1\)/ }).click()
  await expect(page.getByText('Révisions')).toBeVisible()

  // Déconnexion puis reconnexion : les données sont celles du serveur.
  await page.goto('/profil')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/connexion/)
  await page.goto('/bibliotheque')
  await expect(page).toHaveURL(/connexion/) // route protégée
  await connecter(page, email)
  await page.goto('/bibliotheque')
  await expect(page.getByTestId('tache')).toHaveCount(3)
})

test('un second compte ne voit rien du premier', async ({ browser }) => {
  const a = await browser.newPage()
  await inscrire(a)
  await creerRubrique(a, 'Privé de A')
  await creerTache(a, { nom: 'Secret de A', type: 'objectif' })

  const b = await (await browser.newContext()).newPage()
  await inscrire(b)
  await b.goto('/bibliotheque')
  await expect(b.getByText('Aucune tâche pour l’instant.')).toBeVisible()
  await expect(b.getByText('Secret de A')).toHaveCount(0)
  await expect(b.getByText('Privé de A')).toHaveCount(0)
})

test('mauvais mot de passe : message clair, pas de session', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('inconnu@semio.test')
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Adresse e-mail ou mot de passe incorrect.')
  await expect(page).toHaveURL(/connexion/)
})
