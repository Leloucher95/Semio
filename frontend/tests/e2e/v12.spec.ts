import { expect, test, type Locator, type Page } from '@playwright/test'
import { creer, inscrire, semaineParApi, session, type Session } from './helpers'

// V1.2 — création rapide dans la grille : cliquer sur une heure, saisir, Entrée.

const blocs = (page: Page) => page.getByTestId('bloc')
const colonne = (page: Page, jour: number) => page.locator(`[data-jour="${jour}"]`)
const champ = (page: Page) => page.getByRole('dialog').getByLabel('Que voulez-vous faire ?')
const membre = (page: Page, nom: string) => page.getByTestId('membre').filter({ hasText: nom })

/** Clique dans une colonne de jour à la minute donnée (grille affichée 06:00–22:00), un peu après le début de la demi-heure. */
async function cliquerA(col: Locator, minute: number, methode: 'click' | 'tap' = 'click') {
  const box = (await col.boundingBox())!
  await col[methode]({ position: { x: box.width / 2, y: ((minute + 8 - 360) / 960) * box.height } })
}

async function compter(page: Page, s: Session, collection: string) {
  const reponse = await page.request.get(`/api/collections/${collection}/records?perPage=1`, { headers: { Authorization: s.token } })
  return (await reponse.json()).totalItems as number
}

