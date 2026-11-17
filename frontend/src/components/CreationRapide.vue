<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { conflits, dureesPossibles, existante, joursPour, suggestions, type Repetition } from '../lib/creation'
import { formatMin, JOURS } from '../lib/dates'
import { PAS } from '../lib/grid'
import { messageErreur } from '../lib/pb'
import { COULEURS, dureeLabel } from '../lib/taches'
import type { Creneau, Tache } from '../lib/types'
import { useLibrary } from '../stores/library'
import { useModeles } from '../stores/modeles'
import { useToasts } from '../stores/toasts'

/**
 * Création rapide depuis la grille : un nom, Entrée, et l'activité est créée, ajoutée à la semaine type et placée.
 * Le serveur fait les trois dans une seule transaction (`/api/semio/quick-add`) : tout ou rien.
 */
const props = defineProps<{ blocs: (Creneau & { id: string })[] }>()

const library = useLibrary()
const modeles = useModeles()
const toasts = useToasts()

const dialog = ref<HTMLDialogElement>()
const champ = ref<HTMLInputElement>()
const form = reactive({
  nom: '', tache: '', jour: 1, debut: 480, duree: 60,
  repetition: 'jour' as Repetition, choisis: [] as number[],
  actif: -1, envoi: false, erreur: '',
})

const HORAIRES = Array.from({ length: 1440 / PAS }, (_, i) => i * PAS)
const REPETITIONS: { valeur: Repetition; libelle: string }[] = [
  { valeur: 'jour', libelle: 'Uniquement ce jour' },
  { valeur: 'semaine', libelle: 'Du lundi au vendredi' },
  { valeur: 'tous', libelle: 'Tous les jours' },
  { valeur: 'choix', libelle: 'Choisir les jours' },
]

// Recherche dans les tâches déjà chargées : aucune requête pendant la frappe.
const propositions = computed(() => (form.tache ? [] : suggestions(library.actives, form.nom)))
/** Tâche réutilisée : choisie dans la liste, ou portant exactement le nom saisi (jamais de doublon involontaire). */
const reutilisee = computed<Tache | undefined>(() => library.tacheParId.get(form.tache) ?? existante(library.actives, form.nom))

const durees = computed(() => dureesPossibles(form.debut, form.duree).liste)
const fin = computed(() => form.debut + form.duree)
const jours = computed(() => joursPour(form.repetition, form.jour, form.choisis))
const occupes = computed(() => conflits(jours.value, form.debut, fin.value, props.blocs))
const nomJour = (iso: number) => JOURS[iso - 1]!.long
const horaire = computed(() => `${formatMin(form.debut)}–${formatMin(fin.value)}`)

const quand = computed(() => (jours.value.length === 1 ? nomJour(jours.value[0]!) : `${jours.value.length} jours`))

const blocage = computed(() => {
  if (!jours.value.length) return 'Choisissez au moins un jour.'
  if (occupes.value.length) {
    return `Déjà occupé de ${horaire.value} : ${occupes.value.map(nomJour).join(', ')}. Changez l’heure, la durée ou les jours : rien n’est ajouté tant qu’un jour est en conflit.`
  }
  return ''
})
const pret = computed(() => form.nom.trim() !== '' && !blocage.value && !form.envoi)

// Une heure tardive ne laisse pas la place à la durée voulue : on propose la plus longue qui tient avant minuit.
watch(() => form.debut, (debut) => {
  form.duree = dureesPossibles(debut, form.duree).defaut
})

function ouvrir(cible: { jour_semaine: number; debut_min: number }) {
  Object.assign(form, {
    nom: '', tache: '', jour: cible.jour_semaine, debut: cible.debut_min,
    duree: dureesPossibles(cible.debut_min).defaut,
    repetition: 'jour', choisis: [cible.jour_semaine], actif: -1, envoi: false, erreur: '',
  })
  dialog.value?.showModal()
  nextTick(() => champ.value?.focus())
}
defineExpose({ ouvrir })

