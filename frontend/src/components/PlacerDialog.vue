<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { formatMin, JOURS } from '../lib/dates'
import { PAS } from '../lib/grid'
import type { Creneau } from '../lib/types'

/**
 * Alternative au glisser-déposer : place ou modifie un créneau au clavier ou au doigt.
 * Création : une tâche, un ou plusieurs jours. Modification : un bloc existant (déplacer, étirer, supprimer).
 */
defineProps<{ taches: { id: string; nom: string }[] }>()
const emit = defineEmits<{
  placer: [tache: string, creneaux: Creneau[]]
  modifier: [id: string, cible: Creneau]
  retirer: [id: string]
}>()

const dialog = ref<HTMLDialogElement>()
const form = reactive({ id: '', titre: '', tache: '', jours: [] as number[], debut: 480, fin: 540 })

const HORAIRES = Array.from({ length: 1440 / PAS + 1 }, (_, i) => i * PAS)
const erreur = computed(() => {
  if (form.fin <= form.debut) return 'L’heure de fin doit suivre l’heure de début.'
  if (!form.jours.length) return 'Choisissez au moins un jour.'
  return ''
})

function ouvrir(options: { tache?: string; duree?: number; bloc?: Creneau & { id: string; titre: string } }) {
  const { bloc } = options
  Object.assign(form, bloc
    ? { id: bloc.id, titre: bloc.titre, tache: '', jours: [bloc.jour_semaine], debut: bloc.debut_min, fin: bloc.fin_min }
    : { id: '', titre: '', tache: options.tache ?? '', jours: [], debut: 480, fin: Math.min(480 + (options.duree || 60), 1440) })
  dialog.value?.showModal()
}
defineExpose({ ouvrir })

function valider() {
  if (erreur.value) return
  const creneaux = [...form.jours].sort().map((jour_semaine) => ({ jour_semaine, debut_min: form.debut, fin_min: form.fin }))
  if (form.id) emit('modifier', form.id, creneaux[0]!)
  else emit('placer', form.tache, creneaux)
  dialog.value?.close()
}

function retirer() {
  emit('retirer', form.id)
  dialog.value?.close()
}
</script>

<template>
  <dialog ref="dialog" class="sheet w-[min(30rem,calc(100vw-2rem))] p-0" aria-labelledby="placer-titre">
    <form class="space-y-4 p-5" @submit.prevent="valider">
      <h2 id="placer-titre" class="text-[1.375rem] leading-7">{{ form.id ? form.titre : 'Placer une tâche' }}</h2>

      <div v-if="!form.id">
        <label class="label" for="placer-tache">Tâche</label>
        <select id="placer-tache" v-model="form.tache" class="field" required>
          <option value="" disabled>Choisir…</option>
          <option v-for="t in taches" :key="t.id" :value="t.id">{{ t.nom }}</option>
        </select>
      </div>

      <fieldset>
        <legend class="label">{{ form.id ? 'Jour' : 'Jours' }}</legend>
        <div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
          <label
            v-for="j in JOURS" :key="j.iso"
            class="btn px-1 capitalize has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <!-- Modification : un seul jour (radio). Création : plusieurs jours d'un coup (cases). -->
            <input v-if="form.id" v-model="form.jours[0]" class="sr-only" type="radio" name="placer-jour" :value="j.iso" />
            <input v-else v-model="form.jours" class="sr-only" type="checkbox" :value="j.iso" />
            <span aria-hidden="true">{{ j.court }}</span><span class="sr-only">{{ j.long }}</span>
          </label>
        </div>
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="placer-debut">Début</label>
          <select id="placer-debut" v-model.number="form.debut" class="field tabular-nums">
            <option v-for="m in HORAIRES.slice(0, -1)" :key="m" :value="m">{{ formatMin(m) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="placer-fin">Fin</label>
          <select id="placer-fin" v-model.number="form.fin" class="field tabular-nums">
            <option v-for="m in HORAIRES.slice(1)" :key="m" :value="m">{{ formatMin(m) }}</option>
          </select>
        </div>
      </div>
      <p v-if="erreur" class="message-erreur" role="alert">{{ erreur }}</p>

      <div class="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button v-if="form.id" type="button" class="btn btn-danger mr-auto" @click="retirer">Retirer du planning</button>
        <button type="button" class="btn" @click="dialog?.close()">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="!!erreur">{{ form.id ? 'Enregistrer' : 'Placer' }}</button>
      </div>
    </form>
  </dialog>
</template>
