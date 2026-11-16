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
const visible = ref(false)
const erreur = ref('')
const envoi = ref(false)

function choisir(mode: boolean) {
  inscription.value = mode
  erreur.value = ''
}

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
  <div class="mx-auto mt-[6vh] max-w-sm">
    <p class="eyebrow">Agenda de la semaine</p>
    <h1 class="mt-1 text-[3.5rem] leading-[3.75rem] tracking-[-0.03em]">Semio</h1>
    <p class="mt-3 border-t border-ink pt-3 font-serif text-lg text-ink-soft italic">
      Une semaine type, un mois à suivre, une case à cocher chaque jour.
    </p>

    <!-- Deux vrais boutons à bascule : le formulaire en dessous change de rôle, pas de page. -->
    <div class="mt-8 grid grid-cols-2 border-b border-line" role="group" aria-label="Accès">
      <button
        v-for="mode in [false, true]" :key="String(mode)" type="button"
        class="min-h-12 cursor-pointer px-2 text-[0.9375rem]"
        :class="inscription === mode ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]' : 'font-medium text-ink-soft'"
        :aria-pressed="inscription === mode" @click="choisir(mode)"
      >
        {{ mode ? 'Créer un compte' : 'J’ai un compte' }}
      </button>
    </div>

    <form class="mt-6 space-y-4" @submit.prevent="soumettre">
      <p v-if="erreur" class="message-erreur" role="alert">{{ erreur }}</p>
      <div>
        <label class="label" for="email">Adresse e-mail</label>
        <input id="email" v-model="email" class="field min-h-12" type="email" inputmode="email" autocomplete="email" required />
      </div>
      <div>
        <label class="label" for="password">Mot de passe</label>
        <div class="flex rounded border border-line-strong bg-card focus-within:border-ink">
          <input
            id="password" v-model="password" class="min-h-12 min-w-0 flex-1 rounded bg-transparent px-3 text-base"
            :type="visible ? 'text' : 'password'" required minlength="8"
            :autocomplete="inscription ? 'new-password' : 'current-password'"
            :aria-describedby="inscription ? 'password-aide' : undefined"
          />
          <button
            type="button" class="min-h-12 min-w-21 cursor-pointer border-l border-line px-3 text-sm font-medium text-ink-soft hover:text-ink"
            :aria-pressed="visible" aria-controls="password" @click="visible = !visible"
          >
            {{ visible ? 'Masquer' : 'Afficher' }}
          </button>
        </div>
        <p v-if="inscription" id="password-aide" class="mt-1 text-xs text-ink-soft">8 caractères minimum.</p>
      </div>
      <button class="btn btn-primary min-h-12 w-full text-base" type="submit" :disabled="envoi">
        {{ envoi ? 'Un instant…' : inscription ? 'Créer mon compte' : 'Se connecter' }}
      </button>
      <p class="text-[0.8125rem] leading-[1.125rem] text-ink-soft">
        {{ inscription
          ? 'Votre fuseau horaire par défaut se modifie ensuite dans Profil.'
          : 'Vos plannings ne sont visibles que depuis votre compte.' }}
      </p>
    </form>
  </div>
</template>
