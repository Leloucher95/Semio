<script setup lang="ts">
import { COULEURS } from '../lib/taches'

const couleur = defineModel<string>({ required: true })
defineProps<{ nom: string }>()
</script>

<template>
  <!-- Vrais boutons radio : navigables aux flèches, nom de couleur lu par les lecteurs d'écran. -->
  <fieldset>
    <legend class="label">Couleur</legend>
    <div class="flex flex-wrap gap-2">
      <label v-for="c in COULEURS" :key="c.hex" class="relative cursor-pointer" :title="c.nom">
        <input v-model="couleur" class="peer sr-only" type="radio" :name="nom" :value="c.hex" />
        <span
          class="block size-9 rounded-full border-2 border-card ring-1 ring-line peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
          :style="{ background: c.hex }"
        />
        <span class="sr-only">{{ c.nom }}</span>
      </label>
    </div>
  </fieldset>
</template>