function saisir() {
  // Modifier le nom annule un choix explicite : la liste se propose à nouveau.
  form.tache = ''
  form.actif = -1
  form.erreur = ''
}

function choisir(t: Tache) {
  form.tache = t.id
  form.nom = t.nom
  form.actif = -1
  if (t.type === 'creneau' && t.duree_defaut_min) form.duree = dureesPossibles(form.debut, t.duree_defaut_min).defaut
  champ.value?.focus()
}

function touche(e: KeyboardEvent) {
  const n = propositions.value.length
  if (e.key === 'ArrowDown' && n) {
    e.preventDefault()
    form.actif = (form.actif + 1) % n
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault()
    form.actif = form.actif <= 0 ? n - 1 : form.actif - 1
  } else if (e.key === 'Enter' && form.actif >= 0 && propositions.value[form.actif]) {
    // Entrée sur une proposition la choisit ; une seconde Entrée ajoute l'activité.
    e.preventDefault()
    choisir(propositions.value[form.actif]!)
  }
}

async function ajouter() {
  if (!pret.value) return // nom vide, conflit, ou envoi déjà en cours (double validation)
  form.envoi = true
  form.erreur = ''
  const nom = form.nom.trim()
  const creneaux = jours.value.map((jour_semaine) => ({ jour_semaine, debut_min: form.debut, fin_min: fin.value }))
  try {
    const tache = await modeles.ajoutRapide(
      reutilisee.value
        ? { tache: reutilisee.value.id, creneaux }
        : {
            creneaux,
            nouvelle: {
              nom, type: 'creneau', duree_defaut_min: form.duree,
              couleur: COULEURS[library.taches.length % COULEURS.length]!.hex,
            },
          },
    )
    library.integrer(tache)
    dialog.value?.close()
    toasts.ok(`« ${tache.nom} » ajoutée : ${quand.value}, ${horaire.value}.`)
  } catch (e) {
    // Dans la boîte de dialogue : un toast resterait derrière le voile. Le serveur n'a rien créé.
    form.erreur = messageErreur(e, 'L’activité n’a pas pu être ajoutée : rien n’a été créé.')
  } finally {
    form.envoi = false
  }
}
</script>

