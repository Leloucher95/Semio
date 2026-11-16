import { describe, expect, it } from 'vitest'
import {
  addDays, daysInMonth, formatMin, isoWeekday, moisLabel, nextMonth, parseMin, prevMonth, todayIn, weekDates, ymd,
} from './dates'

describe('longueur des mois (D01, D02)', () => {
  it('février 2028 a 29 jours, février 2027 en a 28', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2027, 2)).toBe(28)
  })
  it('gère les mois de 30 et 31 jours et les siècles', () => {
    expect(daysInMonth(2027, 1)).toBe(31)
    expect(daysInMonth(2027, 4)).toBe(30)
    expect(daysInMonth(2100, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
  })
})

describe('jour de semaine ISO (D02, D03)', () => {
  it('reconnaît un mois commençant un dimanche', () => {
    expect(isoWeekday(2027, 8, 1)).toBe(7) // 1er août 2027 = dimanche
  })
  it('décale le jour de semaine d’un mois à l’autre', () => {
    expect(isoWeekday(2028, 2, 1)).toBe(2) // mardi
    expect(isoWeekday(2028, 3, 1)).toBe(3) // 29 jours plus tard : mercredi
    expect(isoWeekday(2026, 11, 16)).toBe(1) // lundi
  })
})

describe('aujourd’hui dans le fuseau du profil (D04)', () => {
  const instant = new Date('2026-11-16T23:30:00Z')
  it('ne dépend pas du fuseau du runtime', () => {
    const tzRuntime = process.env.TZ
    for (const tz of ['America/New_York', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = tz
      expect(todayIn('Africa/Porto-Novo', instant)).toBe('2026-11-17') // UTC+1 : déjà demain
    }
    process.env.TZ = tzRuntime
  })
  it('suit le fuseau choisi', () => {
    expect(todayIn('America/New_York', instant)).toBe('2026-11-16')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-11-17')
  })
})

describe('navigation', () => {
  it('passe de décembre à janvier et inversement', () => {
    expect(nextMonth(2027, 12)).toEqual({ annee: 2028, mois: 1 })
    expect(prevMonth(2028, 1)).toEqual({ annee: 2027, mois: 12 })
    expect(nextMonth(2028, 2)).toEqual({ annee: 2028, mois: 3 })
  })
  it('ajoute des jours à travers les mois et les années bissextiles', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2028-01-01', -1)).toBe('2027-12-31')
  })
  it('donne la semaine lundi→dimanche contenant une date', () => {
    expect(weekDates('2028-03-01')).toEqual([
      '2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02', '2028-03-03', '2028-03-04', '2028-03-05',
    ])
    expect(weekDates('2027-08-01')[0]).toBe('2027-07-26') // un dimanche appartient à la semaine qui le précède
  })
})

describe('formats', () => {
  it('formate les dates et les minutes', () => {
    expect(ymd(2028, 2, 5)).toBe('2028-02-05')
    expect(formatMin(480)).toBe('08:00')
    expect(formatMin(1410)).toBe('23:30')
    expect(formatMin(1440)).toBe('24:00')
    expect(parseMin('08:30')).toBe(510)
    expect(moisLabel(2028, 2)).toBe('février 2028')
  })
})
