import { expect, test } from '@playwright/test'
import { appliquer, inscrire, semaineParApi, session } from './helpers'

// Nouveautés V1.1 : elles passent par les mêmes stores que le glisser-déposer et la saisie libre.

test('V1.1 — barre d’actions du bloc : durée, copie vers un autre jour, refus des chevauchements', async ({ page }) => {
  await inscrire(page)
  await semaineParApi(page, await session(page), 1) // École, lundi → vendredi 08:00–16:00
  await page.goto('/semaine')
  const lundi = page.locator('[data-jour="1"]').getByTestId('bloc')
  const barre = page.getByTestId('barre-bloc')
  await expect(barre).toHaveCount(0)

  // Le clic ouvre toujours le formulaire ; une fois fermé, la barre reste sur ce bloc.
  await lundi.click()
  await page.keyboard.press('Escape')
  await expect(barre).toContainText('lundi 08:00–16:00')
  // Mardi à vendredi sont occupés par l'école : seule une copie vers le week-end est possible.
  await expect(barre.getByRole('button', { name: 'Copier vers mardi' })).toBeDisabled()

  const enregistre = page.waitForResponse((r) => r.url().includes('/modele_placements/') && r.request().method() === 'PATCH')
  await barre.getByRole('button', { name: 'Raccourcir de 30 minutes' }).click()
  await expect(lundi).toContainText('08:00–15:30')
  await enregistre
  await barre.getByRole('button', { name: 'Copier vers samedi' }).click()
  await expect(page.locator('[data-jour="6"]').getByTestId('bloc')).toContainText('08:00–15:30')

  await page.reload()
  await expect(lundi).toContainText('08:00–15:30')
  await expect(page.getByTestId('bloc')).toHaveCount(6)
})

test('V1.1 — boutons +15 et −15 : mêmes règles que la saisie libre des minutes', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  // Mois courant dans le fuseau par défaut du profil (Africa/Porto-Novo), pas celui du navigateur de test.
  const [annee, mois] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo' }).format(new Date()).split('-').map(Number)
  await appliquer(page, s, await semaineParApi(page, s, 3), annee!, mois!) // « Objectif 03 » : 30 minutes par jour
  await page.goto('/aujourdhui')
  const ligne = page.getByTestId('suivi').filter({ hasText: 'Objectif 03' })
  const minutes = page.getByLabel('Minutes pour Objectif 03')

  await ligne.getByRole('button', { name: 'Ajouter 15 minutes à Objectif 03' }).click()
  await expect(minutes).toHaveValue('15')
  await expect(ligne.getByRole('checkbox')).not.toBeChecked()
  await ligne.getByRole('button', { name: 'Ajouter 15 minutes à Objectif 03' }).click()
  await expect(ligne.getByRole('checkbox')).toBeChecked() // cible de 30 minutes atteinte
  await ligne.getByRole('button', { name: 'Retirer 15 minutes à Objectif 03' }).click()
  await expect(ligne.getByRole('checkbox')).not.toBeChecked()

  await page.reload()
  await expect(minutes).toHaveValue('15')
})
