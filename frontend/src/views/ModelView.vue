<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PlacerDialog from '../components/PlacerDialog.vue'
import WeekGrid, { type Bloc } from '../components/WeekGrid.vue'
import { MOIS, moisLabel, parseYmd, todayIn } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { cibleLabel, COULEUR_DEFAUT } from '../lib/taches'
import type { Creneau, Tache } from '../lib/types'
import { useAuth } from '../stores/auth'
import { useLibrary } from '../stores/library'
import { useModeles } from '../stores/modeles'
import { usePlan } from '../stores/plan'
import { useToasts } from '../stores/toasts'

const auth = useAuth()
const plan = usePlan()
const router = useRouter()
const library = useLibrary()
const modeles = useModeles()
const toasts = useToasts()
const erreurChargement = ref('')

onMounted(async () => {
  try {
    await Promise.all([library.load(), modeles.load()])
  } catch (e) {
    erreurChargement.value = messageErreur(e, 'La semaine type n’a pas pu être chargée.')
  }
})

const grille = ref<InstanceType<typeof WeekGrid>>()
const placerDialog = ref<InstanceType<typeof PlacerDialog>>()

const blocs = computed<Bloc[]>(() =>
  modeles.placements.map((p) => {
    const tache = library.tacheParId.get(p.tache)
    return {
      id: p.id, jour_semaine: p.jour_semaine, debut_min: p.debut_min, fin_min: p.fin_min,
      titre: tache?.nom ?? 'Tâche', couleur: tache?.couleur || COULEUR_DEFAUT, icone: tache?.icone ?? '',
    }
  }),
)

const dureeDe = (t: Tache) => (t.type === 'creneau' && t.duree_defaut_min) || t.cible_minutes_par_jour || 60
const nbCreneaux = (tache: string) => modeles.placements.filter((p) => p.tache === tache).length

function detail(t: Tache) {
  const n = nbCreneaux(t.id)
  const cible = t.type === 'objectif' ? cibleLabel(t.cible_jours_semaine, t.cible_minutes_par_jour) : ''
  const horaires = n ? `${n} créneau${n > 1 ? 'x' : ''}` : t.type === 'objectif' ? 'sans horaire' : 'à placer'
  return [cible, horaires].filter(Boolean).join(' · ')
}

/** Exécute une action serveur et affiche un message en cas d'échec. */
async function tenter(action: () => Promise<unknown>, echec: string) {
  try {
    await action()
    return true
  } catch (e) {
    toasts.erreur(messageErreur(e, echec))
    return false
  }
}

async function nouveauModele() {
  const nom = prompt('Nom de la semaine type :', modeles.modeles.length ? '' : 'Ma semaine')?.trim()
  if (nom && (await tenter(() => modeles.creer(nom), 'Le modèle n’a pas pu être créé.'))) toasts.ok('Semaine type créée.')
}

async function renommer() {
  const nom = prompt('Nouveau nom :', modeles.courant?.nom)?.trim()
  if (nom) await tenter(() => modeles.renommer(nom), 'Le modèle n’a pas pu être renommé.')
}

async function supprimer() {
  if (!confirm(`Supprimer la semaine type « ${modeles.courant?.nom} » ? Les mois déjà créés ne changent pas.`)) return
  if (await tenter(() => modeles.supprimer(), 'Le modèle n’a pas pu être supprimé.')) toasts.ok('Semaine type supprimée.')
}

function basculer(t: Tache, membre: boolean) {
  if (membre) return tenter(() => modeles.assurerMembre(t.id), 'La tâche n’a pas pu être ajoutée au modèle.')
  if (nbCreneaux(t.id) && !confirm(`Retirer « ${t.nom} » du modèle ? Ses créneaux seront retirés de cette semaine type.`)) return
  return tenter(() => modeles.retirerMembre(t.id), 'La tâche n’a pas pu être retirée du modèle.')
}

/** Place une tâche (formulaire ou dépôt) : l'ajoute d'abord au modèle si besoin. */
async function placer(tache: string, creneaux: Creneau[]) {
  if (await tenter(() => modeles.assurerMembre(tache), 'La tâche n’a pas pu être ajoutée au modèle.')) {
    await modeles.placer({ tache }, creneaux)
  }
}

// Appliquer la semaine type à un mois : le serveur en fait une copie indépendante, ou refuse si le mois existe.
const appliquerDialog = ref<HTMLDialogElement>()
const cible = reactive({ annee: 0, mois: 0, envoi: false, erreur: '' })

function ouvrirAppliquer() {
  const { annee, mois } = parseYmd(todayIn(auth.timezone))
  Object.assign(cible, { annee, mois, erreur: '' })
  appliquerDialog.value?.showModal()
}

async function appliquer() {
  cible.envoi = true
  cible.erreur = ''
  try {
    await plan.appliquer(modeles.courantId, cible.annee, cible.mois)
    appliquerDialog.value?.close()
    toasts.ok(`Semaine type appliquée à ${moisLabel(cible.annee, cible.mois)}.`)
    await router.push(`/planning/${cible.annee}/${cible.mois}`)
  } catch (e) {
    cible.erreur = messageErreur(e, 'La semaine type n’a pas pu être appliquée : rien n’a été créé.')
  } finally {
    cible.envoi = false
  }
}

