<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { addDays, dateLabel, formatMin, isoWeekday, JOURS, moisLabel, parseYmd, todayIn, weekDates } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { joursFaits } from '../lib/suivi'
import { COULEUR_DEFAUT, dureeLabel } from '../lib/taches'
import type { PlanTache } from '../lib/types'
import { useAuth } from '../stores/auth'
import { usePlan } from '../stores/plan'

const props = defineProps<{ date?: string }>()
const auth = useAuth()
const store = usePlan()

// « Aujourd'hui » suit le fuseau du profil, pas celui du téléphone.
const aujourdhui = computed(() => todayIn(auth.timezone))
const jour = computed(() => (props.date && /^\d{4}-\d{2}-\d{2}$/.test(props.date) ? props.date : aujourdhui.value))
const mois = computed(() => parseYmd(jour.value))
const charge = computed(() => store.moisCharge === `${mois.value.annee}-${mois.value.mois}`)
const erreur = ref('')

watch(() => [mois.value.annee, mois.value.mois] as const, async ([annee, m]) => {
  erreur.value = ''
  try {
    await store.load(annee, m)
  } catch (e) {
    erreur.value = messageErreur(e, 'Le planning n’a pas pu être chargé.')
  }
}, { immediate: true })

const lienJour = (date: string) => (date === aujourdhui.value ? '/aujourdhui' : `/jour/${date}`)
const semaine = computed(() => weekDates(jour.value))

/** Tâches à suivre un jour donné : celles qui ont un créneau ce jour de semaine, puis les objectifs. */
function lignesDu(date: string) {
  const d = parseYmd(date)
  const iso = isoWeekday(d.annee, d.mois, d.jour)
  const duJour = store.placements.filter((p) => p.jour_semaine === iso).sort((a, b) => a.debut_min - b.debut_min)
  return store.taches
    .map((t) => {
      const creneaux = duJour.filter((p) => p.plan_tache === t.id)
      return {
        t,
        debut: creneaux[0]?.debut_min ?? Infinity,
        horaires: creneaux.map((p) => `${formatMin(p.debut_min)}–${formatMin(p.fin_min)}`),
        etat: store.etatDe(t.id, date),
      }
    })
    .filter((l) => l.horaires.length || l.t.type_snapshot === 'objectif')
    .sort((a, b) => a.debut - b.debut)
}

const lignes = computed(() => lignesDu(jour.value))
const faites = computed(() => lignes.value.filter((l) => l.etat.fait).length)
const sections = computed(() => [
  { id: 'programme', titre: 'Au programme', lignes: lignes.value.filter((l) => l.horaires.length) },
  { id: 'objectifs', titre: 'Objectifs', lignes: lignes.value.filter((l) => !l.horaires.length) },
].filter((s) => s.lignes.length))

// shortcut: la semaine ne compte que les jours du mois affiché (le suivi appartient à un plan mensuel) ;
// agréger deux plans si les semaines à cheval sur deux mois deviennent gênantes.
const cetteSemaine = (t: PlanTache) => joursFaits(store.suivis, t.id, semaine.value)

/** Bandeau de la semaine : une jauge par jour du mois chargé, rien pour les jours d'un autre mois. */
const bandeau = computed(() =>
  semaine.value.map((date, i) => {
    const d = parseYmd(date)
    const duMois = d.annee === mois.value.annee && d.mois === mois.value.mois && !!store.plan
    const du = duMois ? lignesDu(date) : []
    const fait = du.filter((l) => l.etat.fait).length
    return {
      date, n: d.jour, initiale: JOURS[i]!.initiale, weekend: i >= 5,
      ratio: du.length ? fait / du.length : 0,
      label: `${JOURS[i]!.long} ${d.jour}${duMois && du.length ? `, ${fait} sur ${du.length}` : ''}`,
    }
  }),
)

