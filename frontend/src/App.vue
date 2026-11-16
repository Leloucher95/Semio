<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import AppToasts from './components/AppToasts.vue'
import { useAuth } from './stores/auth'

const auth = useAuth()
const route = useRoute()

// `sous` : préfixes d'URL qui appartiennent au même onglet (le suivi d'un autre jour reste « Aujourd'hui »).
// `trace` : pictogramme au trait (20 × 20) des onglets du téléphone.
const cadre = 'M4.5 4h11A1.5 1.5 0 0 1 17 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4ZM3 8h14M7 2v3M13 2v3'
const liens = [
  { to: '/aujourdhui', label: 'Aujourd’hui', sous: ['/aujourdhui', '/jour/'], trace: `${cadre}M7.5 12.5l1.8 1.8 3.2-3.6` },
  { to: '/planning', label: 'Mois', sous: ['/planning'], trace: `${cadre}M7 11h.01M10 11h.01M13 11h.01M7 14h.01M10 14h.01` },
  { to: '/semaine', label: 'Semaine type', sous: ['/semaine'], trace: 'M4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3ZM7.7 3v14M12.3 3v14M3 9h4.7M12.3 12H17' },
  { to: '/bibliotheque', label: 'Bibliothèque', sous: ['/bibliotheque'], trace: 'M4 5h12M4 10h12M4 15h8' },
  { to: '/profil', label: 'Profil', sous: ['/profil'], trace: 'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 17c.6-3.2 3-4.6 6-4.6s5.4 1.4 6 4.6' },
]
const actif = (lien: (typeof liens)[number]) => lien.sous.some((prefixe) => route.path.startsWith(prefixe))
</script>

<template>
  <div class="flex min-h-dvh flex-col print:block print:min-h-0">
    <header v-if="auth.connecte" class="border-b border-line print:hidden">
      <div class="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-8 gap-y-1 px-4 py-3 sm:px-6">
        <RouterLink to="/" class="font-serif text-2xl font-medium tracking-tight">Semio</RouterLink>
        <!-- Ordinateur : navigation en tête ; téléphone : onglets en bas d'écran. -->
        <nav aria-label="Navigation principale" class="hidden gap-1 md:flex">
          <RouterLink
            v-for="lien in liens" :key="lien.to" :to="lien.to"
            class="rounded px-3 py-2 text-sm font-medium hover:text-ink"
            :class="actif(lien) ? 'text-ink underline decoration-accent decoration-2 underline-offset-8' : 'text-ink-soft'"
            :aria-current="actif(lien) ? 'page' : undefined"
          >
            {{ lien.label }}
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-12 print:max-w-none print:p-0">
      <RouterView />
    </main>

    <!-- Cinq onglets de largeur égale : pictogramme + libellé sur une ligne, lisibles dès 360 px. -->
    <nav
      v-if="auth.connecte" aria-label="Navigation principale"
      class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line-strong bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <RouterLink
        v-for="lien in liens" :key="lien.to" :to="lien.to"
        class="flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-[3px] overflow-hidden border-l border-line px-0.5 text-[0.6875rem] leading-[0.875rem] whitespace-nowrap first:border-l-0"
        :class="actif(lien) ? 'bg-paper font-semibold text-ink shadow-[inset_0_3px_0_var(--color-accent)]' : 'font-medium text-ink-soft'"
        :aria-current="actif(lien) ? 'page' : undefined"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path :d="lien.trace" />
        </svg>
        {{ lien.label }}
      </RouterLink>
    </nav>

    <AppToasts />
  </div>
</template>
