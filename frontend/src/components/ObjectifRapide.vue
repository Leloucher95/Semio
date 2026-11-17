<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { existante } from '../lib/creation'
import { messageErreur } from '../lib/pb'
import { cibleLabel, COULEURS } from '../lib/taches'
import { useLibrary } from '../stores/library'
import { useModeles } from '../stores/modeles'
import { useToasts } from '../stores/toasts'

/**
 * Objectif sans horaire (« Lire — 30 minutes par jour ») : créé dans la bibliothèque et ajouté à la semaine type
 * en une transaction serveur, sans créneau. Il pourra être placé plus tard depuis la liste.
 */
const library = useLibrary()
const modeles = useModeles()
const toasts = useToasts()

const dialog = ref<HTMLDialogElement>()
const champ = ref<HTMLInputElement>()
const form = reactive({ nom: '', jours: '' as number | '', minutes: '' as number | '', rubrique: '', envoi: false, erreur: '' })

const reutilisee = computed(() => existante(library.actives, form.nom))
const resume = computed(() => cibleLabel(Number(form.jours) || 0, Number(form.minutes) || 0))

function ouvrir() {
  Object.assign(form, { nom: '', jours: '', minutes: '', rubrique: '', envoi: false, erreur: '' })
  dialog.value?.showModal()
  nextTick(() => champ.value?.focus())
}
defineExpose({ ouvrir })

async function ajouter() {
  const nom = form.nom.trim()
  if (!nom || form.envoi) return
  form.envoi = true
  form.erreur = ''
  try {
    const tache = await modeles.ajoutRapide(
      reutilisee.value
        ? { tache: reutilisee.value.id, creneaux: [] }
        : {
            creneaux: [],
            nouvelle: {
              nom, type: 'objectif', rubrique: form.rubrique,
              cible_jours_semaine: Number(form.jours) || 0, cible_minutes_par_jour: Number(form.minutes) || 0,
              couleur: library.rubriqueParId.get(form.rubrique)?.couleur || COULEURS[library.taches.length % COULEURS.length]!.hex,
            },
          },
    )
    library.integrer(tache)
    dialog.value?.close()
    toasts.ok(`Objectif « ${tache.nom} » ajouté à cette semaine, sans horaire.`)
  } catch (e) {
    form.erreur = messageErreur(e, 'L’objectif n’a pas pu être ajouté : rien n’a été créé.')
  } finally {
    form.envoi = false
  }
}
</script>

<template>
  <dialog
    ref="dialog" aria-labelledby="objectif-titre"
    class="sheet max-h-[calc(100dvh-1.5rem)] w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto p-0 max-sm:mt-3 max-sm:mb-auto"
  >
    <form class="space-y-4 p-5" @submit.prevent="ajouter">
      <div>
        <p class="eyebrow">Sans horaire fixe</p>
        <h2 id="objectif-titre" class="mt-0.5 text-[1.375rem] leading-7">Ajouter un objectif</h2>
      </div>

      <div>
        <label class="label" for="objectif-nom">Nom de l’objectif</label>
        <input id="objectif-nom" ref="champ" v-model="form.nom" class="field min-h-12" required maxlength="120" autocomplete="off" placeholder="Lire, exercices, révisions…" />
        <p v-if="reutilisee" class="mt-1.5 text-xs text-ink-soft" aria-live="polite">
          « {{ reutilisee.nom }} » existe déjà dans votre bibliothèque : il sera ajouté à cette semaine tel quel, sans doublon.
        </p>
      </div>

      <template v-if="!reutilisee">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="objectif-jours">Jours par semaine</label>
            <input id="objectif-jours" v-model.number="form.jours" class="field" type="number" inputmode="numeric" min="0" max="7" placeholder="facultatif" />
          </div>
          <div>
            <label class="label" for="objectif-minutes">Minutes par jour</label>
            <input id="objectif-minutes" v-model.number="form.minutes" class="field" type="number" inputmode="numeric" min="0" max="1440" step="5" placeholder="facultatif" />
          </div>
        </div>
        <div v-if="library.rubriques.length">
          <label class="label" for="objectif-rubrique">Rubrique</label>
          <select id="objectif-rubrique" v-model="form.rubrique" class="field">
            <option value="">Sans rubrique</option>
            <option v-for="r in library.rubriques" :key="r.id" :value="r.id">{{ r.nom }}</option>
          </select>
        </div>
        <p class="text-sm text-ink-soft" aria-live="polite">
          {{ resume ? `Objectif : ${resume}.` : 'Sans cible : une simple case à cocher les jours où vous le faites.' }}
        </p>
      </template>

      <p v-if="form.erreur" class="message-erreur" role="alert">{{ form.erreur }}</p>
      <div class="flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" class="btn" @click="dialog?.close()">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="!form.nom.trim() || form.envoi">{{ form.envoi ? 'Ajout…' : 'Ajouter l’objectif' }}</button>
      </div>
    </form>
  </dialog>
</template>
