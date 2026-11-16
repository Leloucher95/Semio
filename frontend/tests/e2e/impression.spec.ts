import { expect, test, type Page } from '@playwright/test'
import { appliquer, inscrire, semaineParApi, session } from './helpers'

// Zone utile d'une feuille A4 paysage avec 10 mm de marge : 277 × 190 mm, soit 1047 × 718 px à 96 ppp.
const FEUILLE = { width: 1047, height: 718 }

async function modeImpression(page: Page) {
  await page.setViewportSize(FEUILLE)
  await page.emulateMedia({ media: 'print' })
}

/**
 * Exporte le PDF comme le ferait « Imprimer » et en lit le nombre de pages et le format.
 * Playwright ne sait exporter un PDF qu'avec Chromium : ailleurs (Firefox), renvoie null et seules
 * les règles d'impression mesurées dans le DOM sont vérifiées.
 */
async function pdf(page: Page) {
  if (page.context().browser()?.browserType().name() !== 'chromium') return null
  const brut = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
  const pages = brut.match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0
  const [, largeur, hauteur] = brut.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/) ?? []
  return { pages, largeur: Number(largeur), hauteur: Number(hauteur) }
}

const sansDebordement = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

async function sansInterface(page: Page) {
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeHidden()
  await expect(page.getByRole('status')).toBeHidden()
}

const lignes = (page: Page) => page.getByTestId('ligne-mois')

test('P01 — semaine A4 paysage : jours, heures et blocs lisibles, aucune interface, une page', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  const modele = await semaineParApi(page, s, 3)
  await appliquer(page, s, modele, 2028, 2)

  for (const [url, titre] of [['/semaine', 'Semaine type — Ma semaine'], ['/planning/2028/2/semaine', 'Semaine — février 2028']] as const) {
    await page.goto(url)
    await expect(page.getByTestId('bloc')).toHaveCount(5)
    await modeImpression(page)

    await sansInterface(page)
    await expect(page.getByRole('heading', { name: 'Tâches' })).toBeHidden() // liste des tâches masquée
    await expect(page.getByRole('heading', { name: titre })).toBeVisible()
    for (const jour of ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']) {
      await expect(page.locator('.semaine').getByText(jour, { exact: true })).toBeVisible()
    }
    await expect(page.locator('.semaine').getByText('06:00')).toBeVisible()
    await expect(page.locator('.semaine').getByText('22:00')).toBeVisible()
    // Chaque bloc porte son nom et ses heures en toutes lettres (pas d'information par la couleur seule).
    for (const bloc of await page.getByTestId('bloc').all()) {
      await expect(bloc).toContainText('École')
      await expect(bloc).toContainText('08:00–16:00')
    }
    await expect(page.getByTestId('poignee-deplacer').first()).toBeHidden()

    // Tout tient dans la feuille : ni débordement horizontal, ni grille plus haute que la zone utile.
    expect(await sansDebordement(page)).toBe(true)
    const grille = (await page.locator('.semaine').boundingBox())!
    expect(grille.y + grille.height).toBeLessThanOrEqual(FEUILLE.height)

    const feuille = await pdf(page)
    if (feuille) {
      expect(feuille.pages).toBe(1)
      expect(Math.round(feuille.largeur)).toBe(842) // A4 paysage : 842 × 595 pt
      expect(Math.round(feuille.hauteur)).toBe(595)
    }
    await page.emulateMedia({ media: 'screen' })
  }
})

test('P02 — suivi du mois : 28, 29, 30 et 31 colonnes, initiales et week-ends corrects', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  const modele = await semaineParApi(page, s, 3)
  const mois = [
    { annee: 2027, mois: 2, jours: 28, premier: 'L', weekends: 8 }, // commence un lundi
    { annee: 2028, mois: 2, jours: 29, premier: 'M', weekends: 8 }, // bissextile, commence un mardi
    { annee: 2028, mois: 4, jours: 30, premier: 'S', weekends: 10 }, // commence un samedi
    { annee: 2027, mois: 8, jours: 31, premier: 'D', weekends: 9 }, // commence un dimanche
  ]
  for (const m of mois) await appliquer(page, s, modele, m.annee, m.mois)

  for (const m of mois) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ media: 'screen' })
    await page.goto(`/planning/${m.annee}/${m.mois}`)
    await expect(lignes(page)).toHaveCount(3)
    await modeImpression(page)

    const colonnes = page.locator('thead .mois-jour')
    await expect(colonnes).toHaveCount(m.jours)
    await expect(colonnes.first()).toContainText(m.premier)
    await expect(colonnes.first()).toContainText('1')
    await expect(colonnes.last()).toContainText(String(m.jours))
    await expect(page.locator('thead .mois-weekend')).toHaveCount(m.weekends)
    await expect(lignes(page).first().locator('.mois-case')).toHaveCount(m.jours)

    // Le tableau est un rectangle : les titres de rubrique ne dépassent pas des lignes de tâches.
    const rubrique = (await page.locator('.mois-rubrique').first().boundingBox())!
    const derniereCase = (await lignes(page).first().locator('.mois-case').last().boundingBox())!
    expect(Math.abs(rubrique.x + rubrique.width - (derniereCase.x + derniereCase.width))).toBeLessThanOrEqual(1)

    await sansInterface(page)
    expect(await sansDebordement(page)).toBe(true)
    expect((await pdf(page))?.pages ?? 1).toBe(1)
  }
})

