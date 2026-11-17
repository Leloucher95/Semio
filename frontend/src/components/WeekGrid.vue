<script setup lang="ts">
import { computed } from 'vue'
import { useGridDrag } from '../composables/useGridDrag'
import { formatMin, JOURS } from '../lib/dates'
import { debutDepuisClic } from '../lib/creation'
import { collision, PAS, plageAffichee } from '../lib/grid'
import type { Creneau } from '../lib/types'

export interface Bloc extends Creneau {
  id: string
  titre: string
  couleur: string
  icone: string
}

/** Ce que transporte un glisser : un bloc existant, ou une tâche venue de la liste. */
type Charge = { bloc: string } | { tache: string }

/**
 * `selection` : bloc dont la vue affiche la barre d'actions. Un clic sélectionne ; double-clic, Entrée ou Espace ouvrent le formulaire ;
 * Échap ou un clic dans une zone vide désélectionnent. La sélection ne change jamais pendant un glisser.
 */
const props = defineProps<{ blocs: Bloc[]; editable?: boolean; selection?: string; /** un clic dans une zone libre propose d'y créer une activité */ creable?: boolean }>()
const emit = defineEmits<{
  deplacer: [id: string, cible: Creneau]
  deposer: [tache: string, cible: Creneau]
  ouvrir: [id: string]
  selectionner: [id: string]
  creer: [cible: { jour_semaine: number; debut_min: number }]
}>()

const plage = computed(() => plageAffichee(props.blocs))
const lignes = computed(() => (plage.value.fin - plage.value.debut) / PAS)
const heures = computed(() => {
  const liste: number[] = []
  for (let m = plage.value.debut; m <= plage.value.fin; m += 60) liste.push(m)
  return liste
})

/** Position verticale d'un créneau, en pourcentage de la colonne. */
function position(c: Creneau) {
  const total = plage.value.fin - plage.value.debut
  return {
    top: `${((c.debut_min - plage.value.debut) / total) * 100}%`,
    height: `${((c.fin_min - c.debut_min) / total) * 100}%`,
  }
}

const court = (c: Creneau) => c.fin_min - c.debut_min <= PAS
const horaire = (c: Creneau) => `${formatMin(c.debut_min)}–${formatMin(c.fin_min)}`

function minuteEn(colonne: HTMLElement, clientY: number) {
  const rect = colonne.getBoundingClientRect()
  return plage.value.debut + ((clientY - rect.top) / rect.height) * (plage.value.fin - plage.value.debut)
}

const { apercu, enCours, demarrer } = useGridDrag<Charge>({
  minuteEn,
  terminer(charge, cible) {
    if ('bloc' in charge) {
      emit('deplacer', charge.bloc, cible)
      emit('selectionner', charge.bloc)
    }
    else emit('deposer', charge.tache, cible)
  },
})

/** Clic dans une zone libre d'une colonne : désélectionne, et propose la création dans la demi-heure visée. */
function clicLibre(e: MouseEvent, jour: number) {
  emit('selectionner', '')
  if (props.creable) emit('creer', { jour_semaine: jour, debut_min: debutDepuisClic(minuteEn(e.currentTarget as HTMLElement, e.clientY)) })
}

const idGlisse = computed(() => (enCours.value && 'bloc' in enCours.value ? enCours.value.bloc : undefined))
const apercuInvalide = computed(() => apercu.value !== null && collision(apercu.value, props.blocs, idGlisse.value))

function deplacerBloc(e: PointerEvent, bloc: Bloc) {
  if (!props.editable) return
  const colonne = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-jour]')
  if (!colonne) return
  demarrer(e, { type: 'deplacer', creneau: bloc, prise: minuteEn(colonne, e.clientY) - bloc.debut_min }, { bloc: bloc.id })
}

const etirerBloc = (e: PointerEvent, bloc: Bloc) => demarrer(e, { type: 'etirer', creneau: bloc }, { bloc: bloc.id })

/** Démarre le dépôt d'une tâche de la liste (appelé par la vue qui affiche la liste). */
const deposerTache = (e: PointerEvent, tache: string, duree: number) => demarrer(e, { type: 'creer', duree }, { tache })
defineExpose({ deposerTache })
</script>

