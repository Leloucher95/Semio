<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ClientResponseError } from 'pocketbase'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const router = useRouter()

const inscription = ref(false)
const email = ref('')
const password = ref('')
const erreur = ref('')
const envoi = ref(false)

async function soumettre() {
  erreur.value = ''
  envoi.value = true
  try {
    if (inscription.value) await auth.signup(email.value.trim(), password.value)
    else await auth.login(email.value.trim(), password.value)
    await router.replace('/')
  } catch (e) {
    const status = e instanceof ClientResponseError ? e.status : -1
    if (status === 0) erreur.value = 'Serveur injoignable. Vérifiez votre connexion.'
    else if (inscription.value) erreur.value = 'Inscription impossible : adresse déjà utilisée ou invalide, ou mot de passe trop court (8 caractères minimum).'
    else erreur.value = 'Adresse e-mail ou mot de passe incorrect.'
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="mx-auto mt-[8vh] max-w-sm">
    <p class="eyebrow">Planning hebdomadaire</p>
    <h1 class="mt-1 text-5xl">Semio</h1>
    <p class="mt-2 text-ink-soft">La semaine prend forme.</p>

    <form class="sheet mt-8 space-y-4 p-5" @submit.prevent="soumettre">
      <h2 class="text-xl">{{ inscription ? 'Créer un compte' : 'Connexion' }}</h2>
      <div>
        <label class="label" for="email">Adresse e-mail</label>
        <input id="email" v-model="email" class="field" type="email" autocomplete="email" required />
      </div>
      <div>
        <label class="label" for="password">Mot de passe</label>
        <input
          id="password" v-model="password" class="field" type="password" required minlength="8"
          :autocomplete="inscription ? 'new-password' : 'current-password'"
        />
        <p v-if="inscription" class="mt-1 text-xs text-ink-soft">8 caractères minimum.</p>
      </div>
      <p v-if="erreur" class="text-sm text-danger" role="alert">{{ erreur }}</p>
      <button class="btn btn-primary w-full" type="submit" :disabled="envoi">
        {{ envoi ? 'Un instant…' : inscription ? 'Créer mon compte' : 'Se connecter' }}
      </button>
    </form>

    <button type="button" class="btn btn-quiet mt-3 w-full" @click="inscription = !inscription; erreur = ''">
      {{ inscription ? 'J’ai déjà un compte' : 'Pas encore de compte ? S’inscrire' }}
    </button>
  </div>
</template>