test('V1.2 — nouvel utilisateur, bibliothèque vide : une semaine construite sans quitter la page', async ({ page }) => {
  // Aucune boîte native du navigateur ne doit plus apparaître (prompt, confirm).
  const natives: string[] = []
  page.on('dialog', (d) => { natives.push(d.message()); void d.dismiss() })

  await inscrire(page)
  await page.goto('/semaine')
  await expect(page.getByText('Votre semaine commence ici.')).toBeVisible()
  await page.getByRole('button', { name: 'Créer ma semaine type' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Nom')).toHaveValue('Ma semaine') // nom proposé, modifiable
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Semaine type affichée')).toContainText('Ma semaine')

  // Semaine vierge : la grille est là, utilisable, avec les deux actions de démarrage.
  const demarrage = page.getByTestId('demarrage')
  await expect(demarrage).toContainText('Cliquez sur une heure pour ajouter votre première activité, ou créez un objectif sans horaire.')
  await expect(page.locator('.semaine')).toBeVisible()
  await expect(page.locator('.semaine').getByText('06:00')).toBeVisible()

  // Clic sur mardi, vers 18 h : jour et heure déjà renseignés, 60 minutes, champ prêt à écrire.
  await cliquerA(colonne(page, 2), 1080)
  await expect(page.getByTestId('creation-quand')).toHaveText('mardi · 18:00–19:00')
  await expect(champ(page)).toBeFocused()
  await page.keyboard.type('Révisions de maths')
  await expect(page.getByTestId('creation-statut')).toContainText('Nouvelle activité')
  await page.keyboard.press('Enter')

  // Créée, ajoutée à la semaine, placée, confirmée — et la grille est à jour sans rechargement.
  await expect(dialog).toBeHidden()
  await expect(colonne(page, 2).getByTestId('bloc')).toContainText('Révisions de maths')
  await expect(colonne(page, 2).getByTestId('bloc')).toContainText('18:00–19:00')
  await expect(page.getByRole('status')).toContainText('« Révisions de maths » ajoutée : mardi, 18:00–19:00.')
  await expect(membre(page, 'Révisions de maths').getByRole('checkbox')).toBeChecked()
  await expect(demarrage).toHaveCount(0)

  // On enchaîne sur un autre créneau : demi-heure visée par le clic (jeudi 07:30).
  await cliquerA(colonne(page, 4), 450)
  await expect(page.getByTestId('creation-quand')).toHaveText('jeudi · 07:30–08:30')
  await page.keyboard.type('Piano')
  await page.keyboard.press('Enter')
  await expect(colonne(page, 4).getByTestId('bloc')).toContainText('07:30–08:30')
  await expect(blocs(page)).toHaveCount(2)

  // Un nom vide n'enregistre rien ; Échap annule.
  await cliquerA(colonne(page, 6), 600)
  await expect(dialog.getByRole('button', { name: 'Ajouter', exact: true })).toBeDisabled()
  await page.keyboard.type('   ')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(blocs(page)).toHaveCount(2)

  // Tout est côté serveur, et la bibliothèque a été remplie sans avoir été visitée.
  await page.reload()
  await expect(blocs(page)).toHaveCount(2)
  await page.goto('/bibliotheque')
  await expect(page.getByTestId('tache')).toHaveCount(2)
  await expect(page.getByTestId('tache').filter({ hasText: 'Révisions de maths' })).toContainText('Créneau · 1 h')
  expect(natives).toEqual([])
})

test('V1.2 — au clavier : réutiliser une tâche existante sans créer de doublon', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  await semaineParApi(page, s, 1) // École, lundi → vendredi 08:00–16:00
  await page.goto('/semaine')
  await expect(blocs(page)).toHaveCount(5)

  // Tout au clavier : bouton, saisie partielle sans accent, flèche, Entrée (choix), Entrée (ajout).
  await page.getByRole('button', { name: '+ Ajouter une activité' }).focus()
  await page.keyboard.press('Enter')
  await expect(champ(page)).toBeFocused()
  await page.keyboard.type('eco')
  const propositions = page.getByRole('listbox', { name: 'Tâches existantes' })
  await expect(propositions.getByRole('option')).toHaveText(['Écoleréutiliser'])
  await page.keyboard.press('ArrowDown')
  await expect(propositions.getByRole('option', { name: 'École' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(champ(page)).toHaveValue('École')
  await expect(page.getByTestId('creation-statut')).toContainText('Tâche existante « École » : elle sera réutilisée')
  // Durée par défaut de la tâche (8 h) reprise ; lundi 08:00 est déjà pris : refus clair, rien n'est envoyé.
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Déjà occupé de 08:00–16:00 : lundi')
  await page.getByRole('dialog').getByLabel('Jour', { exact: true }).selectOption({ label: 'samedi' })
  await expect(page.getByTestId('creation-apercu')).toContainText('Un créneau de 08:00–16:00 : samedi')
  await champ(page).press('Enter')

  await expect(colonne(page, 6).getByTestId('bloc')).toContainText('École')
  await expect(blocs(page)).toHaveCount(6)
  expect(await compter(page, s, 'taches')).toBe(1)

  // Même nom retapé en entier, sans rien choisir : la tâche existante est réutilisée, pas dupliquée.
  await cliquerA(colonne(page, 7), 600)
  await page.keyboard.type('  école ')
  await expect(page.getByTestId('creation-statut')).toContainText('sera réutilisée')
  await page.keyboard.press('Enter')
  await expect(colonne(page, 7).getByTestId('bloc')).toContainText('École')
  expect(await compter(page, s, 'taches')).toBe(1)
  expect(await compter(page, s, 'modele_taches')).toBe(1)

  // Un nom seulement proche crée bien une nouvelle tâche.
  await cliquerA(colonne(page, 7), 1200)
  await page.keyboard.type('École de musique')
  await expect(page.getByTestId('creation-statut')).toContainText('Nouvelle activité')
  await page.keyboard.press('Enter')
  await expect(blocs(page)).toHaveCount(8)
  expect(await compter(page, s, 'taches')).toBe(2)
})

test('V1.2 — double validation : une seule activité créée', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  await creer(page, s, 'modeles', { nom: 'Ma semaine' })
  await page.goto('/semaine')

  let envois = 0
  await page.route('**/api/semio/quick-add', async (route) => {
    envois++
    await new Promise((r) => setTimeout(r, 600)) // laisse le temps de revalider pendant l'envoi
    await route.continue()
  })
  await cliquerA(colonne(page, 3), 600)
  await page.keyboard.type('Sport')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Ajout…' })).toBeDisabled()
  await page.keyboard.press('Enter')

  await expect(blocs(page)).toHaveCount(1)
  expect(envois).toBe(1)
  expect(await compter(page, s, 'taches')).toBe(1)
  expect(await compter(page, s, 'modele_placements')).toBe(1)
})

test('V1.2 — répétition : aperçu, refus des conflits, tous les créneaux ou aucun', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  await semaineParApi(page, s, 1) // École, lundi → vendredi 08:00–16:00
  await page.goto('/semaine')
  const dialog = page.getByRole('dialog')
  const ajouter = dialog.getByRole('button', { name: 'Ajouter', exact: true })

  // Samedi 10:00, répété du lundi au vendredi : l'école occupe ces jours → rien ne peut partir.
  await cliquerA(colonne(page, 6), 600)
  await page.keyboard.type('Sport')
  await expect(dialog.getByLabel('Uniquement ce jour')).toBeChecked() // choix par défaut
  await dialog.getByLabel('Du lundi au vendredi').check()
  await expect(dialog.getByRole('alert')).toContainText('Déjà occupé de 10:00–11:00 : lundi, mardi, mercredi, jeudi, vendredi')
  await expect(ajouter).toBeDisabled()
  await champ(page).press('Enter')
  await expect(dialog).toBeVisible()
  expect(await compter(page, s, 'taches')).toBe(1)

  // Après l'école : aperçu des cinq jours, puis création des cinq créneaux.
  await dialog.getByLabel('Début').selectOption({ label: '17:00' })
  await expect(page.getByTestId('creation-apercu')).toContainText('5 créneaux de 17:00–18:00 : lundi, mardi, mercredi, jeudi, vendredi')
  await expect(page.getByTestId('creation-quand')).toHaveText('5 jours · 17:00–18:00')
  await ajouter.click()
  await expect(blocs(page).filter({ hasText: 'Sport' })).toHaveCount(5)
  await expect(page.getByRole('status')).toContainText('« Sport » ajoutée : 5 jours, 17:00–18:00.')

  // Tous les jours à 17:00 : désormais en conflit du lundi au vendredi.
  await cliquerA(colonne(page, 7), 1020)
  await page.keyboard.type('Lecture')
  await dialog.getByLabel('Tous les jours').check()
  await expect(dialog.getByRole('alert')).toContainText('lundi, mardi, mercredi, jeudi, vendredi')
  // Jours choisis à la main : samedi et dimanche seulement.
  await dialog.getByLabel('Choisir les jours').check()
  await expect(dialog.getByRole('checkbox', { name: 'dimanche' })).toBeChecked() // le jour cliqué reste coché
  await dialog.getByRole('checkbox', { name: 'samedi' }).check()
  await expect(page.getByTestId('creation-apercu')).toContainText('2 créneaux de 17:00–18:00 : samedi, dimanche')
  await dialog.getByRole('checkbox', { name: 'samedi' }).uncheck()
  await dialog.getByRole('checkbox', { name: 'dimanche' }).uncheck()
  await expect(dialog.getByRole('alert')).toContainText('Choisissez au moins un jour.')
  await dialog.getByRole('checkbox', { name: 'samedi' }).check()
  await dialog.getByRole('checkbox', { name: 'dimanche' }).check()
  await ajouter.click()
  await expect(blocs(page).filter({ hasText: 'Lecture' })).toHaveCount(2)

  // Fin de journée : une durée qui tient avant minuit est proposée, jamais un horaire impossible.
  await cliquerA(colonne(page, 6), 1290) // 21:30, dernière demi-heure affichée
  await dialog.getByLabel('Début').selectOption({ label: '23:30' })
  await expect(dialog.getByLabel('Durée')).toHaveValue('30')
  await expect(page.getByTestId('creation-quand')).toHaveText('samedi · 23:30–24:00')
  await page.keyboard.press('Escape')

  await page.reload()
  await expect(blocs(page)).toHaveCount(12)
})

test('V1.2 — refus ou panne du serveur : message clair, aucun état incohérent', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  const modele = await semaineParApi(page, s, 1)
  await page.goto('/semaine')
  await expect(blocs(page)).toHaveCount(5)
  const dialog = page.getByRole('dialog')

  // Un créneau apparaît côté serveur à l'insu de cette page (autre onglet) : samedi 10:00–11:00.
  const ecole = (await (await page.request.get('/api/collections/taches/records', { headers: { Authorization: s.token } })).json()).items[0].id
  await creer(page, s, 'modele_placements', { modele, tache: ecole, jour_semaine: 6, debut_min: 600, fin_min: 660 })

  // La page croit samedi et dimanche libres : le serveur refuse l'ensemble, dimanche compris.
  await cliquerA(colonne(page, 6), 600)
  await page.keyboard.type('Sport')
  await dialog.getByLabel('Choisir les jours').check()
  await dialog.getByRole('checkbox', { name: 'dimanche' }).check()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('chevauche')
  await expect(dialog).toBeVisible() // la saisie n'est pas perdue
  await expect(champ(page)).toHaveValue('Sport')
  await expect(blocs(page)).toHaveCount(5)
  expect(await compter(page, s, 'taches')).toBe(1) // pas de tâche « Sport » orpheline
  expect(await compter(page, s, 'modele_taches')).toBe(1)
  expect(await compter(page, s, 'modele_placements')).toBe(6) // pas de dimanche partiel

  // Panne (500) : même garantie côté écran.
  await page.route('**/api/semio/quick-add', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"message":"","data":{}}' }))
  await dialog.getByRole('checkbox', { name: 'samedi' }).uncheck()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('rien n’a été créé')
  await expect(blocs(page)).toHaveCount(5)
  await expect(membre(page, 'Sport')).toHaveCount(0)
  await page.unroute('**/api/semio/quick-add')

  // Une fois le serveur revenu, la même saisie aboutit.
  await page.keyboard.press('Enter')
  await expect(colonne(page, 7).getByTestId('bloc')).toContainText('Sport')
  expect(await compter(page, s, 'taches')).toBe(2)
})

test('V1.2 — objectif sans horaire : dans la liste, pas dans la grille', async ({ page }) => {
  await inscrire(page)
  const s = await session(page)
  await creer(page, s, 'modeles', { nom: 'Ma semaine' })
  await creer(page, s, 'rubriques', { nom: 'Personnel', couleur: '#3d6b4f' })
  await page.goto('/semaine')
  const dialog = page.getByRole('dialog')

  await page.getByRole('button', { name: '+ Ajouter un objectif' }).click()
  await expect(dialog.getByLabel('Nom de l’objectif')).toBeFocused()
  await page.keyboard.type('Lire')
  await dialog.getByLabel('Minutes par jour').fill('30')
  await dialog.getByLabel('Jours par semaine').fill('7')
  await dialog.getByLabel('Rubrique').selectOption({ label: 'Personnel' })
  await expect(dialog).toContainText('Objectif : 30 min par jour · tous les jours.')
  await dialog.getByRole('button', { name: 'Ajouter l’objectif' }).click()

  await expect(dialog).toBeHidden()
  await expect(membre(page, 'Lire')).toContainText('30 min par jour · tous les jours · sans horaire')
  await expect(membre(page, 'Lire').getByRole('checkbox')).toBeChecked()
  await expect(blocs(page)).toHaveCount(0) // jamais placé d'office
  await expect(page.getByRole('button', { name: 'Placer Lire' })).toBeVisible() // plaçable plus tard

  // Les deux champs de cible sont facultatifs.
  await page.getByRole('button', { name: '+ Ajouter un objectif' }).click()
  await page.keyboard.type('Exercices')
  await page.keyboard.press('Enter')
  await expect(membre(page, 'Exercices')).toContainText('sans horaire')

  // Le même nom ne crée pas de doublon.
  await page.getByRole('button', { name: '+ Ajouter un objectif' }).click()
  await page.keyboard.type('lire')
  await expect(dialog).toContainText('existe déjà dans votre bibliothèque')
  await page.keyboard.press('Enter')
  expect(await compter(page, s, 'taches')).toBe(2)

  await page.goto('/bibliotheque')
  await expect(page.getByTestId('tache').filter({ hasText: 'Lire' })).toContainText('Objectif · 30 min par jour · tous les jours')
})

test('V1.2 — renommer et supprimer une semaine type sans boîte native du navigateur', async ({ page }) => {
  const natives: string[] = []
  page.on('dialog', (d) => { natives.push(d.message()); void d.dismiss() })
  await inscrire(page)
  await semaineParApi(page, await session(page), 1)
  await page.goto('/semaine')
  const dialog = page.getByRole('dialog')
  const menu = page.getByLabel('Gérer les semaines types')

  await menu.click()
  await page.getByRole('button', { name: 'Renommer' }).click()
  await expect(dialog.getByLabel('Nom')).toHaveValue('Ma semaine')
  await dialog.getByLabel('Nom').fill('Semaine d’école')
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Semaine type affichée')).toContainText('Semaine d’école')

  // Annuler la suppression ne supprime rien.
  await menu.click()
  await page.getByRole('button', { name: 'Supprimer…' }).click()
  const alerte = page.getByRole('alertdialog')
  await expect(alerte).toContainText('Supprimer « Semaine d’école » ?')
  await alerte.getByRole('button', { name: 'Annuler' }).click()
  await expect(blocs(page)).toHaveCount(5)

  await menu.click()
  await page.getByRole('button', { name: 'Supprimer…' }).click()
  await alerte.getByRole('button', { name: 'Supprimer la semaine type' }).click()
  await expect(page.getByText('Votre semaine commence ici.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Créer ma semaine type' })).toBeVisible()
  expect(natives).toEqual([])
})

