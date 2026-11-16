<script setup lang="ts">
import { computed, ref } from 'vue'
import { dateLabel, todayIn } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { FUSEAU_DEFAUT, useAuth } from '../stores/auth'
import { useToasts } from '../stores/toasts'

const auth = useAuth()
const toasts = useToasts()

// Le fuseau courant et le défaut restent proposés même si le navigateur ne liste que les noms canoniques.
const fuseaux = [...new Set([auth.timezone, FUSEAU_DEFAUT, ...Intl.supportedValuesOf('timeZone')])].sort()
const choix = ref(auth.timezone)
const envoi = ref(false)
const aujourdhui = computed(() => dateLabel(todayIn(choix.value)))

async function enregistrer() {
  envoi.value = true
  try {
    await auth.setTimezone(choix.value)
    toasts.ok('Fuseau horaire enregistré.')
  } catch (e) {
    choix.value = auth.timezone
    toasts.erreur(messageErreur(e, 'Le fuseau n’a pas pu être enregistré.'))
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="max-w-xl">
    <p class="eyebrow">Compte</p>
    <h1 class="mt-1 text-3xl">Profil</h1>
    <p class="mt-2 text-ink-soft">{{ auth.user?.email }}</p>

    <form class="sheet mt-6 space-y-3 p-5" @submit.prevent="enregistrer">
      <div>
        <label class="label" for="fuseau">Fuseau horaire</label>
        <select id="fuseau" v-model="choix" class="field">
          <option v-for="f in fuseaux" :key="f" :value="f">{{ f }}</option>
        </select>
        <p class="mt-2 text-sm text-ink-soft">Dans ce fuseau, nous sommes le <strong class="text-ink">{{ aujourdhui }}</strong>.</p>
      </div>
      <button class="btn btn-primary" type="submit" :disabled="envoi || choix === auth.timezone">Enregistrer</button>
    </form>

    <button type="button" class="btn mt-8" @click="auth.logout()">Se déconnecter</button>
  </div>
</template>
