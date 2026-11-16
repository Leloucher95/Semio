<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { daysInMonth, isoWeekday, JOURS, moisLabel, nextMonth, prevMonth, todayIn, ymd } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { groupesParRubrique, joursFaits } from '../lib/suivi'
import { cibleLabel, COULEUR_DEFAUT } from '../lib/taches'
import type { PlanTache } from '../lib/types'
import { useAuth } from '../stores/auth'
import { useModeles } from '../stores/modeles'
import { usePlan } from '../stores/plan'
import { useToasts } from '../stores/toasts'

const props = defineProps<{ annee: number; mois: number }>()
const auth = useAuth()
const store = usePlan()
const modeles = useModeles()
const toasts = useToasts()
const router = useRouter()

const charge = computed(() => store.moisCharge === `${props.annee}-${props.mois}`)
const erreur = ref('')
const modeleChoisi = ref('')
const envoi = ref(false)

watch(() => [props.annee, props.mois] as const, async ([annee, mois]) => {
  erreur.value = ''
  try {
    await Promise.all([store.load(annee, mois), modeles.charge ? undefined : modeles.load()])
    modeleChoisi.value ||= modeles.courantId
  } catch (e) {
    erreur.value = messageErreur(e, 'Le mois n’a pas pu être chargé.')
  }
}, { immediate: true })

const titre = computed(() => moisLabel(props.annee, props.mois))
const precedent = computed(() => prevMonth(props.annee, props.mois))
const suivant = computed(() => nextMonth(props.annee, props.mois))
const lien = (m: { annee: number; mois: number }) => `/planning/${m.annee}/${m.mois}`
const aujourdhui = computed(() => todayIn(auth.timezone))

// Colonnes : les jours civils réels du mois (28 à 31), avec leur jour de semaine.
const jours = computed(() =>
  Array.from({ length: daysInMonth(props.annee, props.mois) }, (_, i) => {
    const iso = isoWeekday(props.annee, props.mois, i + 1)
    return { n: i + 1, date: ymd(props.annee, props.mois, i + 1), iso, initiale: JOURS[iso - 1]!.initiale, long: JOURS[iso - 1]!.long }
  }),
)
const dates = computed(() => jours.value.map((j) => j.date))
const groupes = computed(() => groupesParRubrique(store.taches))

const cible = (t: PlanTache) => cibleLabel(t.cible_jours_semaine_snapshot, t.cible_minutes_par_jour_snapshot)

/** Contenu d'une case : ✓ si fait, sinon les minutes déjà saisies (objectif en cours). */
function contenu(t: PlanTache, date: string) {
  const etat = store.etatDe(t.id, date)
  return etat.fait ? '✓' : etat.minutes ? String(etat.minutes) : ''
}

async function appliquer() {
  envoi.value = true
  try {
    await store.appliquer(modeleChoisi.value, props.annee, props.mois)
    await store.load(props.annee, props.mois)
    toasts.ok(`Semaine type appliquée à ${titre.value}.`)
  } catch (e) {
    toasts.erreur(messageErreur(e, 'La semaine type n’a pas pu être appliquée : rien n’a été créé.'))
  } finally {
    envoi.value = false
  }
}

async function dupliquer() {
  envoi.value = true
  try {
    await store.dupliquer()
    toasts.ok(`${titre.value} dupliqué : coches et minutes repartent de zéro.`)
    await router.push(lien(suivant.value))
  } catch (e) {
    toasts.erreur(messageErreur(e, 'Le mois n’a pas pu être dupliqué : rien n’a été créé.'))
  } finally {
    envoi.value = false
  }
}

