import { describe, expect, it } from 'vitest'
import { cibleDuGeste, collision, overlaps, plageAffichee, snap } from './grid'

const c = (jour_semaine: number, debut_min: number, fin_min: number) => ({ jour_semaine, debut_min, fin_min })

describe('overlaps', () => {
  it('autorise les créneaux adjacents (G01)', () => {
    expect(overlaps(c(1, 480, 540), c(1, 540, 600))).toBe(false)
    expect(overlaps(c(1, 540, 600), c(1, 480, 540))).toBe(false)
  })
  it('refuse les collisions partielles et englobantes (G02)', () => {
    const ecole = c(1, 480, 960)
    expect(overlaps(ecole, c(1, 900, 1020))).toBe(true) // partielle en fin
    expect(overlaps(ecole, c(1, 420, 510))).toBe(true) // partielle en début
    expect(overlaps(ecole, c(1, 420, 1020))).toBe(true) // englobante
    expect(overlaps(ecole, c(1, 600, 660))).toBe(true) // englobée
    expect(overlaps(ecole, c(1, 480, 960))).toBe(true) // identique
  })
  it('ignore les autres jours', () => {
    expect(overlaps(c(1, 480, 960), c(2, 480, 960))).toBe(false)
  })
})

describe('collision', () => {
  const blocs = [{ id: 'a', ...c(1, 480, 960) }, { id: 'b', ...c(1, 960, 1020) }]
  it('ignore le bloc que l’on déplace', () => {
    expect(collision(c(1, 510, 960), blocs, 'a')).toBe(false)
    expect(collision(c(1, 510, 990), blocs, 'a')).toBe(true) // touche b
  })
  it('détecte une collision pour un nouveau bloc', () => {
    expect(collision(c(1, 900, 930), blocs)).toBe(true)
    expect(collision(c(1, 1020, 1080), blocs)).toBe(false)
  })
})

describe('gestes (G04)', () => {
  it('arrondit au pas de 30 minutes', () => {
    expect(snap(494)).toBe(480)
    expect(snap(495)).toBe(510)
    expect(snap(0)).toBe(0)
  })
  it('dépose une tâche : début arrondi, durée conservée, borné à minuit', () => {
    expect(cibleDuGeste({ type: 'creer', duree: 120 }, 3, 487)).toEqual(c(3, 480, 600))
    expect(cibleDuGeste({ type: 'creer', duree: 120 }, 3, 1435)).toEqual(c(3, 1320, 1440))
  })
  it('déplace un bloc en gardant sa durée et la prise du pointeur', () => {
    const geste = { type: 'deplacer' as const, creneau: c(1, 480, 960), prise: 60 }
    expect(cibleDuGeste(geste, 2, 607)).toEqual(c(2, 540, 1020)) // 607 − 60 = 547 → 540
    expect(cibleDuGeste(geste, 2, 20)).toEqual(c(2, 0, 480)) // pas avant minuit
    expect(cibleDuGeste(geste, 2, 1430)).toEqual(c(2, 960, 1440)) // pas après minuit
  })
  it('étire un bloc : au moins 30 minutes, jamais au-delà de minuit, même jour', () => {
    const geste = { type: 'etirer' as const, creneau: c(1, 480, 960) }
    expect(cibleDuGeste(geste, 4, 1012)).toEqual(c(1, 480, 1020))
    expect(cibleDuGeste(geste, 1, 300)).toEqual(c(1, 480, 510))
    expect(cibleDuGeste(geste, 1, 5000)).toEqual(c(1, 480, 1440))
  })
})

describe('plage affichée', () => {
  it('reste 06:00–22:00 par défaut', () => {
    expect(plageAffichee([c(1, 480, 960)])).toEqual({ debut: 360, fin: 1320 })
    expect(plageAffichee([])).toEqual({ debut: 360, fin: 1320 })
  })
  it('s’élargit à l’heure pleine plutôt que de couper un bloc', () => {
    expect(plageAffichee([c(1, 330, 420), c(2, 1260, 1410)])).toEqual({ debut: 300, fin: 1440 })
  })
})
