import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creerSync } from './sync'

/** Faux serveur : chaque envoi reste en attente jusqu'à ce que le test le résolve ou le rejette. */
function banc(delai: number) {
  const etat = new Map<string, string>([['bloc', 'initial']])
  const envois: { etat: string; ok: () => void; ko: () => void }[] = []
  const echecs: unknown[] = []
  const sync = creerSync<string>({
    lire: (cle) => etat.get(cle)!,
    ecrire: (cle, e) => void etat.set(cle, e),
    envoyer: (_cle, e) => new Promise<void>((ok, ko) => envois.push({ etat: e, ok, ko: () => ko(new Error('refus')) })),
    surEchec: (e) => echecs.push(e),
    delai,
  })
  return { etat, envois, echecs, sync }
}

const vider = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})

describe('mise à jour optimiste', () => {
  it('affiche tout de suite, envoie après le délai, regroupe les gestes rapprochés', async () => {
    const { etat, envois, sync } = banc(300)
    sync.appliquer('bloc', 'geste 1')
    expect(etat.get('bloc')).toBe('geste 1') // optimiste
    await vi.advanceTimersByTimeAsync(200)
    sync.appliquer('bloc', 'geste 2')
    await vi.advanceTimersByTimeAsync(299)
    expect(envois).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(envois.map((e) => e.etat)).toEqual(['geste 2']) // un seul envoi : le dernier état
  })

  it('envoie immédiatement sans délai (coches)', async () => {
    const { envois, sync } = banc(0)
    sync.appliquer('bloc', 'coché')
    await vider()
    expect(envois.map((e) => e.etat)).toEqual(['coché'])
  })

  it('revient en arrière et signale l’erreur quand l’API refuse (G05)', async () => {
    const { etat, envois, echecs, sync } = banc(300)
    sync.appliquer('bloc', 'déplacé')
    await vi.advanceTimersByTimeAsync(300)
    envois[0]!.ko()
    await vider()
    expect(etat.get('bloc')).toBe('initial')
    expect(echecs).toHaveLength(1)
  })

  it('revient au dernier état accepté par le serveur, pas à l’état d’origine', async () => {
    const { etat, envois, sync } = banc(0)
    sync.appliquer('bloc', 'accepté')
    await vider()
    envois[0]!.ok()
    await vider()
    sync.appliquer('bloc', 'refusé')
    await vider()
    envois[1]!.ko()
    await vider()
    expect(etat.get('bloc')).toBe('accepté')
  })
})

describe('deux gestes rapides (G06)', () => {
  it('l’échec d’un envoi obsolète n’annule pas le geste plus récent', async () => {
    const { etat, envois, echecs, sync } = banc(0)
    sync.appliquer('bloc', 'geste 1')
    await vider() // envoi 1 parti, sans réponse
    sync.appliquer('bloc', 'geste 2')
    envois[0]!.ko() // la réponse du premier arrive après le second geste
    await vider()
    expect(etat.get('bloc')).toBe('geste 2')
    expect(echecs).toHaveLength(0)
    expect(envois.map((e) => e.etat)).toEqual(['geste 1', 'geste 2']) // le second part ensuite
    envois[1]!.ok()
    await vider()
    expect(etat.get('bloc')).toBe('geste 2')
  })

  it('n’envoie jamais deux requêtes en même temps pour la même clé', async () => {
    const { envois, sync } = banc(0)
    sync.appliquer('bloc', 'geste 1')
    await vider()
    sync.appliquer('bloc', 'geste 2')
    sync.appliquer('bloc', 'geste 3')
    await vider()
    expect(envois).toHaveLength(1) // le premier est encore en vol
    envois[0]!.ok()
    await vider()
    expect(envois.map((e) => e.etat)).toEqual(['geste 1', 'geste 3']) // « geste 2 » était déjà dépassé
  })

  it('les clés sont indépendantes', async () => {
    const { etat, envois, sync } = banc(0)
    etat.set('autre', 'initial')
    sync.appliquer('bloc', 'A')
    sync.appliquer('autre', 'B')
    await vider()
    expect(envois).toHaveLength(2)
    envois[0]!.ko()
    envois[1]!.ok()
    await vider()
    expect(etat.get('bloc')).toBe('initial')
    expect(etat.get('autre')).toBe('B')
  })
})
