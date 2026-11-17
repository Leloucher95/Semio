import { describe, expect, it } from 'vitest'
import { conflits, debutDepuisClic, dureesPossibles, existante, joursPour, suggestions } from './creation'

const taches = [
  { id: 'a', nom: 'Révisions de maths' },
  { id: 'b', nom: 'Mathématiques appliquées' },
  { id: 'c', nom: 'École' },
  { id: 'd', nom: 'Piano' },
]

describe('suggestions de tâches existantes', () => {
  it('ignore la casse et les accents, et classe les débuts de nom en premier', () => {
    expect(suggestions(taches, 'MATH').map((t) => t.id)).toEqual(['b', 'a'])
    expect(suggestions(taches, 'ecole').map((t) => t.id)).toEqual(['c'])
  })
  it('ne propose rien pour une saisie vide ou sans correspondance', () => {
    expect(suggestions(taches, '   ')).toEqual([])
    expect(suggestions(taches, 'natation')).toEqual([])
  })
  it('limite le nombre de propositions', () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => ({ id: String(i), nom: `Sport ${i}` }))
    expect(suggestions(beaucoup, 'sport')).toHaveLength(6)
  })
})

describe('tâche existante de même nom', () => {
  it('retrouve une tâche au nom identique, espaces, casse et accents ignorés', () => {
    expect(existante(taches, '  ecole ')?.id).toBe('c')
    expect(existante(taches, 'École du soir')).toBeUndefined()
    expect(existante(taches, '')).toBeUndefined()
  })
})

describe('heure visée par un clic', () => {
  it('prend la demi-heure dans laquelle tombe le clic', () => {
    expect(debutDepuisClic(1080)).toBe(1080)
    expect(debutDepuisClic(1109.9)).toBe(1080)
    expect(debutDepuisClic(1110)).toBe(1110)
  })
  it('reste dans la journée', () => {
    expect(debutDepuisClic(-12)).toBe(0)
    expect(debutDepuisClic(1439)).toBe(1410)
    expect(debutDepuisClic(2000)).toBe(1410)
  })
})

describe('durées proposées', () => {
  it('propose 60 minutes par défaut quand la journée le permet', () => {
    expect(dureesPossibles(1080).defaut).toBe(60)
    expect(dureesPossibles(1080).liste[0]).toBe(30)
  })
  it('ne propose jamais une fin après minuit', () => {
    expect(dureesPossibles(1410)).toEqual({ liste: [30], defaut: 30 })
    expect(Math.max(...dureesPossibles(1320).liste)).toBe(120)
  })
  it('garde une durée souhaitée si elle tient, sinon la plus longue possible', () => {
    expect(dureesPossibles(480, 480).defaut).toBe(480)
    expect(dureesPossibles(1380, 480).defaut).toBe(60)
  })
})

describe('répétition', () => {
  it('développe chaque choix en jours ISO triés', () => {
    expect(joursPour('jour', 2, [])).toEqual([2])
    expect(joursPour('semaine', 6, [])).toEqual([1, 2, 3, 4, 5])
    expect(joursPour('tous', 2, [])).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(joursPour('choix', 2, [6, 1, 6])).toEqual([1, 6])
  })
})

describe('conflits avant envoi', () => {
  const blocs = [{ id: 'x', jour_semaine: 1, debut_min: 480, fin_min: 960 }]
  it('signale les jours déjà occupés, pas les créneaux adjacents', () => {
    expect(conflits([1, 2], 900, 1020, blocs)).toEqual([1])
    expect(conflits([1, 2], 960, 1020, blocs)).toEqual([])
  })
})
