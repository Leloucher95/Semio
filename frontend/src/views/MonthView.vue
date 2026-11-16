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

/**
 * Au-delà, le suivi imprimé passe sur plusieurs pages (en-tête répété, aucune ligne coupée ni masquée).
 * Seuil mesuré par tests/e2e/impression.spec.ts sur un mois de 31 jours avec deux rubriques.
 */
const SEUIL_UNE_PAGE = 16
const vierge = ref(false)
const imprimer = () => window.print()
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
    <div class="entete print:hidden">
      <div>
        <p class="eyebrow">Suivi du mois</p>
        <div class="mt-1 flex items-center gap-2">
          <RouterLink class="btn w-11 px-0" :to="lien(precedent)" :aria-label="`Mois précédent : ${moisLabel(precedent.annee, precedent.mois)}`"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5" /></svg></RouterLink>
          <h1 class="min-w-44 text-center text-[1.75rem] leading-9 first-letter:uppercase sm:min-w-60 sm:text-[2rem]" data-testid="mois-titre">{{ titre }}</h1>
          <RouterLink class="btn w-11 px-0" :to="lien(suivant)" :aria-label="`Mois suivant : ${moisLabel(suivant.annee, suivant.mois)}`"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5" /></svg></RouterLink>
        </div>
      </div>
      <div v-if="charge && store.plan" class="flex flex-wrap items-center gap-2">
        <label class="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm">
          <input v-model="vierge" type="checkbox" class="size-5 accent-ink" /> Version vierge
        </label>
        <button type="button" class="btn" @click="imprimer">Imprimer</button>
        <RouterLink class="btn" :to="`${lien(props)}/semaine`">Grille de la semaine</RouterLink>
        <button type="button" class="btn btn-primary" :disabled="envoi" @click="dupliquer">
          Dupliquer vers {{ moisLabel(suivant.annee, suivant.mois) }}
        </button>
        <!-- Action rare et destructrice : rangée dans un menu discret. -->
        <details class="relative">
          <summary class="btn btn-quiet w-11 list-none px-0 [&::-webkit-details-marker]:hidden" aria-label="Autres actions sur ce mois">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="3.5" cy="9" r="1.6" /><circle cx="9" cy="9" r="1.6" /><circle cx="14.5" cy="9" r="1.6" /></svg>
          </summary>
          <div class="sheet absolute right-0 z-10 mt-1 min-w-52 p-1 shadow-[0_12px_32px_-16px_rgb(34_48_43/0.28)]">
            <button type="button" class="btn btn-quiet w-full justify-start text-danger hover:text-danger" @click="supprimer">Supprimer ce mois…</button>
          </div>
        </details>
      </div>
    </div>

    <p v-if="erreur" class="message-erreur mt-6" role="alert">{{ erreur }}</p>
    <p v-else-if="!charge" class="mt-6 text-ink-soft">Chargement…</p>

    <div v-else-if="!store.plan" class="vide">
      <p class="vide-titre">Pas encore de planning pour {{ titre }}.</p>
      <template v-if="modeles.modeles.length">
        <p class="mt-2 text-ink-soft">Appliquez une semaine type : le mois en garde sa propre copie, que vous pourrez ajuster sans toucher au modèle.</p>
        <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="appliquer">
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
        <p class="mt-2 text-ink-soft">Commencez par composer une semaine type, puis appliquez-la à ce mois.</p>
        <RouterLink class="btn btn-primary mt-4" to="/semaine">Composer ma semaine type</RouterLink>
      </template>
    </div>

    <p v-else-if="!store.taches.length" class="mt-8 text-ink-soft">
      Ce mois ne contient aucune tâche : la semaine type appliquée était vide.
    </p>

    <div v-else class="mois mt-6 overflow-x-auto print:mt-0 print:overflow-visible" :class="{ 'mois-vierge': vierge }">
      <p v-if="store.taches.length > SEUIL_UNE_PAGE" class="mb-3 text-sm text-ink-soft print:hidden" data-testid="avis-pages">
        {{ store.taches.length }} tâches : le suivi s’imprimera sur plusieurs pages, avec l’en-tête des jours répété. Aucune ligne n’est masquée.
      </p>
      <h2 class="hidden font-serif text-xl print:mb-1 print:block">Suivi — {{ titre }}</h2>
      <table class="mois-table w-full border-collapse border-t-2 border-t-ink text-sm">
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
            <th scope="col" class="mois-total px-2 text-right font-semibold print:hidden">Jours</th>
          </tr>
        </thead>
        <tbody v-for="g in groupes" :key="g.rubrique">
          <tr class="mois-rubrique-ligne">
            <th :colspan="jours.length + 1" scope="colgroup" class="mois-rubrique text-left">{{ g.rubrique }}</th>
            <!-- Colonne « Jours » : masquée à l'impression, donc hors de la fusion ci-dessus. -->
            <td class="mois-rubrique print:hidden" />
          </tr>
          <tr v-for="t in g.taches" :key="t.id" class="mois-ligne" data-testid="ligne-mois">
            <th scope="row" class="mois-tache text-left font-normal">
              <span class="flex items-center gap-2">
                <span class="mois-pastille" :style="{ background: t.couleur_snapshot || COULEUR_DEFAUT }" />
                <span class="min-w-0">
                  <span class="block truncate font-medium"><span v-if="t.icone_snapshot" class="mr-1.5" aria-hidden="true">{{ t.icone_snapshot }}</span>{{ t.nom_snapshot }}</span>
                  <span v-if="cible(t)" class="block truncate text-xs text-ink-soft">{{ cible(t) }}</span>
                </span>
              </span>
            </th>
            <td v-for="j in jours" :key="j.n" class="mois-case" :class="{ 'mois-weekend': j.iso >= 6, 'mois-aujourdhui': j.date === aujourdhui }">
              <button
                type="button" class="mois-coche" :aria-pressed="store.etatDe(t.id, j.date).fait"
                :aria-label="`${t.nom_snapshot}, ${j.long} ${j.n}`"
                @click="store.cocher(t, j.date, !store.etatDe(t.id, j.date).fait)"
              >{{ contenu(t, j.date) }}</button>
            </td>
            <td class="mois-total px-2 text-right tabular-nums print:hidden">{{ joursFaits(store.suivis, t.id, dates) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-3 text-xs text-ink-soft print:hidden">
        Un clic coche ou décoche. Un nombre indique des minutes saisies sans que l’objectif du jour soit atteint. Le numéro d’un jour ouvre son suivi détaillé.
      </p>
    </div>
  </div>
</template>