const ajouter = (t: PlanTache, minutes: number, delta: number) => store.saisirMinutes(t, jour.value, minutes + delta)
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="flex items-end justify-between gap-2">
      <div class="min-w-0">
        <p class="eyebrow">{{ jour === aujourdhui ? 'Aujourd’hui' : 'Suivi du jour' }}</p>
        <h1 class="mt-1 text-[1.75rem] leading-9 first-letter:uppercase sm:text-[2rem]" data-testid="jour-titre">{{ dateLabel(jour) }}</h1>
      </div>
      <nav class="flex shrink-0 gap-1" aria-label="Changer de jour">
        <RouterLink class="btn w-11 px-0" :to="lienJour(addDays(jour, -1))" aria-label="Jour précédent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5" /></svg>
        </RouterLink>
        <RouterLink class="btn w-11 px-0" :to="lienJour(addDays(jour, 1))" aria-label="Jour suivant">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5" /></svg>
        </RouterLink>
      </nav>
    </div>

    <nav class="mt-3 grid grid-cols-7 gap-1" aria-label="Jours de la semaine">
      <RouterLink
        v-for="b in bandeau" :key="b.date" :to="lienJour(b.date)" :aria-label="b.label"
        :aria-current="b.date === jour ? 'date' : undefined"
        class="flex min-h-16 flex-col items-center gap-0.5 rounded border pt-1.5 pb-2"
        :class="b.date === jour ? 'border-ink bg-ink text-paper' : [b.date === aujourdhui ? 'border-accent' : 'border-transparent', b.weekend ? 'bg-paper-deep' : '']"
      >
        <span class="text-[0.6875rem] leading-[0.875rem] font-semibold tracking-[0.08em] uppercase opacity-75">{{ b.initiale }}</span>
        <span class="font-serif text-xl leading-6 tabular-nums">{{ b.n }}</span>
        <span class="block h-[3px] w-5 overflow-hidden rounded-xs bg-line-strong/35" aria-hidden="true">
          <span class="block h-full" :class="b.date === jour ? 'bg-paper' : 'bg-ok'" :style="{ width: `${b.ratio * 100}%` }" />
        </span>
      </RouterLink>
    </nav>
    <RouterLink v-if="jour !== aujourdhui" class="btn btn-quiet mt-1 px-0 text-accent underline underline-offset-4 hover:bg-transparent" to="/aujourdhui">Revenir à aujourd’hui</RouterLink>

    <p v-if="erreur" class="message-erreur mt-6" role="alert">{{ erreur }}</p>
    <p v-else-if="!charge" class="mt-6 text-ink-soft">Chargement…</p>

    <div v-else-if="!store.plan" class="vide">
      <p class="vide-titre">Pas de planning pour {{ moisLabel(mois.annee, mois.mois) }}.</p>
      <p class="mt-2 text-ink-soft">Appliquez une semaine type à ce mois pour commencer le suivi.</p>
      <RouterLink class="btn btn-primary mt-4" :to="`/planning/${mois.annee}/${mois.mois}`">Préparer ce mois</RouterLink>
    </div>

    <template v-else>
      <div class="mt-3 border-b border-ink pb-3">
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-sm text-ink-soft" aria-live="polite">
            <template v-if="lignes.length">{{ faites }} sur {{ lignes.length }} accomplie{{ faites > 1 ? 's' : '' }}</template>
            <template v-else>Rien de prévu ce jour-là.</template>
          </p>
          <p v-if="lignes.length && faites === lignes.length" class="font-serif text-[0.9375rem] text-ok italic">Journée accomplie</p>
        </div>
        <div v-if="lignes.length" class="mt-1.5 h-[3px] overflow-hidden rounded-xs bg-line" aria-hidden="true">
          <div class="h-full bg-ink" :style="{ width: `${(faites / lignes.length) * 100}%` }" />
        </div>
      </div>

      <section v-for="s in sections" :key="s.id" class="pt-4" :aria-labelledby="`titre-${s.id}`">
        <div class="mb-1 flex items-baseline justify-between">
          <h2 :id="`titre-${s.id}`" class="text-lg">{{ s.titre }}</h2>
          <p v-if="s.id === 'objectifs'" class="text-[0.625rem] font-semibold tracking-[0.3em] text-ink-soft" aria-hidden="true">LMMJVSD</p>
        </div>
        <ul>
          <li v-for="{ t, debut, horaires, etat } in s.lignes" :key="t.id" class="border-b border-line py-2" data-testid="suivi">
            <div class="flex items-center gap-3">
              <span v-if="horaires.length" class="w-11 shrink-0 text-right text-xs font-semibold tabular-nums" aria-hidden="true">{{ formatMin(debut) }}</span>
              <span class="trait min-h-10" :style="{ background: t.couleur_snapshot || COULEUR_DEFAUT }" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium" :class="{ 'text-ink-soft line-through decoration-ink-soft/50': etat.fait }">
                  <span v-if="t.icone_snapshot" class="mr-1.5" aria-hidden="true">{{ t.icone_snapshot }}</span>{{ t.nom_snapshot }}
                </p>
                <p class="text-sm text-ink-soft tabular-nums">
                  <span v-if="horaires.length">{{ horaires.join(', ') }}</span>
                  <span v-if="horaires.length && t.cible_jours_semaine_snapshot"> · </span>
                  <span v-if="t.cible_jours_semaine_snapshot" data-testid="semaine">
                    {{ cetteSemaine(t) }}/{{ t.cible_jours_semaine_snapshot }} jour{{ t.cible_jours_semaine_snapshot > 1 ? 's' : '' }} cette semaine
                  </span>
                </p>
              </div>
              <!-- Sept cases : les jours accomplis de la semaine, lundi à gauche. -->
              <div
                v-if="t.cible_jours_semaine_snapshot" class="flex shrink-0 gap-[3px]" role="img"
                :aria-label="`${cetteSemaine(t)} jour${cetteSemaine(t) > 1 ? 's' : ''} accompli${cetteSemaine(t) > 1 ? 's' : ''} cette semaine`"
              >
                <span
                  v-for="d in semaine" :key="d" class="block size-[9px] rounded-xs border"
                  :class="store.etatDe(t.id, d).fait ? 'border-ok bg-ok' : d === jour ? 'border-ink' : 'border-line-strong'"
                />
              </div>
              <!-- La case occupe 44 px : c'est le geste principal sur téléphone. -->
              <label class="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox" class="case" :checked="etat.fait"
                  :aria-label="`${t.nom_snapshot} : fait`"
                  @change="store.cocher(t, jour, ($event.target as HTMLInputElement).checked)"
                />
              </label>
            </div>

            <!-- Objectif en minutes : boutons ±15 pour le pouce, champ libre pour une durée exacte. -->
            <div v-if="t.cible_minutes_par_jour_snapshot" class="mt-2 flex items-center gap-2.5 pl-4">
              <button
                type="button" class="btn w-11 shrink-0 px-0 tabular-nums" :disabled="etat.minutes <= 0"
                :aria-label="`Retirer 15 minutes à ${t.nom_snapshot}`" @click="ajouter(t, etat.minutes, -15)"
              >−15</button>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-center gap-2 text-sm text-ink-soft tabular-nums">
                  <label class="sr-only" :for="`minutes-${t.id}`">Minutes pour {{ t.nom_snapshot }}</label>
                  <input
                    :id="`minutes-${t.id}`" class="field w-[4.5rem] px-2 text-center font-serif text-xl tabular-nums" type="number" inputmode="numeric"
                    min="0" max="1440" step="5" :value="etat.minutes || ''" placeholder="0"
                    @change="store.saisirMinutes(t, jour, ($event.target as HTMLInputElement).valueAsNumber)"
                  />
                  <span>min sur {{ dureeLabel(t.cible_minutes_par_jour_snapshot) }}</span>
                </div>
                <div class="mt-1.5 h-[3px] overflow-hidden rounded-xs bg-line" aria-hidden="true">
                  <div class="h-full" :class="etat.fait ? 'bg-ok' : 'bg-ink'" :style="{ width: `${Math.min(100, (etat.minutes / t.cible_minutes_par_jour_snapshot) * 100)}%` }" />
                </div>
              </div>
              <button
                type="button" class="btn w-11 shrink-0 px-0 tabular-nums" :disabled="etat.minutes >= 1440"
                :aria-label="`Ajouter 15 minutes à ${t.nom_snapshot}`" @click="ajouter(t, etat.minutes, 15)"
              >+15</button>
            </div>
          </li>
        </ul>
      </section>

      <RouterLink class="btn btn-quiet mt-4" :to="`/planning/${mois.annee}/${mois.mois}`">
        Voir tout {{ moisLabel(mois.annee, mois.mois) }}
      </RouterLink>
    </template>
  </div>
</template>
