import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/fraunces'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { useAuth } from './stores/auth'

const app = createApp(App).use(createPinia())

// Le profil (fuseau) doit être à jour avant le premier rendu d'« Aujourd'hui ».
useAuth().refresh().finally(() => app.use(router).mount('#app'))
