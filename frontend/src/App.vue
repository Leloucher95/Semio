<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppToasts from './components/AppToasts.vue'
import { useAuth } from './stores/auth'

const auth = useAuth()
const route = useRoute()

// `sous` : préfixes d'URL qui appartiennent au même onglet (le suivi d'un autre jour reste « Aujourd'hui »).
const liens = [
  { to: '/aujourdhui', label: 'Aujourd’hui', sous: ['/aujourdhui', '/jour/'] },
  { to: '/planning', label: 'Mois', sous: ['/planning'] },
  { to: '/semaine', label: 'Semaine type', sous: ['/semaine'] },
  { to: '/bibliotheque', label: 'Bibliothèque', sous: ['/bibliotheque'] },
  { to: '/profil', label: 'Profil', sous: ['/profil'] },
]
const actif = (lien: (typeof liens)[number]) => lien.sous.some((prefixe) => route.path.startsWith(prefixe))
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header v-if="auth.connecte" class="border-b border-line print:hidden">
      <div class="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3 sm:px-6">
        <RouterLink to="/" class="font-serif text-2xl tracking-tight">Semio</RouterLink>
        <!-- Ordinateur : navigation en tête ; téléphone : onglets en bas d'écran. -->
        <nav aria-label="Navigation principale" class="hidden gap-1 md:flex">
          <RouterLink
            v-for="lien in liens" :key="lien.to" :to="lien.to"
            class="rounded-md px-3 py-2 text-sm font-medium hover:text-ink"
            :class="actif(lien) ? 'text-ink underline decoration-accent decoration-2 underline-offset-8' : 'text-ink-soft'"
            :aria-current="actif(lien) ? 'page' : undefined"
          >
            {{ lien.label }}
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-10 print:max-w-none print:p-0">
      <RouterView />
    </main>

    <nav
      v-if="auth.connecte" aria-label="Navigation principale"
      class="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card md:hidden print:hidden"
    >
      <RouterLink
        v-for="lien in liens" :key="lien.to" :to="lien.to"
        class="flex min-h-14 flex-1 items-center justify-center px-1 text-center text-xs font-medium"
        :class="actif(lien) ? 'text-ink shadow-[inset_0_2px_0_var(--color-accent)]' : 'text-ink-soft'"
        :aria-current="actif(lien) ? 'page' : undefined"
      >
        {{ lien.label }}
      </RouterLink>
    </nav>

    <AppToasts />
  </div>
</template>