async function supprimer() {
  if (!confirm(`Supprimer le planning de ${titre.value} ? Ses créneaux et tout son suivi seront effacés. Les autres mois et la semaine type ne changent pas.`)) return
  try {
    await store.supprimer()
    await store.load(props.annee, props.mois)
    toasts.ok(`Planning de ${titre.value} supprimé.`)
  } catch (e) {
    toasts.erreur(messageErreur(e, 'Le mois n’a pas pu être supprimé.'))
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <p class="eyebrow">Suivi du mois</p>
        <div class="mt-1 flex items-center gap-2">
          <RouterLink class="btn px-3" :to="lien(precedent)" :aria-label="`Mois précédent : ${moisLabel(precedent.annee, precedent.mois)}`">←</RouterLink>
          <h1 class="min-w-48 text-center text-3xl first-letter:uppercase" data-testid="mois-titre">{{ titre }}</h1>
          <RouterLink class="btn px-3" :to="lien(suivant)" :aria-label="`Mois suivant : ${moisLabel(suivant.annee, suivant.mois)}`">→</RouterLink>
        </div>
      </div>
      <div v-if="charge && store.plan" class="flex flex-wrap gap-2">
        <RouterLink class="btn" :to="`${lien(props)}/semaine`">Grille de la semaine</RouterLink>
        <button type="button" class="btn" :disabled="envoi" @click="dupliquer">
          Dupliquer vers {{ moisLabel(suivant.annee, suivant.mois) }}
        </button>
        <button type="button" class="btn btn-quiet" @click="supprimer">Supprimer ce mois</button>
      </div>
    </div>

    <p v-if="erreur" class="mt-6 text-danger" role="alert">{{ erreur }}</p>
    <p v-else-if="!charge" class="mt-6 text-ink-soft">Chargement…</p>

    <div v-else-if="!store.plan" class="mt-8 max-w-lg border-l-2 border-accent pl-4">
      <p class="font-serif text-xl">Pas encore de planning pour {{ titre }}.</p>
      <template v-if="modeles.modeles.length">
        <p class="mt-1 text-ink-soft">Appliquez une semaine type : le mois en garde sa propre copie, que vous pourrez ajuster sans toucher au modèle.</p>
        <form class="mt-4 flex flex-wrap items-end gap-2" @submit.prevent="appliquer">
          <div>
            <label class="label" for="modele-a-appliquer">Semaine type</label>
            <select id="modele-a-appliquer" v-model="modeleChoisi" class="field" required>
              <option v-for="m in modeles.modeles" :key="m.id" :value="m.id">{{ m.nom }}</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="envoi">Appliquer à {{ titre }}</button>
        </form>
      </template>
      <template v-else>
        <p class="mt-1 text-ink-soft">Commencez par composer une semaine type, puis appliquez-la à ce mois.</p>
        <RouterLink class="btn btn-primary mt-4" to="/semaine">Composer ma semaine type</RouterLink>
      </template>
    </div>

    <p v-else-if="!store.taches.length" class="mt-8 text-ink-soft">
      Ce mois ne contient aucune tâche : la semaine type appliquée était vide.
    </p>

    <div v-else class="mois mt-6 overflow-x-auto print:mt-0 print:overflow-visible">
      <h2 class="hidden font-serif text-xl first-letter:uppercase print:mb-1 print:block">Suivi — {{ titre }}</h2>
      <table class="mois-table w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" class="mois-tache text-left font-semibold">Tâche</th>
            <th
              v-for="j in jours" :key="j.n" scope="col" class="mois-jour font-normal"
              :class="{ 'mois-weekend': j.iso >= 6, 'mois-aujourdhui': j.date === aujourdhui }"
            >
              <span class="block text-[0.65rem] text-ink-soft uppercase" aria-hidden="true">{{ j.initiale }}</span>
              <RouterLink :to="`/jour/${j.date}`" class="font-semibold tabular-nums print:no-underline" :aria-label="`${j.long} ${j.n}`">{{ j.n }}</RouterLink>
            </th>
            <th scope="col" class="px-2 text-right font-semibold print:hidden">Jours</th>
          </tr>
        </thead>
        <tbody v-for="g in groupes" :key="g.rubrique">
          <tr>
            <th :colspan="jours.length + 2" scope="colgroup" class="mois-rubrique text-left">{{ g.rubrique }}</th>
          </tr>
          <tr v-for="t in g.taches" :key="t.id" data-testid="ligne-mois">
            <th scope="row" class="mois-tache text-left font-normal">
              <span class="flex items-center gap-2">
                <span class="mois-pastille" :style="{ background: t.couleur_snapshot || COULEUR_DEFAUT }" />
                <span class="min-w-0">
                  <span class="block truncate font-medium"><span v-if="t.icone_snapshot" aria-hidden="true">{{ t.icone_snapshot }} </span>{{ t.nom_snapshot }}</span>
                  <span v-if="cible(t)" class="block truncate text-xs text-ink-soft">{{ cible(t) }}</span>
                </span>
              </span>
            </th>
            <td v-for="j in jours" :key="j.n" class="mois-case" :class="{ 'mois-weekend': j.iso >= 6 }">
              <button
                type="button" class="mois-coche" :aria-pressed="store.etatDe(t.id, j.date).fait"
                :aria-label="`${t.nom_snapshot}, ${j.long} ${j.n}`"
                @click="store.cocher(t, j.date, !store.etatDe(t.id, j.date).fait)"
              >{{ contenu(t, j.date) }}</button>
            </td>
            <td class="px-2 text-right text-ink-soft tabular-nums print:hidden">{{ joursFaits(store.suivis, t.id, dates) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