test('P03 — 12 tâches sur 31 jours : une page lisible ; 16 : encore une page ; 30 : paginé, rien de masqué', async ({ page }) => {
  test.setTimeout(120_000)
  await inscrire(page)
  const s = await session(page)

  // Trois semaines types de tailles différentes, appliquées à trois mois de 31 jours.
  const cas = [
    { taches: 12, annee: 2027, mois: 8 },
    { taches: 16, annee: 2027, mois: 10 },
    { taches: 30, annee: 2027, mois: 12 },
  ]
  for (const c of cas) {
    // Un modèle par cas : les rubriques sont recréées, ce qui ne gêne pas (regroupement par nom dans le plan).
    await appliquer(page, s, await semaineParApi(page, s, c.taches), c.annee, c.mois)
  }

  for (const c of cas) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ media: 'screen' })
    await page.goto(`/planning/${c.annee}/${c.mois}`)
    await expect(lignes(page)).toHaveCount(c.taches)
    // L'avertissement de pagination n'apparaît qu'au-delà du seuil d'une page.
    await expect(page.getByTestId('avis-pages')).toHaveCount(c.taches > 16 ? 1 : 0)
    await modeImpression(page)

    // Aucune ligne masquée ou tronquée, quelle que soit la taille.
    for (const ligne of await lignes(page).all()) await expect(ligne).toBeVisible()
    await expect(page.getByText('Objectif ' + String(c.taches).padStart(2, '0'))).toBeVisible()
    await expect(page.locator('thead .mois-jour')).toHaveCount(31)
    expect(await sansDebordement(page)).toBe(true)

    // Lisibilité mesurée : lignes d'au moins 8 mm (30 px), cases d'au moins 6 mm de large, texte ≥ 8 pt.
    const mesure = await lignes(page).first().evaluate((tr) => {
      const coche = tr.querySelector('.mois-case')!.getBoundingClientRect()
      return { hauteur: tr.getBoundingClientRect().height, largeurCase: coche.width, police: parseFloat(getComputedStyle(tr).fontSize) }
    })
    expect(mesure.hauteur).toBeGreaterThanOrEqual(30)
    expect(mesure.largeurCase).toBeGreaterThanOrEqual(22)
    expect(mesure.police).toBeGreaterThanOrEqual(10.6)

    const feuille = await pdf(page)
    if (feuille && c.taches <= 16) expect(feuille.pages, `${c.taches} tâches`).toBe(1)
    if (feuille && c.taches > 16) expect(feuille.pages, `${c.taches} tâches`).toBeGreaterThan(1)
  }
})

test('P04 — « Version vierge » n’imprime pas les coches enregistrées', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  await appliquer(page, s, await semaineParApi(page, s, 3), 2028, 2)
  await page.goto('/planning/2028/2')

  const ecole = page.getByRole('button', { name: 'École, mardi 1', exact: true })
  const objectif = page.getByRole('button', { name: 'Objectif 03, mercredi 2', exact: true })
  await ecole.click()
  await objectif.click()
  await expect(ecole).toHaveText('✓')
  await expect(objectif).toHaveText('✓')

  // État actuel : les coches s'impriment.
  await modeImpression(page)
  await expect(ecole).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Suivi — février 2028' })).toBeVisible()

  // Version vierge : les cases restent, vides ; l'écran ne change pas.
  await page.emulateMedia({ media: 'screen' })
  await page.getByLabel('Version vierge').check()
  await expect(ecole).toBeVisible()
  await modeImpression(page)
  await expect(ecole).toBeHidden()
  await expect(objectif).toBeHidden()
  await expect(page.locator('.mois-coche:visible')).toHaveCount(0)
  await expect(lignes(page).first().locator('.mois-case')).toHaveCount(29) // les cases à cocher au stylo sont là
  expect((await pdf(page))?.pages ?? 1).toBe(1)

  // Rien n'a été effacé côté serveur.
  await page.emulateMedia({ media: 'screen' })
  await page.reload()
  await expect(ecole).toHaveText('✓')
})
