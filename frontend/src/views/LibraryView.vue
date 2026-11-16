<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ColorPicker from '../components/ColorPicker.vue'
import TacheDialog from '../components/TacheDialog.vue'
import { messageErreur } from '../lib/pb'
import { cibleLabel, COULEUR_DEFAUT, dureeLabel, initiales, parseLignes } from '../lib/taches'
import type { Rubrique, Tache, TypeTache } from '../lib/types'
import { useLibrary } from '../stores/library'
import { useToasts } from '../stores/toasts'

const library = useLibrary()
const toasts = useToasts()
const erreurChargement = ref('')

onMounted(async () => {
  try {
    await library.load()
  } catch (e) {
    erreurChargement.value = messageErreur(e, 'La bibliothèque n’a pas pu être chargée.')
  }
})

const tacheDialog = ref<InstanceType<typeof TacheDialog>>()

// Tâches actives regroupées par rubrique, « Sans rubrique » en dernier.
const groupes = computed(() => {
  const groupes = library.rubriques.map((r) => ({ rubrique: r as Rubrique | null, taches: [] as Tache[] }))
  const sans = { rubrique: null as Rubrique | null, taches: [] as Tache[] }
  for (const t of library.actives) (groupes.find((g) => g.rubrique?.id === t.rubrique) ?? sans).taches.push(t)
  return sans.taches.length ? [...groupes, sans] : groupes
})

const detail = (t: Tache) =>
  t.type === 'creneau'
    ? `Créneau · ${dureeLabel(t.duree_defaut_min || 60)}`
    : ['Objectif', cibleLabel(t.cible_jours_semaine, t.cible_minutes_par_jour)].filter(Boolean).join(' · ')

/** Exécute une action serveur avec message de réussite ou d'échec. */
async function agir(action: () => Promise<unknown>, ok: string, echec: string) {
  try {
    await action()
    toasts.ok(ok)
  } catch (e) {
    toasts.erreur(messageErreur(e, echec))
  }
}

// Rubriques
const rubriqueDialog = ref<HTMLDialogElement>()
const rubrique = reactive({ id: undefined as string | undefined, nom: '', couleur: COULEUR_DEFAUT as string })

function ouvrirRubrique(r?: Rubrique) {
  Object.assign(rubrique, { id: r?.id, nom: r?.nom ?? '', couleur: r?.couleur || COULEUR_DEFAUT })
  rubriqueDialog.value?.showModal()
}

async function enregistrerRubrique() {
  await agir(
    () => library.saveRubrique({ nom: rubrique.nom.trim(), couleur: rubrique.couleur }, rubrique.id),
    'Rubrique enregistrée.', 'La rubrique n’a pas pu être enregistrée.',
  )
  rubriqueDialog.value?.close()
}

function supprimerRubrique(r: Rubrique) {
  if (!confirm(`Supprimer la rubrique « ${r.nom} » ? Ses tâches sont conservées, sans rubrique.`)) return
  agir(() => library.removeRubrique(r.id), 'Rubrique supprimée.', 'La rubrique n’a pas pu être supprimée.')
}

// Tâches
const archiver = (t: Tache, archivee: boolean) =>
  agir(
    () => library.saveTache({ archivee }, t.id),
    archivee ? 'Tâche archivée : elle reste dans les mois déjà planifiés.' : 'Tâche restaurée.',
    'La tâche n’a pas pu être modifiée.',
  )

function supprimerTache(t: Tache) {
  if (!confirm(`Supprimer définitivement « ${t.nom} » ? Les mois déjà planifiés gardent leur copie.`)) return
  agir(() => library.removeTache(t.id), 'Tâche supprimée.', 'Suppression refusée : un modèle utilise encore cette tâche. Retirez-la d’abord des modèles.')
}

// Saisie rapide
const rapide = reactive({ texte: '', type: 'objectif' as TypeTache, rubrique: '', envoi: false })
const lignes = computed(() => parseLignes(rapide.texte))

