import { createRouter, createWebHistory } from 'vue-router'
import { pb } from './lib/pb'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/bibliotheque' },
    { path: '/connexion', name: 'connexion', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/semaine', name: 'semaine', component: () => import('./views/ModelView.vue') },
    { path: '/bibliotheque', name: 'bibliotheque', component: () => import('./views/LibraryView.vue') },
    { path: '/profil', name: 'profil', component: () => import('./views/ProfileView.vue') },
    { path: '/:inconnu(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const connecte = pb.authStore.isValid
  if (!connecte && !to.meta.public) return { name: 'connexion' }
  if (connecte && to.meta.public) return '/'
})
