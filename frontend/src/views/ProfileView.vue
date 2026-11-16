<script setup lang="ts">
import { computed, ref } from 'vue'
import { dateLabel, todayIn } from '../lib/dates'
import { messageErreur } from '../lib/pb'
import { FUSEAU_DEFAUT, useAuth } from '../stores/auth'
import { useToasts } from '../stores/toasts'

const auth = useAuth()
const toasts = useToasts()

// Liste IANA complète du navigateur ; le fuseau courant et le défaut restent proposés même s'il ne liste que les noms canoniques.
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
  <div class="mx-auto max-w-xl">
    <div class="entete">
      <div>
        <p class="eyebrow">Votre compte</p>
        <h1 class="mt-1 text-[2rem] leading-[2.375rem]">Profil</h1>
      </div>
    </div>

    <section class="border-b border-line py-5" aria-labelledby="profil-compte">
      <h2 id="profil-compte" class="text-lg">Compte</h2>
      <p class="mt-2 text-xs text-ink-soft">Adresse e-mail</p>
      <p class="font-medium wrap-anywhere">{{ auth.user?.email }}</p>
    </section>

    <section class="border-b border-line py-5">
      <h2 class="text-lg">Fuseau horaire</h2>
      <p class="mt-1 text-sm text-ink-soft">Il décide du jour considéré comme « aujourd’hui » dans votre suivi.</p>
      <form class="mt-3 space-y-3" @submit.prevent="enregistrer">
        <div>
          <label class="label" for="fuseau">Votre fuseau horaire</label>
          <select id="fuseau" v-model="choix" class="field min-h-12">
            <option v-for="f in fuseaux" :key="f" :value="f">{{ f.replaceAll('_', ' ') }}</option>
          </select>
        </div>
        <div class="sheet p-3">
          <p class="text-xs text-ink-soft">Dans ce fuseau, nous sommes le</p>
          <p class="mt-0.5 font-serif text-xl first-letter:uppercase" aria-live="polite">{{ aujourdhui }}</p>
        </div>
        <button class="btn btn-primary min-h-12 w-full text-base sm:w-auto" type="submit" :disabled="envoi || choix === auth.timezone">
          Enregistrer le fuseau
        </button>
      </form>
    </section>

    <section class="py-5" aria-labelledby="profil-session">
      <h2 id="profil-session" class="text-lg">Session</h2>
      <p class="mt-1 text-sm text-ink-soft">Vos plannings restent enregistrés ; vous les retrouverez à la prochaine connexion.</p>
      <button type="button" class="btn mt-3 min-h-12 w-full text-base sm:w-auto" @click="auth.logout()">Se déconnecter</button>
    </section>
  </div>
</template>
