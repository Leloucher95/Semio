<script setup lang="ts">
import { computed } from 'vue'
import { formatMin, JOURS } from '../lib/dates'
import { collision, PAS } from '../lib/grid'
import type { Creneau } from '../lib/types'

/**
 * Barre d'actions du bloc sélectionné : raccourcis en complément du glisser-déposer et du formulaire.
 * Elle ne décide de rien : chaque bouton émet la demande, la vue passe par les mêmes fonctions du store
 * que le glisser (refus des chevauchements, annulation si le serveur refuse).
 */
const props = defineProps<{ bloc: Creneau & { id: string; titre: string }; blocs: (Creneau & { id: string })[] }>()
const emit = defineEmits<{
  modifier: [id: string, cible: Creneau]
  copier: [id: string, jours: number[]]
  retirer: [id: string]
  ouvrir: [id: string]
  fermer: []
}>()

const jour = computed(() => JOURS[props.bloc.jour_semaine - 1]!.long)

/** Créneau décalé (le bloc entier) ou allongé (la fin seule) ; `null` s'il sort de la journée ou passe sous 30 minutes. */
function cible(debut: number, fin: number): Creneau | null {
  const c = { jour_semaine: props.bloc.jour_semaine, debut_min: props.bloc.debut_min + debut, fin_min: props.bloc.fin_min + fin }
  return c.debut_min >= 0 && c.fin_min <= 1440 && c.fin_min - c.debut_min >= PAS ? c : null
}
const reglages = computed(() => [
  { nom: 'Début', moins: cible(-PAS, -PAS), plus: cible(PAS, PAS), moinsLabel: 'Avancer de 30 minutes', plusLabel: 'Reculer de 30 minutes' },
  { nom: 'Durée', moins: cible(0, -PAS), plus: cible(0, PAS), moinsLabel: 'Raccourcir de 30 minutes', plusLabel: 'Allonger de 30 minutes' },
])

/** Jours où une copie du bloc tiendrait sans chevauchement. */
const libre = (iso: number) => !collision({ ...props.bloc, jour_semaine: iso }, props.blocs)
</script>

<template>
  <div
    class="sheet flex min-h-[3.75rem] flex-wrap items-center gap-x-5 gap-y-2 border-ink px-3 py-2 print:hidden"
    role="toolbar" :aria-label="`Actions pour ${bloc.titre}`" data-testid="barre-bloc"
  >
    <p class="min-w-0 text-sm" aria-live="polite">
      <span class="font-semibold">{{ bloc.titre }}</span>
      <span class="text-ink-soft tabular-nums"> · {{ jour }} {{ formatMin(bloc.debut_min) }}–{{ formatMin(bloc.fin_min) }}</span>
    </p>

    <div v-for="r in reglages" :key="r.nom" class="flex items-center gap-1">
      <span class="mr-1 text-xs font-semibold tracking-wider text-ink-soft uppercase">{{ r.nom }}</span>
      <button type="button" class="btn w-11 shrink-0 px-0 tabular-nums" :disabled="!r.moins" :aria-label="r.moinsLabel" @click="r.moins && emit('modifier', bloc.id, r.moins)">−30</button>
      <button type="button" class="btn w-11 shrink-0 px-0 tabular-nums" :disabled="!r.plus" :aria-label="r.plusLabel" @click="r.plus && emit('modifier', bloc.id, r.plus)">+30</button>
    </div>

    <div class="flex flex-wrap items-center gap-1">
      <span class="mr-1 text-xs font-semibold tracking-wider text-ink-soft uppercase">Copier vers</span>
      <button
        v-for="j in JOURS" :key="j.iso" type="button" class="btn w-11 shrink-0 px-0 capitalize"
        :disabled="!libre(j.iso)" :aria-label="`Copier vers ${j.long}`" @click="emit('copier', bloc.id, [j.iso])"
      >{{ j.court.slice(0, 3) }}</button>
    </div>

    <div class="ml-auto flex items-center gap-1">
      <button type="button" class="btn" @click="emit('ouvrir', bloc.id)">Modifier…</button>
      <button type="button" class="btn btn-danger" @click="emit('retirer', bloc.id)">Retirer</button>
      <button type="button" class="btn btn-quiet w-11 px-0" aria-label="Fermer la barre d’actions" @click="emit('fermer')">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
      </button>
    </div>
  </div>
</template>