async function ajouterEnMasse() {
  const noms = lignes.value
  rapide.envoi = true
  const crees = await library.quickAdd(noms, {
    type: rapide.type, rubrique: rapide.rubrique, icone: '',
    couleur: library.rubriqueParId.get(rapide.rubrique)?.couleur || COULEUR_DEFAUT,
    duree_defaut_min: 60, cible_jours_semaine: 0, cible_minutes_par_jour: 0,
  })
  rapide.envoi = false
  // En cas d'échec partiel, seules les lignes non créées restent à l'écran.
  rapide.texte = noms.slice(crees).join('\n')
  if (crees === noms.length) toasts.ok(`${crees} tâche${crees > 1 ? 's' : ''} ajoutée${crees > 1 ? 's' : ''}.`)
  else toasts.erreur(`${crees} tâche(s) ajoutée(s) sur ${noms.length}. Les lignes restantes n’ont pas pu être enregistrées.`)
}

const voirArchivees = ref(false)
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`
</script>

<template>
  <div>
    <div class="entete">
      <div>
        <p class="eyebrow">Vos tâches réutilisables</p>
        <h1 class="mt-1 text-[1.75rem] leading-9 sm:text-[2rem]">Bibliothèque</h1>
        <p v-if="library.charge" class="mt-1 text-sm text-ink-soft">
          {{ pluriel(library.actives.length, 'tâche') }}, {{ pluriel(library.rubriques.length, 'rubrique') }}. Elles servent à composer vos semaines types.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn" @click="ouvrirRubrique()">Nouvelle rubrique</button>
        <button type="button" class="btn btn-primary" @click="tacheDialog?.ouvrir()">Nouvelle tâche</button>
      </div>
    </div>

  <div class="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section>
      <p v-if="erreurChargement" class="message-erreur mt-6" role="alert">{{ erreurChargement }}</p>
      <p v-else-if="!library.charge" class="mt-6 text-ink-soft">Chargement…</p>
      <div v-else-if="!library.actives.length" class="vide text-ink-soft">
        <p class="vide-titre text-ink">Aucune tâche pour l’instant.</p>
        <p class="mt-2">Créez « École », « Lecture » ou « Exercices », ou collez plusieurs lignes dans la saisie rapide.</p>
      </div>

      <div v-for="g in groupes" :key="g.rubrique?.id ?? 'sans'" class="mt-8">
        <div class="flex items-center gap-2 border-b border-ink-soft pb-1">
          <span v-if="g.rubrique" class="size-3 rounded-full" :style="{ background: g.rubrique.couleur || COULEUR_DEFAUT }" />
          <h2 class="min-w-0 flex-1 truncate text-[1.375rem] leading-7">{{ g.rubrique?.nom ?? 'Sans rubrique' }}</h2>
          <span class="hidden text-xs text-ink-soft tabular-nums sm:inline">{{ pluriel(g.taches.length, 'tâche') }}</span>
          <template v-if="g.rubrique">
            <button type="button" class="btn btn-quiet px-2" @click="ouvrirRubrique(g.rubrique)">Renommer</button>
            <button type="button" class="btn btn-quiet px-2" @click="supprimerRubrique(g.rubrique)">Supprimer</button>
          </template>
        </div>
        <p v-if="!g.taches.length" class="px-2 py-3 text-sm text-ink-soft italic">Aucune tâche dans cette rubrique.</p>
        <ul>
          <li v-for="t in g.taches" :key="t.id" class="flex flex-wrap items-center gap-x-3 border-b border-line px-2 py-1 hover:bg-card" data-testid="tache">
            <span class="trait min-h-9" :style="{ background: t.couleur || COULEUR_DEFAUT }" />
            <!-- Sans icône, les initiales du nom servent de repère (rien n'est enregistré). -->
            <span class="w-7 shrink-0 text-center" :class="{ 'text-xs font-semibold tracking-wide text-ink-soft': !t.icone }" aria-hidden="true">{{ t.icone || initiales(t.nom) }}</span>
            <div class="min-w-40 flex-1">
              <p class="truncate font-medium">{{ t.nom }}</p>
              <p class="text-[0.8125rem] leading-[1.125rem] text-ink-soft">{{ detail(t) }}</p>
            </div>
            <div class="ml-auto flex">
              <button type="button" class="btn btn-quiet text-ink" :aria-label="`Modifier ${t.nom}`" @click="tacheDialog?.ouvrir(t)">Modifier</button>
              <button type="button" class="btn btn-quiet" :aria-label="`Archiver ${t.nom}`" @click="archiver(t, true)">Archiver</button>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="library.archivees.length" class="mt-10">
        <button type="button" class="btn btn-quiet gap-2 px-0 hover:bg-transparent" :aria-expanded="voirArchivees" @click="voirArchivees = !voirArchivees">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transition-transform" :class="{ 'rotate-90': voirArchivees }"><path d="M4 2l4 4-4 4" /></svg>
          {{ voirArchivees ? 'Masquer' : 'Afficher' }} les tâches archivées ({{ library.archivees.length }})
        </button>
        <p v-if="voirArchivees" class="mb-1 text-[0.8125rem] text-ink-soft">Une tâche archivée n’est plus proposée, mais reste visible dans les mois où elle a été suivie.</p>
        <ul v-if="voirArchivees">
          <li v-for="t in library.archivees" :key="t.id" class="flex items-center gap-3 border-b border-line px-2 py-1 text-ink-soft">
            <p class="min-w-0 flex-1 truncate line-through decoration-line-strong">{{ t.nom }}</p>
            <button type="button" class="btn btn-quiet" @click="archiver(t, false)">Restaurer</button>
            <button type="button" class="btn btn-quiet text-danger" @click="supprimerTache(t)">Supprimer</button>
          </li>
        </ul>
      </div>
    </section>

    <aside class="mt-8 lg:sticky lg:top-4 lg:self-start">
      <form class="sheet space-y-4 p-5" @submit.prevent="ajouterEnMasse">
        <div>
          <p class="eyebrow">Plusieurs tâches d’un coup</p>
          <h2 class="mt-0.5 text-[1.375rem] leading-7">Saisie rapide</h2>
        </div>
        <div>
          <label class="label" for="rapide-texte">Une tâche par ligne</label>
          <textarea id="rapide-texte" v-model="rapide.texte" class="field papier-ligne py-2.5 leading-6" rows="6" placeholder="Lecture&#10;Exercices&#10;Révisions" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="rapide-type">Type</label>
            <select id="rapide-type" v-model="rapide.type" class="field">
              <option value="objectif">Objectif</option>
              <option value="creneau">Créneau</option>
            </select>
          </div>
          <div>
            <label class="label" for="rapide-rubrique">Rubrique</label>
            <select id="rapide-rubrique" v-model="rapide.rubrique" class="field">
              <option value="">Sans rubrique</option>
              <option v-for="r in library.rubriques" :key="r.id" :value="r.id">{{ r.nom }}</option>
            </select>
          </div>
        </div>
        <p v-if="library.charge && !library.rubriques.length" class="text-[0.8125rem] text-ink-soft">
          Les rubriques regroupent les tâches, à l’écran comme à l’impression (« Études », « Personnel »…).
        </p>
        <button type="submit" class="btn btn-primary w-full" :disabled="!lignes.length || rapide.envoi">
          {{ rapide.envoi ? 'Ajout en cours…' : lignes.length ? `Ajouter ${lignes.length} tâche${lignes.length > 1 ? 's' : ''}` : 'Ajouter' }}
        </button>
      </form>
    </aside>

  </div>

    <TacheDialog ref="tacheDialog" />

    <dialog ref="rubriqueDialog" class="sheet w-[min(26rem,calc(100vw-2rem))] p-0" aria-labelledby="rubrique-titre">
      <form class="space-y-4 p-5" @submit.prevent="enregistrerRubrique">
        <h2 id="rubrique-titre" class="text-[1.375rem] leading-7">{{ rubrique.id ? 'Modifier la rubrique' : 'Nouvelle rubrique' }}</h2>
        <div>
          <label class="label" for="rubrique-nom">Nom</label>
          <input id="rubrique-nom" v-model="rubrique.nom" class="field" required maxlength="80" />
        </div>
        <ColorPicker v-model="rubrique.couleur" nom="rubrique-couleur" />
        <div class="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" class="btn" @click="rubriqueDialog?.close()">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>
    </dialog>
  </div>
</template>