function ouvrirBloc(id: string) {
  const bloc = blocs.value.find((b) => b.id === id)
  if (bloc) placerDialog.value?.ouvrir({ bloc })
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <p class="eyebrow">Modèle réutilisable</p>
        <h1 class="mt-1 text-3xl">Semaine type</h1>
      </div>
      <div v-if="modeles.courant" class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="modele-choix">Semaine type affichée</label>
        <select id="modele-choix" class="field w-auto" :value="modeles.courantId" @change="modeles.ouvrir(($event.target as HTMLSelectElement).value)">
          <option v-for="m in modeles.modeles" :key="m.id" :value="m.id">{{ m.nom }}</option>
        </select>
        <button type="button" class="btn btn-quiet" @click="renommer">Renommer</button>
        <button type="button" class="btn btn-quiet" @click="supprimer">Supprimer</button>
        <button type="button" class="btn" @click="nouveauModele">Nouvelle semaine type</button>
        <button type="button" class="btn btn-primary" @click="ouvrirAppliquer">Appliquer à un mois</button>
      </div>
    </div>

    <p v-if="erreurChargement" class="mt-6 text-danger" role="alert">{{ erreurChargement }}</p>
    <p v-else-if="!modeles.charge || !library.charge" class="mt-6 text-ink-soft">Chargement…</p>

    <div v-else-if="!modeles.courant" class="mt-8 max-w-lg border-l-2 border-accent pl-4">
      <p class="font-serif text-xl">Aucune semaine type pour l’instant.</p>
      <p class="mt-1 text-ink-soft">Une semaine type est la recette de vos semaines : vous l’appliquez ensuite à un mois, qui en garde sa propre copie.</p>
      <button type="button" class="btn btn-primary mt-4" @click="nouveauModele">Créer ma semaine type</button>
    </div>

    <div v-else class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[19rem_minmax(0,1fr)] print:block">
      <aside class="print:hidden">
        <div class="flex items-center justify-between border-b border-ink pb-1">
          <h2 class="text-lg">Tâches</h2>
          <button type="button" class="btn btn-primary min-h-9" @click="placerDialog?.ouvrir({})">Placer</button>
        </div>
        <p v-if="!library.actives.length" class="py-3 text-sm text-ink-soft">
          La bibliothèque est vide. <RouterLink class="underline" to="/bibliotheque">Créer des tâches</RouterLink>
        </p>
        <p v-else class="py-2 text-xs text-ink-soft">
          Cochez les tâches de cette semaine. Glissez la poignée ⠿ vers la grille, ou utilisez « Placer ».
        </p>
        <ul>
          <li v-for="t in library.actives" :key="t.id" class="flex items-center gap-1 border-b border-line py-1" data-testid="membre">
            <span
              class="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-lg text-ink-soft select-none"
              aria-hidden="true" title="Glisser vers la grille" data-testid="poignee-tache"
              @pointerdown="grille?.deposerTache($event, t.id, dureeDe(t))"
            >⠿</span>
            <label class="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox" class="size-5 shrink-0 accent-ink" :checked="modeles.estMembre(t.id)"
                @change="basculer(t, ($event.target as HTMLInputElement).checked)"
              />
              <span class="w-1 self-stretch rounded-full" :style="{ background: t.couleur || COULEUR_DEFAUT }" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium"><span v-if="t.icone" aria-hidden="true">{{ t.icone }} </span>{{ t.nom }}</span>
                <span class="block truncate text-xs text-ink-soft">{{ detail(t) }}</span>
              </span>
            </label>
            <button
              type="button" class="btn btn-quiet min-h-11 px-2" :aria-label="`Placer ${t.nom}`"
              @click="placerDialog?.ouvrir({ tache: t.id, duree: dureeDe(t) })"
            >Placer</button>
          </li>
        </ul>
      </aside>

      <section>
        <h2 class="hidden font-serif text-xl print:mb-2 print:block">{{ modeles.courant.nom }}</h2>
        <WeekGrid
          ref="grille" :blocs="blocs" editable
          @deplacer="modeles.deplacer" @deposer="(tache, cible) => placer(tache, [cible])" @ouvrir="ouvrirBloc"
        />
      </section>
    </div>

    <dialog ref="appliquerDialog" class="sheet w-[min(26rem,calc(100vw-2rem))] p-0" aria-labelledby="appliquer-titre">
      <form class="space-y-4 p-5" @submit.prevent="appliquer">
        <h2 id="appliquer-titre" class="text-2xl">Appliquer à un mois</h2>
        <p class="text-sm text-ink-soft">
          Le mois reçoit sa propre copie de « {{ modeles.courant?.nom }} » : tâches, objectifs et créneaux.
          Modifier la semaine type ensuite ne changera pas ce mois.
        </p>
        <div class="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <label class="label" for="appliquer-mois">Mois</label>
            <select id="appliquer-mois" v-model.number="cible.mois" class="field capitalize">
              <option v-for="(nom, i) in MOIS" :key="nom" :value="i + 1">{{ nom }}</option>
            </select>
          </div>
          <div>
            <label class="label" for="appliquer-annee">Année</label>
            <input id="appliquer-annee" v-model.number="cible.annee" class="field tabular-nums" type="number" min="2000" max="2100" required />
          </div>
        </div>
        <p v-if="cible.erreur" class="text-sm text-danger" role="alert">{{ cible.erreur }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn" @click="appliquerDialog?.close()">Annuler</button>
          <button type="submit" class="btn btn-primary" :disabled="cible.envoi">Appliquer</button>
        </div>
      </form>
    </dialog>

    <PlacerDialog
      ref="placerDialog" :taches="library.actives"
      @placer="placer" @modifier="modeles.deplacer" @retirer="modeles.retirer"
    />
  </div>
</template>
