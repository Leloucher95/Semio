<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { addDays, dateLabel, formatMin, isoWeekday, moisLabel, parseYmd, todayIn, weekDates } from '../lib/dates'
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

/** Tâches à suivre ce jour : celles qui ont un créneau ce jour de semaine, puis les objectifs. */
const lignes = computed(() => {
  const iso = isoWeekday(mois.value.annee, mois.value.mois, mois.value.jour)
  const duJour = store.placements.filter((p) => p.jour_semaine === iso).sort((a, b) => a.debut_min - b.debut_min)
  const horaires = (t: PlanTache) =>
    duJour.filter((p) => p.plan_tache === t.id).map((p) => `${formatMin(p.debut_min)}–${formatMin(p.fin_min)}`)
  const premier = (t: PlanTache) => duJour.find((p) => p.plan_tache === t.id)?.debut_min ?? Infinity
  return store.taches
    .map((t) => ({ t, horaires: horaires(t), etat: store.etatDe(t.id, jour.value) }))
    .filter((l) => l.horaires.length || l.t.type_snapshot === 'objectif')
    .sort((a, b) => premier(a.t) - premier(b.t))
})

const faites = computed(() => lignes.value.filter((l) => l.etat.fait).length)

// shortcut: la semaine ne compte que les jours du mois affiché (le suivi appartient à un plan mensuel) ;
// agréger deux plans si les semaines à cheval sur deux mois deviennent gênantes.
const cetteSemaine = (t: PlanTache) => joursFaits(store.suivis, t.id, semaine.value)
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div class="flex items-end justify-between gap-2">
      <div class="min-w-0">
        <p class="eyebrow">{{ jour === aujourdhui ? 'Aujourd’hui' : 'Suivi du jour' }}</p>
        <h1 class="mt-1 text-3xl first-letter:uppercase" data-testid="jour-titre">{{ dateLabel(jour) }}</h1>
      </div>
      <nav class="flex shrink-0 gap-1" aria-label="Changer de jour">
        <RouterLink class="btn px-3" :to="lienJour(addDays(jour, -1))" aria-label="Jour précédent">←</RouterLink>
        <RouterLink class="btn px-3" :to="lienJour(addDays(jour, 1))" aria-label="Jour suivant">→</RouterLink>
      </nav>
    </div>
    <RouterLink v-if="jour !== aujourdhui" class="btn btn-quiet mt-1 px-0" to="/aujourdhui">Revenir à aujourd’hui</RouterLink>

    <p v-if="erreur" class="mt-6 text-danger" role="alert">{{ erreur }}</p>
    <p v-else-if="!charge" class="mt-6 text-ink-soft">Chargement…</p>

    <div v-else-if="!store.plan" class="mt-8 border-l-2 border-accent pl-4">
      <p class="font-serif text-xl">Pas de planning pour {{ moisLabel(mois.annee, mois.mois) }}.</p>
      <p class="mt-1 text-ink-soft">Appliquez une semaine type à ce mois pour commencer le suivi.</p>
      <RouterLink class="btn btn-primary mt-4" :to="`/planning/${mois.annee}/${mois.mois}`">Préparer ce mois</RouterLink>
    </div>

    <template v-else>
      <p class="mt-4 text-sm text-ink-soft" aria-live="polite">
        <template v-if="lignes.length">{{ faites }} sur {{ lignes.length }} accomplie{{ faites > 1 ? 's' : '' }}</template>
        <template v-else>Rien de prévu ce jour-là.</template>
      </p>

      <ul class="mt-2 border-t border-ink">
        <li v-for="{ t, horaires, etat } in lignes" :key="t.id" class="flex items-center gap-3 border-b border-line py-2" data-testid="suivi">
          <!-- La case occupe 44 px : c'est le geste principal sur téléphone. -->
          <label class="flex size-11 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox" class="size-7 cursor-pointer accent-ok" :checked="etat.fait"
              :aria-label="`${t.nom_snapshot} : fait`"
              @change="store.cocher(t, jour, ($event.target as HTMLInputElement).checked)"
            />
          </label>
          <span class="w-1 self-stretch rounded-full" :style="{ background: t.couleur_snapshot || COULEUR_DEFAUT }" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium" :class="{ 'text-ink-soft line-through decoration-ink-soft/50': etat.fait }">
              <span v-if="t.icone_snapshot" aria-hidden="true">{{ t.icone_snapshot }} </span>{{ t.nom_snapshot }}
            </p>
            <p class="text-sm text-ink-soft tabular-nums">
              <span v-if="horaires.length">{{ horaires.join(', ') }}</span>
              <span v-if="horaires.length && t.cible_jours_semaine_snapshot"> · </span>
              <span v-if="t.cible_jours_semaine_snapshot" data-testid="semaine">
                {{ cetteSemaine(t) }}/{{ t.cible_jours_semaine_snapshot }} jour{{ t.cible_jours_semaine_snapshot > 1 ? 's' : '' }} cette semaine
              </span>
            </p>
          </div>
          <div v-if="t.cible_minutes_par_jour_snapshot" class="shrink-0 text-right">
            <label class="sr-only" :for="`minutes-${t.id}`">Minutes pour {{ t.nom_snapshot }}</label>
            <div class="flex items-center gap-1">
              <input
                :id="`minutes-${t.id}`" class="field w-20 px-2 text-right tabular-nums" type="number" inputmode="numeric"
                min="0" max="1440" step="5" :value="etat.minutes || ''" placeholder="0"
                @change="store.saisirMinutes(t, jour, ($event.target as HTMLInputElement).valueAsNumber)"
              />
              <span class="text-sm text-ink-soft">min</span>
            </div>
            <p class="text-xs text-ink-soft">objectif {{ dureeLabel(t.cible_minutes_par_jour_snapshot) }}</p>
          </div>
        </li>
      </ul>

      <RouterLink class="btn btn-quiet mt-4 px-0" :to="`/planning/${mois.annee}/${mois.mois}`">
        Voir tout {{ moisLabel(mois.annee, mois.mois) }}
      </RouterLink>
    </template>
  </div>
</template>
