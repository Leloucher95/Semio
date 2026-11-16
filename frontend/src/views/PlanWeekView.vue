<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BlocActions from '../components/BlocActions.vue'
import PlacerDialog from '../components/PlacerDialog.vue'
import WeekGrid, { type Bloc } from '../components/WeekGrid.vue'
import { moisLabel } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { COULEUR_DEFAUT } from '../lib/taches'
import type { Creneau } from '../lib/types'
import { usePlan } from '../stores/plan'

/** Semaine du plan d'un mois : mêmes gestes que la semaine type, mais sur la copie de ce mois uniquement. */
const props = defineProps<{ annee: number; mois: number }>()
const store = usePlan()
const erreur = ref('')
const charge = computed(() => store.moisCharge === `${props.annee}-${props.mois}`)
const titre = computed(() => moisLabel(props.annee, props.mois))

watch(() => [props.annee, props.mois] as const, async ([annee, mois]) => {
  erreur.value = ''
  try {
    await store.load(annee, mois)
  } catch (e) {
    erreur.value = messageErreur(e, 'Le mois n’a pas pu être chargé.')
  }
}, { immediate: true })

const placerDialog = ref<InstanceType<typeof PlacerDialog>>()

const tacheParId = computed(() => new Map(store.taches.map((t) => [t.id, t])))
const blocs = computed<Bloc[]>(() =>
  store.placements.map((p) => {
    const t = tacheParId.value.get(p.plan_tache)
    return {
      id: p.id, jour_semaine: p.jour_semaine, debut_min: p.debut_min, fin_min: p.fin_min,
      titre: t?.nom_snapshot ?? 'Tâche', couleur: t?.couleur_snapshot || COULEUR_DEFAUT, icone: t?.icone_snapshot ?? '',
    }
  }),
)
const options = computed(() => store.taches.map((t) => ({ id: t.id, nom: t.nom_snapshot })))

const placer = (plan_tache: string, creneaux: Creneau[]) => store.placer({ plan_tache }, creneaux)

const selection = ref('')
const choisi = computed(() => blocs.value.find((b) => b.id === selection.value))

function copier(id: string, jours: number[]) {
  const p = store.placements.find((x) => x.id === id)
  if (p) return placer(p.plan_tache, jours.map((jour_semaine) => ({ jour_semaine, debut_min: p.debut_min, fin_min: p.fin_min })))
}

const imprimer = () => window.print()

function ouvrirBloc(id: string) {
  const bloc = blocs.value.find((b) => b.id === id)
  if (bloc) placerDialog.value?.ouvrir({ bloc })
}
</script>

<template>
  <div>
    <div class="entete print:hidden">
      <div>
        <p class="eyebrow">Semaine de <span>{{ titre }}</span></p>
        <h1 class="mt-1 text-[1.75rem] leading-9 sm:text-[2rem]">Planning de la semaine</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink class="btn" :to="`/planning/${annee}/${mois}`">Suivi du mois</RouterLink>
        <template v-if="store.plan">
          <button type="button" class="btn" @click="imprimer">Imprimer</button>
          <button type="button" class="btn btn-primary" @click="placerDialog?.ouvrir({})">Placer</button>
        </template>
      </div>
    </div>

    <p v-if="erreur" class="message-erreur mt-6" role="alert">{{ erreur }}</p>
    <p v-else-if="!charge" class="mt-6 text-ink-soft">Chargement…</p>
    <div v-else-if="!store.plan" class="vide">
      <p class="vide-titre">Pas de planning pour {{ titre }}.</p>
      <RouterLink class="btn btn-primary mt-4" :to="`/planning/${annee}/${mois}`">Préparer ce mois</RouterLink>
    </div>

    <template v-else>
      <p class="mt-3 max-w-2xl text-sm text-ink-soft print:hidden">
        Les changements faits ici ne concernent que {{ titre }} : la semaine type et les autres mois restent tels quels.
      </p>
      <h2 class="hidden font-serif text-xl first-letter:uppercase print:mb-2 print:block">Semaine — {{ titre }}</h2>
      <!-- Emplacement réservé : la barre apparaît sans déplacer la grille. -->
      <div class="mt-4 min-h-[3.75rem] print:hidden">
        <BlocActions
          v-if="choisi" :bloc="choisi" :blocs="blocs"
          @modifier="store.deplacer" @copier="copier" @retirer="store.retirer" @ouvrir="ouvrirBloc" @fermer="selection = ''"
        />
        <p v-else class="flex min-h-[3.75rem] items-center rounded-md border border-dashed border-line px-3 text-sm text-ink-soft">
          Cliquez sur un bloc pour le sélectionner : ses réglages rapides (début, durée, copie vers un autre jour) s’affichent ici. Double-clic ou « Modifier… » ouvre son formulaire.
        </p>
      </div>
      <div class="mt-4 print:mt-0">
        <WeekGrid :blocs="blocs" editable :selection="selection" @deplacer="store.deplacer" @ouvrir="ouvrirBloc" @selectionner="(id) => (selection = id)" />
      </div>
    </template>

    <PlacerDialog ref="placerDialog" :taches="options" @placer="placer" @modifier="store.deplacer" @retirer="store.retirer" />
  </div>
</template>
