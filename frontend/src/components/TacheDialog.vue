<script setup lang="ts">
import { reactive, ref } from 'vue'
import ColorPicker from './ColorPicker.vue'
import { messageErreur } from '../lib/pb'
import { COULEUR_DEFAUT } from '../lib/taches'
import type { Tache } from '../lib/types'
import { useLibrary, type TacheSaisie } from '../stores/library'
import { useToasts } from '../stores/toasts'

const library = useLibrary()
const toasts = useToasts()

const dialog = ref<HTMLDialogElement>()
const id = ref<string>()
const envoi = ref(false)
const erreur = ref('')
const vide = (): TacheSaisie => ({
  nom: '', type: 'creneau', rubrique: '', couleur: COULEUR_DEFAUT, icone: '',
  duree_defaut_min: 60, cible_jours_semaine: 0, cible_minutes_par_jour: 0,
})
const form = reactive<TacheSaisie>(vide())

function ouvrir(tache?: Tache) {
  id.value = tache?.id
  erreur.value = ''
  const { nom, type, rubrique, couleur, icone, duree_defaut_min, cible_jours_semaine, cible_minutes_par_jour } = tache ?? vide()
  Object.assign(form, {
    nom, type, rubrique, icone, duree_defaut_min, cible_jours_semaine, cible_minutes_par_jour,
    couleur: couleur || COULEUR_DEFAUT,
  })
  dialog.value?.showModal()
}
defineExpose({ ouvrir })

async function enregistrer() {
  envoi.value = true
  try {
    await library.saveTache({ ...form, nom: form.nom.trim() }, id.value)
    dialog.value?.close()
    toasts.ok(id.value ? 'Tâche modifiée.' : 'Tâche ajoutée.')
  } catch (e) {
    // Dans la boîte de dialogue : un toast resterait derrière le voile.
    erreur.value = messageErreur(e, 'La tâche n’a pas pu être enregistrée. Vérifiez les valeurs saisies.')
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="sheet w-[min(32rem,calc(100vw-2rem))] p-0" aria-labelledby="tache-titre">
    <form class="space-y-4 p-5" @submit.prevent="enregistrer">
      <h2 id="tache-titre" class="text-[1.375rem] leading-7">{{ id ? 'Modifier la tâche' : 'Nouvelle tâche' }}</h2>

      <div class="flex gap-3">
        <div class="w-20">
          <label class="label" for="tache-icone">Icône</label>
          <input id="tache-icone" v-model="form.icone" class="field text-center" maxlength="8" placeholder="📚" aria-describedby="tache-icone-aide" />
        </div>
        <div class="flex-1">
          <label class="label" for="tache-nom">Nom</label>
          <input id="tache-nom" v-model="form.nom" class="field" required maxlength="120" />
        </div>
      </div>
      <p id="tache-icone-aide" class="-mt-2 text-xs text-ink-soft">Icône : un emoji, facultatif. Sans icône, les initiales du nom servent de repère.</p>

      <fieldset>
        <legend class="label">Type</legend>
        <!-- Deux boutons radio présentés en sélecteur à deux positions. -->
        <div class="grid grid-cols-2 overflow-hidden rounded border border-line-strong">
          <label class="relative flex min-h-11 cursor-pointer items-center justify-center bg-card px-2 text-sm font-medium has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent">
            <input v-model="form.type" type="radio" name="tache-type" value="creneau" class="absolute inset-0 cursor-pointer opacity-0" /> Créneau horaire
          </label>
          <label class="relative flex min-h-11 cursor-pointer items-center justify-center border-l border-line-strong bg-card px-2 text-sm font-medium has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent">
            <input v-model="form.type" type="radio" name="tache-type" value="objectif" class="absolute inset-0 cursor-pointer opacity-0" /> Objectif à suivre
          </label>
        </div>
        <p class="mt-1.5 text-xs text-ink-soft">
          {{ form.type === 'creneau' ? 'Se place à une heure précise dans la grille de la semaine.' : 'Se coche jour après jour, sans heure fixe : un nombre de jours visé et, au besoin, une durée.' }}
        </p>
      </fieldset>

      <div v-if="form.type === 'creneau'">
        <label class="label" for="tache-duree">Durée par défaut (minutes)</label>
        <input id="tache-duree" v-model.number="form.duree_defaut_min" class="field" type="number" min="30" max="1440" step="30" required />
      </div>
      <div v-else class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="tache-jours">Jours par semaine</label>
          <input id="tache-jours" v-model.number="form.cible_jours_semaine" class="field" type="number" min="0" max="7" required />
        </div>
        <div>
          <label class="label" for="tache-minutes">Minutes par jour</label>
          <input id="tache-minutes" v-model.number="form.cible_minutes_par_jour" class="field" type="number" min="0" max="1440" step="5" required />
        </div>
        <p class="col-span-2 -mt-1 text-xs text-ink-soft">0 = pas de cible. « Lire 2 h, 2 jours par semaine » : 2 jours et 120 minutes.</p>
      </div>

      <div>
        <label class="label" for="tache-rubrique">Rubrique</label>
        <select id="tache-rubrique" v-model="form.rubrique" class="field">
          <option value="">Sans rubrique</option>
          <option v-for="r in library.rubriques" :key="r.id" :value="r.id">{{ r.nom }}</option>
        </select>
      </div>

      <ColorPicker v-model="form.couleur" nom="tache-couleur" />

      <p v-if="erreur" class="message-erreur" role="alert">{{ erreur }}</p>
      <div class="flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" class="btn" @click="dialog?.close()">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="envoi">Enregistrer</button>
      </div>
    </form>
  </dialog>
</template>
