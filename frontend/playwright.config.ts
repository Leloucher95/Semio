import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// Les E2E pilotent le vrai binaire (front embarqué) sur une base jetable vidée par `npm run e2e`.
// Chemin absolu : cmd.exe n'accepte pas `../backend/semio.exe`.
const exe = path.resolve('../backend', process.platform === 'win32' ? 'semio.exe' : 'semio')
const origine = 'http://127.0.0.1:8099'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: 'list',
  fullyParallel: true,
  forbidOnly: true,
  use: {
    baseURL: origine,
    locale: 'fr-FR',
    // Volontairement différent du fuseau des profils : « aujourd'hui » ne doit pas suivre le navigateur.
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `"${exe}" serve --dir .e2e-data --http 127.0.0.1:8099`,
    url: `${origine}/api/health`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