// Émulation tactile Pixel 7 de Chromium : ne remplace pas un essai au doigt, clavier virtuel compris.
test('V1.2 — téléphone : toucher une heure libre ouvre un formulaire compact @mobile', async ({ page }) => {
  await inscrire(page)
  await page.goto('/semaine')
  await page.getByRole('button', { name: 'Créer ma semaine type' }).tap()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Créer', exact: true }).tap()
  await expect(page.getByTestId('demarrage')).toBeVisible()

  // La grille défile horizontalement ; un toucher dans une zone libre garde le jour et l'heure visés.
  await cliquerA(colonne(page, 1), 540, 'tap')
  await expect(page.getByTestId('creation-quand')).toHaveText('lundi · 09:00–10:00')
  await expect(champ(page)).toBeFocused()

  // Formulaire calé en haut de l'écran (place pour le clavier virtuel), sans défilement horizontal, cibles ≥ 44 px.
  const largeur = page.viewportSize()!.width
  const boite = (await dialog.boundingBox())!
  expect(boite.y).toBeLessThanOrEqual(16)
  expect(boite.x).toBeGreaterThanOrEqual(0)
  expect(boite.x + boite.width).toBeLessThanOrEqual(largeur)
  for (const cible of [dialog.getByRole('button', { name: 'Ajouter', exact: true }), dialog.getByRole('button', { name: 'Annuler' }), champ(page), dialog.getByLabel('Début'), dialog.getByText('Tous les jours')]) {
    const b = (await cible.boundingBox())!
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44)
  }

  await champ(page).fill('Lecture')
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).tap()
  await expect(colonne(page, 1).getByTestId('bloc')).toContainText('09:00–10:00')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  // Toucher un bloc existant le sélectionne toujours (barre d'actions), sans ouvrir la création.
  await colonne(page, 1).getByTestId('bloc').tap()
  await expect(page.getByTestId('barre-bloc')).toContainText('Lecture · lundi 09:00–10:00')
  await expect(dialog).toBeHidden()

  // « Placer » et les deux boutons d'ajout restent disponibles, avec des cibles tactiles suffisantes.
  for (const nom of ['Placer', '+ Ajouter une activité', '+ Ajouter un objectif']) {
    const b = (await page.getByRole('button', { name: nom, exact: true }).boundingBox())!
    expect(b.height, nom).toBeGreaterThanOrEqual(36)
  }
  await page.getByRole('button', { name: '+ Ajouter un objectif' }).tap()
  await dialog.getByLabel('Nom de l’objectif').fill('Exercices')
  await dialog.getByRole('button', { name: 'Ajouter l’objectif' }).tap()
  await expect(membre(page, 'Exercices')).toContainText('sans horaire')
})