<template>
  <!-- Sur téléphone la grille défile horizontalement ; le bouton « Placer » reste l'accès principal. -->
  <div class="semaine overflow-x-auto print:overflow-visible" :style="{ '--lignes': lignes }">
    <div class="grid min-w-[46rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))] print:min-w-0" :class="{ 'select-none': enCours }">
      <div />
      <div
        v-for="j in JOURS" :key="j.iso"
        class="border-b-2 border-ink pb-1 text-center font-serif text-base capitalize print:text-sm"
      >
        {{ j.long }}
      </div>

      <div class="relative" :style="{ height: `calc(var(--row-h) * ${lignes})` }" aria-hidden="true">
        <span
          v-for="m in heures" :key="m"
          class="absolute right-2 -translate-y-1/2 text-xs text-ink-soft tabular-nums first:translate-y-0 last:-translate-y-full"
          :style="{ top: `${((m - plage.debut) / (plage.fin - plage.debut)) * 100}%` }"
        >{{ formatMin(m) }}</span>
      </div>

      <div
        v-for="j in JOURS" :key="j.iso" :data-jour="j.iso" :aria-label="j.long" role="group"
        @click.self="clicLibre($event, j.iso)"
        class="semaine-jour relative border-l border-line last:border-r"
        :class="{ 'bg-paper-deep/60': j.iso >= 6, 'cursor-cell print:cursor-auto': creable }"
        :style="{ height: `calc(var(--row-h) * ${lignes})` }"
      >
        <div
          v-for="b in blocs.filter((b) => b.jour_semaine === j.iso)" :key="b.id"
          class="semaine-bloc absolute inset-x-0.5 overflow-hidden rounded-sm border border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight"
          :class="[editable ? 'cursor-grab' : '', b.id === idGlisse ? 'opacity-40' : '', court(b) ? 'semaine-bloc-court text-[0.6875rem]' : '', b.id === selection ? 'ring-2 ring-ink' : '']"
          :style="{ ...position(b), borderColor: b.couleur, background: `color-mix(in srgb, ${b.couleur} 14%, var(--color-card))` }"
          :role="editable ? 'button' : undefined" :tabindex="editable ? 0 : undefined"
          :aria-pressed="editable ? b.id === selection : undefined"
          @focus="editable && ($event.target as HTMLElement).matches(':focus-visible') && emit('selectionner', b.id)"
          :aria-label="`${b.titre}, ${j.long} ${horaire(b)}${editable ? ', modifier' : ''}`"
          data-testid="bloc"
          @pointerdown="$event.pointerType === 'mouse' && deplacerBloc($event, b)"
          @click="editable && emit('selectionner', b.id)"
          @dblclick="editable && emit('ouvrir', b.id)"
          @keydown.esc="editable && emit('selectionner', '')"
          @keydown.enter.prevent="editable && emit('ouvrir', b.id)"
          @keydown.space.prevent="editable && emit('ouvrir', b.id)"
        >
          <!-- Bloc d'une demi-heure : nom et horaire sur une seule ligne, sinon l'horaire serait coupé. -->
          <p class="truncate" :class="{ 'pr-5': editable }">
            <span class="font-semibold"><span v-if="b.icone" class="mr-1" aria-hidden="true">{{ b.icone }}</span>{{ b.titre }}</span>
            <span v-if="court(b)" class="text-ink-soft tabular-nums"> {{ horaire(b) }}</span>
          </p>
          <p v-if="!court(b)" class="truncate text-ink-soft tabular-nums">{{ horaire(b) }}</p>
          <template v-if="editable">
            <!-- Poignées : seules zones à `touch-action: none`, pour ne pas bloquer le défilement tactile. -->
            <span
              class="absolute top-0 right-0 flex size-7 touch-none items-start justify-end pr-1 text-ink-soft print:hidden"
              aria-hidden="true" data-testid="poignee-deplacer"
              @pointerdown.stop="deplacerBloc($event, b)"
            >⠿</span>
            <span
              class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none print:hidden"
              aria-hidden="true" data-testid="poignee-etirer"
              @pointerdown.stop="etirerBloc($event, b)" @click.stop
            />
          </template>
        </div>

        <!-- Fantôme : montre où le bloc tombera, arrondi au pas de 30 minutes. -->
        <div
          v-if="apercu && apercu.jour_semaine === j.iso"
          class="pointer-events-none absolute inset-x-0.5 z-10 rounded-sm border-2 border-dashed px-1.5 py-0.5 text-xs font-semibold tabular-nums"
          :class="apercuInvalide ? 'border-danger bg-danger/10 text-danger' : 'border-ink bg-ink/5'"
          :style="position(apercu)" data-testid="apercu"
        >
          {{ horaire(apercu) }}<template v-if="apercuInvalide"> · occupé</template>
        </div>
      </div>
    </div>
  </div>
</template>
