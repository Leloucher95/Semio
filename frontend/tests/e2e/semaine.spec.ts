import { expect, test, type Locator, type Page } from '@playwright/test'
import { creerModele, creerTache, inscrire } from './helpers'

const blocs = (page: Page) => page.getByTestId('bloc')
const colonne = (page: Page, jour: number) => page.locator(`[data-jour="${jour}"]`)

/** Coordonnées écran d'une minute dans une colonne de jour (grille affichée 06:00–22:00). */
async function point(col: Locator, minute: number) {
  const box = (await col.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + ((minute - 360) / 960) * box.height }
}

async function glisser(page: Page, de: { x: number; y: number }, vers: { x: number; y: number }) {
  await page.mouse.move(de.x, de.y)
  await page.mouse.down()
  await page.mouse.move(vers.x, vers.y, { steps: 8 })
  await page.mouse.up()
}

const patchPlacement = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/modele_placements/') && r.request().method() === 'PATCH')

test('E04 — « Placer » au clavier, puis refus d’un chevauchement', async ({ page }) => {
  await inscrire(page)
  await creerTache(page, { nom: 'École', type: 'creneau', duree: 480 })
  await creerTache(page, { nom: 'Sport', type: 'creneau', duree: 60 })
  await creerModele(page, 'Ma semaine')

  // Tout au clavier : ouvrir, cocher lundi→vendredi, choisir les heures, valider avec Entrée.
  await page.getByRole('button', { name: 'Placer École' }).focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Tâche')).toHaveValue(/.+/) // tâche présélectionnée
  for (const jour of ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']) {
    await dialog.getByRole('checkbox', { name: jour }).focus()
    await page.keyboard.press('Space')
  }
  await dialog.getByLabel('Début').selectOption({ label: '08:00' })
  await dialog.getByLabel('Fin').selectOption({ label: '16:00' })
  await dialog.getByRole('button', { name: 'Placer', exact: true }).focus()
  await page.keyboard.press('Enter')

  await expect(blocs(page)).toHaveCount(5)
  await expect(colonne(page, 1).getByTestId('bloc')).toContainText('08:00–16:00')
  await expect(colonne(page, 6).getByTestId('bloc')).toHaveCount(0)
  await expect(page.getByTestId('membre').filter({ hasText: 'École' }).getByRole('checkbox')).toBeChecked()

  // Un créneau qui chevauche est refusé avec un message clair ; le planning ne bouge pas.
  await page.getByRole('button', { name: 'Placer Sport' }).click()
  await dialog.getByRole('checkbox', { name: 'lundi' }).check({ force: true })
  await dialog.getByLabel('Début').selectOption({ label: '15:00' })
  await dialog.getByLabel('Fin').selectOption({ label: '17:00' })
  await dialog.getByRole('button', { name: 'Placer', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('chevauche')
  await expect(blocs(page)).toHaveCount(5)

  // Adjacent : autorisé (16:00–17:00 juste après l'école).
  await page.getByRole('button', { name: 'Placer Sport' }).click()
  await dialog.getByRole('checkbox', { name: 'lundi' }).check({ force: true })
  await dialog.getByLabel('Début').selectOption({ label: '16:00' })
  await dialog.getByLabel('Fin').selectOption({ label: '17:00' })
  await dialog.getByRole('button', { name: 'Placer', exact: true }).click()
  await expect(blocs(page)).toHaveCount(6)

  // Modifier puis retirer un bloc depuis son formulaire (clavier : Entrée sur le bloc).
  await colonne(page, 1).getByTestId('bloc').filter({ hasText: 'Sport' }).press('Enter')
  await dialog.getByRole('button', { name: 'Retirer du planning' }).click()
  await expect(blocs(page)).toHaveCount(5)

  // Tout est enregistré côté serveur.
  await page.reload()
  await expect(blocs(page)).toHaveCount(5)
})

test('E04 — « Placer » sur petit écran @mobile', async ({ page }) => {
  await inscrire(page)
  await page.goto('/bibliotheque')
  await creerTache(page, { nom: 'Lecture', type: 'objectif', minutes: 120, jours: 2 })
  await creerModele(page, 'Ma semaine')

  const placer = page.getByRole('button', { name: 'Placer Lecture' })
  expect((await placer.boundingBox())!.height).toBeGreaterThanOrEqual(44) // cible tactile
  await placer.tap()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('sam.').tap()
  await dialog.getByLabel('Début').selectOption({ label: '10:00' })
  await dialog.getByLabel('Fin').selectOption({ label: '12:00' })
  await dialog.getByRole('button', { name: 'Placer', exact: true }).tap()
  await expect(blocs(page)).toHaveCount(1)
  await expect(blocs(page)).toContainText('10:00–12:00')
})

test('E03 — glisser à la souris : dépôt, déplacement, étirement, collision annulée', async ({ page }) => {
  await inscrire(page)
  await creerTache(page, { nom: 'École', type: 'creneau', duree: 480 })
  await creerTache(page, { nom: 'Sport', type: 'creneau', duree: 60 })
  await creerModele(page, 'Ma semaine')

  // Dépôt depuis la liste : mardi 10:00, durée par défaut 1 h, arrondi au pas de 30 min.
  const poignee = (await page.getByTestId('membre').filter({ hasText: 'Sport' }).getByTestId('poignee-tache').boundingBox())!
  const depuisListe = { x: poignee.x + poignee.width / 2, y: poignee.y + poignee.height / 2 }
  await page.mouse.move(depuisListe.x, depuisListe.y)
  await page.mouse.down()
  const cible = await point(colonne(page, 2), 607) // 10:07 → 10:00
  await page.mouse.move(cible.x, cible.y, { steps: 8 })
  await expect(page.getByTestId('apercu')).toContainText('10:00–11:00') // fantôme
  await page.mouse.up()
  const sport = colonne(page, 2).getByTestId('bloc')
  await expect(sport).toContainText('Sport')
  await expect(sport).toContainText('10:00–11:00')

  // École lundi 08:00–16:00 par dépôt aussi.
  const poigneeEcole = (await page.getByTestId('membre').filter({ hasText: 'École' }).getByTestId('poignee-tache').boundingBox())!
  await glisser(page, { x: poigneeEcole.x + 10, y: poigneeEcole.y + 10 }, await point(colonne(page, 1), 480))
  await expect(colonne(page, 1).getByTestId('bloc')).toContainText('08:00–16:00')

  // Déplacement : Sport de mardi 10:00 vers mercredi 14:00 (prise au milieu du bloc → début 13:30 + 30).
  let reponse = patchPlacement(page)
  await glisser(page, await point(colonne(page, 2), 630), await point(colonne(page, 3), 870))
  await expect(colonne(page, 3).getByTestId('bloc')).toContainText('14:00–15:00')
  await expect(colonne(page, 2).getByTestId('bloc')).toHaveCount(0)
  expect((await reponse).status()).toBe(200)

  // Étirement par la poignée basse : fin 15:00 → 16:30.
  reponse = patchPlacement(page)
  const bas = (await colonne(page, 3).getByTestId('poignee-etirer').boundingBox())!
  await glisser(page, { x: bas.x + bas.width / 2, y: bas.y + bas.height / 2 }, await point(colonne(page, 3), 990))
  await expect(colonne(page, 3).getByTestId('bloc')).toContainText('14:00–16:30')
  expect((await reponse).status()).toBe(200)

  // Collision : glisser Sport sur École est refusé, le bloc revient à sa place, rien n'est envoyé.
  let envois = 0
  page.on('request', (r) => {
    if (r.url().includes('/modele_placements/') && r.method() === 'PATCH') envois++
  })
  await glisser(page, await point(colonne(page, 3), 900), await point(colonne(page, 1), 600))
  await expect(page.getByRole('status')).toContainText('chevauche')
  await expect(colonne(page, 3).getByTestId('bloc')).toContainText('14:00–16:30')
  await expect(colonne(page, 1).getByTestId('bloc')).toHaveCount(1)
  await page.waitForTimeout(500) // au-delà du délai de regroupement de 300 ms
  expect(envois).toBe(0)

  // Un simple clic n'est pas un glisser : il sélectionne le bloc (barre d'actions) sans le déplacer ni ouvrir son formulaire.
  await colonne(page, 3).getByTestId('bloc').click()
  await expect(page.getByTestId('barre-bloc')).toContainText('mercredi 14:00–16:30')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.waitForTimeout(500)
  expect(envois).toBe(0)
  // Le double-clic ouvre le formulaire du bloc.
  await colonne(page, 3).getByTestId('bloc').dblclick()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.reload()
  await expect(colonne(page, 3).getByTestId('bloc')).toContainText('14:00–16:30')
  await expect(colonne(page, 1).getByTestId('bloc')).toContainText('08:00–16:00')
})