<template>
  <!-- Sur téléphone la boîte se cale en haut de l'écran : le clavier virtuel ne recouvre ni le champ ni « Ajouter ». -->
  <dialog
    ref="dialog" aria-labelledby="creation-titre"
    class="sheet max-h-[calc(100dvh-1.5rem)] w-[min(30rem,calc(100vw-1.5rem))] overflow-y-auto p-0 max-sm:mt-3 max-sm:mb-auto"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="ajouter">
      <div>
        <p class="eyebrow">Nouvelle activité</p>
        <h2 id="creation-titre" class="mt-0.5 text-[1.375rem] leading-7 first-letter:uppercase" data-testid="creation-quand">
          {{ quand }} · {{ horaire }}
        </h2>
      </div>

      <div>
        <label class="label" for="creation-nom">Que voulez-vous faire ?</label>
        <input
          id="creation-nom" ref="champ" v-model="form.nom" class="field min-h-12" maxlength="120" autocomplete="off" enterkeyhint="done"
          placeholder="Révisions de maths, sport, piano…"
          role="combobox" aria-autocomplete="list" aria-controls="creation-propositions"
          :aria-expanded="propositions.length > 0"
          :aria-activedescendant="form.actif >= 0 ? `creation-option-${form.actif}` : undefined"
          @input="saisir" @keydown="touche"
        />
        <ul
          v-show="propositions.length" id="creation-propositions" role="listbox" aria-label="Tâches existantes"
          class="mt-1 overflow-hidden rounded border border-line bg-card"
        >
          <li
            v-for="(t, i) in propositions" :id="`creation-option-${i}`" :key="t.id" role="option" :aria-selected="i === form.actif"
            class="flex min-h-11 cursor-pointer items-center gap-2 border-b border-line px-3 text-sm last:border-b-0"
            :class="i === form.actif ? 'bg-highlight' : 'hover:bg-paper'"
            @mousedown.prevent="choisir(t)"
          >
            <span class="trait h-5 self-center" :style="{ background: t.couleur }" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ t.nom }}</span>
            <span class="shrink-0 text-xs text-ink-soft">réutiliser</span>
          </li>
        </ul>
        <p v-if="form.nom.trim()" class="mt-1.5 text-xs text-ink-soft" aria-live="polite" data-testid="creation-statut">
          <template v-if="reutilisee">Tâche existante « {{ reutilisee.nom }} » : elle sera réutilisée, sans doublon.</template>
          <template v-else>Nouvelle activité : elle rejoindra aussi votre bibliothèque.</template>
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2 max-sm:order-1">
        <div>
          <label class="label" for="creation-jour">Jour</label>
          <select id="creation-jour" v-model.number="form.jour" class="field px-2 capitalize" :disabled="form.repetition !== 'jour'">
            <option v-for="j in JOURS" :key="j.iso" :value="j.iso">{{ j.long }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="creation-debut">Début</label>
          <select id="creation-debut" v-model.number="form.debut" class="field px-2 tabular-nums">
            <option v-for="m in HORAIRES" :key="m" :value="m">{{ formatMin(m) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="creation-duree">Durée</label>
          <select id="creation-duree" v-model.number="form.duree" class="field px-2">
            <option v-for="d in durees" :key="d" :value="d">{{ dureeLabel(d) }}</option>
          </select>
        </div>
      </div>

      <fieldset class="max-sm:order-1">
        <legend class="label">Répéter</legend>
        <div class="grid grid-cols-2 gap-2">
          <label
            v-for="r in REPETITIONS" :key="r.valeur"
            class="relative flex min-h-11 cursor-pointer items-center justify-center rounded border border-line-strong bg-card px-2 text-center text-sm font-medium has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input v-model="form.repetition" class="absolute inset-0 cursor-pointer opacity-0" type="radio" name="creation-repetition" :value="r.valeur" />
            {{ r.libelle }}
          </label>
        </div>
        <div v-if="form.repetition === 'choix'" class="mt-2 grid grid-cols-7 gap-1" role="group" aria-label="Jours choisis">
          <label
            v-for="j in JOURS" :key="j.iso"
            class="relative flex min-h-11 cursor-pointer items-center justify-center rounded border border-line-strong bg-card text-sm font-medium capitalize has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input v-model="form.choisis" class="absolute inset-0 cursor-pointer opacity-0" type="checkbox" :value="j.iso" :aria-label="j.long" />
            <span aria-hidden="true">{{ j.court.slice(0, 3) }}</span>
          </label>
        </div>
      </fieldset>

      <!-- Aperçu : exactement les créneaux qui seront créés, tous ou aucun. -->
      <p v-if="!blocage" class="text-sm text-ink-soft tabular-nums max-sm:order-1" data-testid="creation-apercu">
        {{ jours.length > 1 ? `${jours.length} créneaux` : 'Un créneau' }} de {{ horaire }} :
        <span class="text-ink">{{ jours.map(nomJour).join(', ') }}</span>.
      </p>
      <p v-else class="message-erreur" role="alert">{{ blocage }}</p>
      <!-- Le refus (conflit, erreur serveur) reste collé au champ : visible sans faire défiler. -->
      <p v-if="form.erreur" class="message-erreur" role="alert">{{ form.erreur }}</p>

      <div class="flex justify-end gap-2 border-line sm:border-t sm:pt-4">
        <button type="button" class="btn" @click="dialog?.close()">Annuler</button>
        <button type="submit" class="btn btn-primary min-w-28" :disabled="!pret">{{ form.envoi ? 'Ajout…' : 'Ajouter' }}</button>
      </div>
    </form>
  </dialog>
</template>
