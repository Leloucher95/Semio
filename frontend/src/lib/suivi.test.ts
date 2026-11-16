import { describe, expect, it } from 'vitest'
import { apresCoche, apresMinutes, groupesParRubrique, joursFaits } from './suivi'

const suivi = (plan_tache: string, date: string, fait: boolean, minutes = 0) => ({ plan_tache, date, fait, minutes })

describe('jours accomplis dans la semaine (T03)', () => {
  const semaine = ['2028-02-07', '2028-02-08', '2028-02-09', '2028-02-10', '2028-02-11', '2028-02-12', '2028-02-13']
  it('compte les dates différentes cochées, pour la bonne tâche', () => {
    const suivis = [
      suivi('lecture', '2028-02-08', true, 120),
      suivi('lecture', '2028-02-10', false, 119), // insuffisant
      suivi('lecture', '2028-02-12', true, 130),
      suivi('lecture', '2028-02-14', true, 120), // semaine suivante
      suivi('exercices', '2028-02-09', true),
    ]
    expect(joursFaits(suivis, 'lecture', semaine)).toBe(2)
    expect(joursFaits(suivis, 'exercices', semaine)).toBe(1)
    expect(joursFaits(suivis, 'ecole', semaine)).toBe(0)
  })
})

describe('coche (T02 côté écran)', () => {
  it('sans cible en minutes : la coche est manuelle, les minutes ne bougent pas', () => {
    expect(apresCoche({ fait: false, minutes: 0 }, 0, true)).toEqual({ fait: true, minutes: 0 })
    expect(apresCoche({ fait: true, minutes: 0 }, 0, false)).toEqual({ fait: false, minutes: 0 })
  })
  it('avec cible : cocher inscrit la cible, décocher remet à zéro', () => {
    expect(apresCoche({ fait: false, minutes: 45 }, 120, true)).toEqual({ fait: true, minutes: 120 })
    expect(apresCoche({ fait: true, minutes: 150 }, 120, true)).toEqual({ fait: true, minutes: 150 }) // garde le surplus
    expect(apresCoche({ fait: true, minutes: 120 }, 120, false)).toEqual({ fait: false, minutes: 0 })
  })
  it('saisie de minutes : atteint à 120, pas à 119, bornée à la journée', () => {
    expect(apresMinutes(119, 120)).toEqual({ fait: false, minutes: 119 })
    expect(apresMinutes(120, 120)).toEqual({ fait: true, minutes: 120 })
    expect(apresMinutes(5000, 120)).toEqual({ fait: true, minutes: 1440 })
    expect(apresMinutes(-10, 120)).toEqual({ fait: false, minutes: 0 })
    expect(apresMinutes(Number.NaN, 120)).toEqual({ fait: false, minutes: 0 })
  })
})

describe('regroupement par rubrique', () => {
  it('trie les rubriques, garde l’ordre des tâches, place « Sans rubrique » en dernier', () => {
    const taches = [
      { id: '1', rubrique_nom_snapshot: 'Personnel' },
      { id: '2', rubrique_nom_snapshot: '' },
      { id: '3', rubrique_nom_snapshot: 'Études' },
      { id: '4', rubrique_nom_snapshot: 'Personnel' },
    ]
    expect(groupesParRubrique(taches).map((g) => [g.rubrique, g.taches.map((t) => t.id)])).toEqual([
      ['Études', ['3']],
      ['Personnel', ['1', '4']],
      ['Sans rubrique', ['2']],
    ])
  })
})
