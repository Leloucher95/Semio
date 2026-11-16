import { expect, test } from '@playwright/test'
import { inscrire } from './helpers'

// Ces tests visent le binaire final lancé par playwright.config.ts : front embarqué (embed.FS) et repli SPA.

test('O01/E05 — le binaire sert le front embarqué sur « / » et sur les routes profondes', async ({ request }) => {
  for (const url of ['/', '/connexion', '/planning/2028/2', '/planning/2028/2/semaine', '/jour/2028-02-02', '/semaine']) {
    const reponse = await request.get(url)
    expect(reponse.status(), url).toBe(200)
    expect(reponse.headers()['content-type'], url).toContain('text/html')
    expect(await reponse.text(), url).toContain('<div id="app">')
  }

  // Les ressources du build sont bien dans le binaire (script principal référencé par index.html).
  const [, script] = (await (await request.get('/')).text()).match(/src="(\/assets\/[^"]+\.js)"/) ?? []
  expect(script).toBeTruthy()
  const js = await request.get(script!)
  expect(js.status()).toBe(200)
  expect(js.headers()['content-type']).toContain('javascript')

  // Le repli SPA n'avale pas l'API : une route d'API inconnue reste une erreur JSON.
  expect((await request.get('/api/health')).status()).toBe(200)
  const inconnue = await request.get('/api/route-inexistante')
  expect(inconnue.status()).toBe(404)
  expect(inconnue.headers()['content-type']).toContain('application/json')
})

test('E05 — recharger une route profonde garde la page et la session', async ({ page }) => {
  await inscrire(page)
  await page.goto('/planning/2028/2')
  await expect(page.getByTestId('mois-titre')).toHaveText('février 2028')
  await page.reload()
  await expect(page).toHaveURL(/\/planning\/2028\/2$/)
  await expect(page.getByTestId('mois-titre')).toHaveText('février 2028')

  // Une adresse de mois invalide ramène au mois courant au lieu d'une page cassée.
  await page.goto('/planning/2028/13')
  await expect(page).toHaveURL(/\/planning\/\d{4}\/\d{1,2}$/)
  await expect(page).not.toHaveURL(/\/13$/)
})

test('l’API d’administration est fermée aux invités et aux utilisateurs', async ({ page, request }) => {
  await inscrire(page)
  const { token } = JSON.parse((await page.evaluate(() => localStorage.getItem('pocketbase_auth')))!)
  for (const url of ['/api/collections', '/api/settings', '/api/backups', '/api/logs', '/api/collections/_superusers/records']) {
    expect([401, 403], `invité ${url}`).toContain((await request.get(url)).status())
    expect([401, 403], `utilisateur ${url}`).toContain((await request.get(url, { headers: { Authorization: token } })).status())
  }
})
