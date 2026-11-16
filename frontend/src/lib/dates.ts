// Calendrier civil pur : dates en texte YYYY-MM-DD, jamais en datetime UTC.
// Tous les calculs passent par Date.UTC pour ne pas dépendre du fuseau du navigateur.

const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (annee: number, mois: number, jour: number) => `${annee}-${pad(mois)}-${pad(jour)}`

export function parseYmd(date: string) {
  const [annee = 0, mois = 0, jour = 0] = date.split('-').map(Number)
  return { annee, mois, jour }
}

export const daysInMonth = (annee: number, mois: number) => new Date(Date.UTC(annee, mois, 0)).getUTCDate()

/** Jour ISO : 1 = lundi … 7 = dimanche. */
export const isoWeekday = (annee: number, mois: number, jour: number) =>
  new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() || 7

export function addDays(date: string, n: number) {
  const { annee, mois, jour } = parseYmd(date)
  const d = new Date(Date.UTC(annee, mois - 1, jour + n))
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Les 7 dates (lundi → dimanche) de la semaine contenant `date`. */
export function weekDates(date: string) {
  const { annee, mois, jour } = parseYmd(date)
  const lundi = addDays(date, 1 - isoWeekday(annee, mois, jour))
  return Array.from({ length: 7 }, (_, i) => addDays(lundi, i))
}

export const nextMonth = (annee: number, mois: number) =>
  mois === 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: mois + 1 }

export const prevMonth = (annee: number, mois: number) =>
  mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 }

/** Date locale du jour dans le fuseau IANA du profil (pas celui du navigateur). */
export function todayIn(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export const formatMin = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

export function parseMin(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const fr = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options })

export const moisLabel = (annee: number, mois: number) =>
  fr({ month: 'long', year: 'numeric' }).format(new Date(Date.UTC(annee, mois - 1, 1)))

/** Noms des mois, janvier en premier. */
export const MOIS = Array.from({ length: 12 }, (_, i) => fr({ month: 'long' }).format(new Date(Date.UTC(2024, i, 1))))

/** « lundi 16 novembre 2026 » */
export function dateLabel(date: string) {
  const { annee, mois, jour } = parseYmd(date)
  return fr({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(annee, mois - 1, jour)))
}

// 2024-01-01 est un lundi : sert d'ancre pour les libellés de jours ISO 1–7.
const jourNom = (iso: number, weekday: 'long' | 'short' | 'narrow') =>
  fr({ weekday }).format(new Date(Date.UTC(2024, 0, iso)))

export const JOURS = [1, 2, 3, 4, 5, 6, 7].map((iso) => ({
  iso,
  long: jourNom(iso, 'long'),
  court: jourNom(iso, 'short'),
  initiale: jourNom(iso, 'narrow'),
}))
