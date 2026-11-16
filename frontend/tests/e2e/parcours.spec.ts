import { expect, test, type Page } from '@playwright/test'
import { creerModele, creerRubrique, creerTache, inscrire } from './helpers'

const lignes = (page: Page) => page.getByTestId('ligne-mois')
const caseDu = (page: Page, tache: string, jour: string) => page.getByRole('button', { name: `${tache}, ${jour}`, exact: true })

/** Semaine type de référence : École lundi→vendredi 08:00–16:00, Lecture et Exercices sans horaire. */
async function semaineDeReference(page: Page) {
  await creerRubrique(page, 'Études')
  await creerRubrique(page, 'Personnel')
  await creerTache(page, { nom: 'École', type: 'creneau', duree: 480, rubrique: 'Études' })
  await creerTache(page, { nom: 'Lecture', type: 'objectif', minutes: 120, jours: 2, rubrique: 'Personnel' })
  await creerTache(page, { nom: 'Exercices', type: 'objectif', jours: 7, rubrique: 'Personnel' })
  await creerModele(page, 'Ma semaine')
  // Les objectifs entrent dans le modèle sans créneau.
  await page.getByTestId('membre').filter({ hasText: 'Lecture' }).getByRole('checkbox').check()
  await page.getByTestId('membre').filter({ hasText: 'Exercices' }).getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Placer École' }).click()
  const dialog = page.getByRole('dialog')
  for (const jour of ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']) await dialog.getByRole('checkbox', { name: jour }).check({ force: true })
  await dialog.getByLabel('Début').selectOption({ label: '08:00' })
  await dialog.getByLabel('Fin').selectOption({ label: '16:00' })
  await dialog.getByRole('button', { name: 'Placer', exact: true }).click()
  await expect(page.getByTestId('bloc')).toHaveCount(5)
}

async function appliquerA(page: Page, mois: string, annee: number) {
  await page.goto('/semaine')
  await page.getByRole('button', { name: 'Appliquer à un mois' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Mois').selectOption({ label: mois })
  await dialog.getByLabel('Année').fill(String(annee))
  await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click()
}

test('E01 — inscription → tâches → semaine type → février 2028 → suivi → historique figé → duplication', async ({ page, browser }) => {
  test.setTimeout(90_000)
  await inscrire(page)
  await semaineDeReference(page)

  // 5. Appliquer à février 2028 (bissextile : 29 colonnes), objectifs non placés compris.
  await appliquerA(page, 'février', 2028)
  await expect(page).toHaveURL(/\/planning\/2028\/2$/)
  await expect(page.getByTestId('mois-titre')).toHaveText('février 2028')
  await expect(lignes(page)).toHaveCount(3)
  await expect(page.locator('thead .mois-jour')).toHaveCount(29)
  await expect(lignes(page).filter({ hasText: 'Lecture' })).toContainText('2 h par jour · 2 jours par semaine')

  // Cocher « Exercices » le 1er dans la vue Mois.
  await caseDu(page, 'Exercices', 'mardi 1').click()
  await expect(caseDu(page, 'Exercices', 'mardi 1')).toHaveText('✓')

  // Saisir 120 minutes de « Lecture » le 2 dans la vue du jour.
  await page.getByRole('link', { name: 'mercredi 2', exact: true }).click()
  await expect(page.getByTestId('jour-titre')).toHaveText('mercredi 2 février 2028')
  const lecture = page.getByTestId('suivi').filter({ hasText: 'Lecture' })
  await expect(lecture.getByTestId('semaine')).toHaveText('0/2 jours cette semaine')
  await lecture.getByLabel('Minutes pour Lecture').fill('119')
  await lecture.getByLabel('Minutes pour Lecture').blur()
  await expect(lecture.getByRole('checkbox')).not.toBeChecked() // 119 < 120
  await lecture.getByLabel('Minutes pour Lecture').fill('120')
  await lecture.getByLabel('Minutes pour Lecture').blur()
  await expect(lecture.getByRole('checkbox')).toBeChecked()
  await expect(lecture.getByTestId('semaine')).toHaveText('1/2 jours cette semaine')
  // École a un créneau le mercredi : elle figure au programme avec son horaire.
  await expect(page.getByTestId('suivi').filter({ hasText: 'École' })).toContainText('08:00–16:00')

  // La progression est enregistrée et visible dans le mois.
  await page.goto('/planning/2028/2')
  await expect(caseDu(page, 'Lecture', 'mercredi 2')).toHaveText('✓')
  await expect(caseDu(page, 'Exercices', 'mardi 1')).toHaveText('✓')

  // 6. Modifier la bibliothèque puis le modèle : février 2028 garde ses valeurs copiées.
  await page.goto('/bibliotheque')
  await page.getByRole('button', { name: 'Modifier Lecture' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nom').fill('Lecture du soir')
  await dialog.getByLabel('Minutes par jour').fill('30')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByTestId('tache').filter({ hasText: 'Lecture du soir' })).toBeVisible()
  await page.goto('/semaine')
  await page.locator('[data-jour="1"]').getByTestId('bloc').click()
  await page.getByTestId('barre-bloc').getByRole('button', { name: 'Modifier…' }).click()
  await dialog.getByRole('button', { name: 'Retirer du planning' }).click()
  await expect(page.getByTestId('bloc')).toHaveCount(4)

  await page.goto('/planning/2028/2')
  await expect(lignes(page).filter({ hasText: 'Lecture du soir' })).toHaveCount(0)
  await expect(lignes(page).filter({ hasText: 'Lecture' })).toContainText('2 h par jour · 2 jours par semaine')
  await page.getByRole('link', { name: 'Grille de la semaine' }).click()
  await expect(page.getByTestId('bloc')).toHaveCount(5) // le lundi retiré du modèle est toujours là en février

  // 7. Dupliquer février vers mars : mêmes tâches et créneaux, suivi vierge.
  await page.goto('/planning/2028/2')
  await page.getByRole('button', { name: 'Dupliquer vers mars 2028' }).click()
  await expect(page).toHaveURL(/\/planning\/2028\/3$/)
  await expect(page.getByTestId('mois-titre')).toHaveText('mars 2028')
  await expect(lignes(page)).toHaveCount(3)
  await expect(page.locator('thead .mois-jour')).toHaveCount(31)
  await expect(page.locator('.mois-coche', { hasText: '✓' })).toHaveCount(0)
  await caseDu(page, 'Exercices', 'mercredi 1').click() // un suivi en mars, pour vérifier qu'il survit au conflit
  await expect(caseDu(page, 'Exercices', 'mercredi 1')).toHaveText('✓')

  // 8. Seconde tentative : conflit explicite, mars intact.
  await page.goto('/planning/2028/2')
  await page.getByRole('button', { name: 'Dupliquer vers mars 2028' }).click()
  await expect(page.getByRole('status')).toContainText('mars 2028 existe déjà')
  await expect(page).toHaveURL(/\/planning\/2028\/2$/)
  await page.goto('/planning/2028/3')
  await expect(caseDu(page, 'Exercices', 'mercredi 1')).toHaveText('✓')
  await page.getByRole('link', { name: 'Grille de la semaine' }).click()
  await expect(page.getByTestId('bloc')).toHaveCount(5)

  // Appliquer la semaine type sur un mois existant : refus affiché dans la boîte de dialogue.
  await appliquerA(page, 'mars', 2028)
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('mars 2028 existe déjà')

  // 10. Un autre compte ne voit rien de tout cela.
  const b = await (await browser.newContext()).newPage()
  await inscrire(b)
  await b.goto('/planning/2028/2')
  await expect(b.getByText('Pas encore de planning pour février 2028.')).toBeVisible()
  await expect(b.getByText('École')).toHaveCount(0)
})

test('E02 — Aujourd’hui sur téléphone : coche, minutes, navigation, annulation si le serveur refuse @mobile', async ({ page }) => {
  test.setTimeout(90_000)
  await inscrire(page)
  await page.goto('/bibliotheque')
  await creerTache(page, { nom: 'Lecture', type: 'objectif', minutes: 120, jours: 2 })
  await creerTache(page, { nom: 'Exercices', type: 'objectif', jours: 7 })
  await creerModele(page, 'Ma semaine')
  await page.getByTestId('membre').filter({ hasText: 'Lecture' }).getByRole('checkbox').check()
  await page.getByTestId('membre').filter({ hasText: 'Exercices' }).getByRole('checkbox').check()
  // Le mois proposé par défaut est le mois courant du profil.
  await page.getByRole('button', { name: 'Appliquer à un mois' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer', exact: true }).tap()
  await expect(page).toHaveURL(/\/planning\/\d+\/\d+$/)

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Aujourd’hui' }).tap()
  const exercices = page.getByTestId('suivi').filter({ hasText: 'Exercices' })
  const lecture = page.getByTestId('suivi').filter({ hasText: 'Lecture' })
  await expect(page.getByText('0 sur 2 accomplie')).toBeVisible()

  // Lisible à ~400 px : pas de défilement horizontal, case à cocher d'au moins 44 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const cible = (await exercices.locator('label').first().boundingBox())!
  expect(Math.min(cible.width, cible.height)).toBeGreaterThanOrEqual(44)

  // Coche : enregistrée immédiatement, retrouvée après rechargement.
  await exercices.getByRole('checkbox').tap()
  await expect(exercices.getByRole('checkbox')).toBeChecked()
  await expect(page.getByText('1 sur 2 accomplie')).toBeVisible()

  // Minutes : 60 ne suffit pas, 120 atteint l'objectif.
  await lecture.getByLabel('Minutes pour Lecture').fill('60')
  await lecture.getByLabel('Minutes pour Lecture').blur()
  await expect(lecture.getByRole('checkbox')).not.toBeChecked()
  await lecture.getByLabel('Minutes pour Lecture').fill('120')
  await lecture.getByLabel('Minutes pour Lecture').blur()
  await expect(lecture.getByRole('checkbox')).toBeChecked()

  await page.reload()
  await expect(exercices.getByRole('checkbox')).toBeChecked()
  await expect(lecture.getByLabel('Minutes pour Lecture')).toHaveValue('120')

  // Erreur d'API : la coche revient en arrière et un message l'explique.
  await page.route('**/api/collections/suivis/records/**', (route) =>
    route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 500, body: '{}' }))
  await exercices.getByRole('checkbox').tap()
  await expect(page.getByRole('status')).toContainText('la modification a été annulée')
  await expect(exercices.getByRole('checkbox')).toBeChecked()
  await page.unroute('**/api/collections/suivis/records/**')

  // Navigation d'un jour à l'autre, puis retour.
  const titre = await page.getByTestId('jour-titre').textContent()
  await page.getByRole('link', { name: 'Jour précédent' }).tap()
  await expect(page.getByTestId('jour-titre')).not.toHaveText(titre!)
  await page.getByRole('link', { name: 'Revenir à aujourd’hui' }).tap()
  await expect(page.getByTestId('jour-titre')).toHaveText(titre!)
  await expect(exercices.getByRole('checkbox')).toBeChecked()
})

test('« Aujourd’hui » suit le fuseau du profil, pas celui du navigateur', async ({ page }) => {
  // 16 novembre 2026, 23:30 UTC : déjà le 17 à Porto-Novo (UTC+1), encore le 16 à New York (fuseau du navigateur de test).
  await page.clock.setFixedTime(new Date('2026-11-16T23:30:00Z'))
  await inscrire(page)
  await page.goto('/aujourdhui')
  await expect(page.getByTestId('jour-titre')).toHaveText('mardi 17 novembre 2026')

  await page.goto('/profil')
  await page.getByLabel('Fuseau horaire').selectOption('America/New_York')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('status')).toContainText('Fuseau horaire enregistré')
  await page.goto('/aujourdhui')
  await expect(page.getByTestId('jour-titre')).toHaveText('lundi 16 novembre 2026')
})
