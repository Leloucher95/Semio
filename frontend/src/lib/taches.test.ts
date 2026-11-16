import { describe, expect, it } from 'vitest'
import { cibleLabel, dureeLabel, initiales, parseLignes } from './taches'

describe('saisie rapide', () => {
  it('crée une tâche par ligne non vide, espaces retirés', () => {
    expect(parseLignes('École\n  Lecture  \r\n\n\nExercices\n   ')).toEqual(['École', 'Lecture', 'Exercices'])
  })
  it('ne renvoie rien pour un texte vide', () => {
    expect(parseLignes('  \n \n')).toEqual([])
  })
})

describe('libellés', () => {
  it('formate les durées', () => {
    expect(dureeLabel(30)).toBe('30 min')
    expect(dureeLabel(120)).toBe('2 h')
    expect(dureeLabel(90)).toBe('1 h 30')
  })
  it('décrit les cibles combinées', () => {
    expect(cibleLabel(2, 120)).toBe('2 h par jour · 2 jours par semaine')
    expect(cibleLabel(7, 0)).toBe('tous les jours')
    expect(cibleLabel(1, 0)).toBe('1 jour par semaine')
    expect(cibleLabel(0, 0)).toBe('')
  })
})

describe('initiales', () => {
  it('prend la première lettre des deux premiers mots porteurs de sens', () => {
    expect(initiales('Révisions d’anglais')).toBe('RA')
    expect(initiales('Lecture du soir')).toBe('LS')
  })
  it('prend deux lettres d’un nom d’un seul mot, accents compris', () => {
    expect(initiales('École')).toBe('ÉC')
    expect(initiales('  ')).toBe('')
  })
})
