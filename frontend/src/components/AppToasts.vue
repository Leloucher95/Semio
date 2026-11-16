<script setup lang="ts">
import { useToasts } from '../stores/toasts'

const toasts = useToasts()
</script>

<template>
  <!-- aria-live : les lecteurs d'écran annoncent réussites et retours arrière. -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 print:hidden"
    role="status" aria-live="polite"
  >
    <div
      v-for="t in toasts.liste" :key="t.id"
      class="pointer-events-auto flex max-w-md items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-md"
      :class="t.erreur ? 'border-danger bg-danger text-white' : 'border-ink bg-ink text-paper'"
    >
      <span>{{ t.message }}</span>
      <button type="button" class="-my-1 -mr-2 min-h-8 px-2 opacity-80 hover:opacity-100" aria-label="Fermer" @click="toasts.fermer(t.id)">✕</button>
    </div>
  </div>
</template>
