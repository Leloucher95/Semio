import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { parseYmd, todayIn } from './lib/dates'
import { pb } from './lib/pb'
import { FUSEAU_DEFAUT } from './stores/auth'

/** Mois courant dans le fuseau du profil. */
function moisCourant() {
  const { annee, mois } = parseYmd(todayIn((pb.authStore.record?.timezone as string | undefined) || FUSEAU_DEFAUT))
  return `/planning/${annee}/${mois}`
}

/** Paramètres de mois valides (2000–2100, 1–12), sinon retour au mois courant. */
function moisValide(to: RouteLocationNormalized) {
  const annee = Number(to.params.annee)
  const mois = Number(to.params.mois)
  if (!(Number.isInteger(annee) && annee >= 2000 && annee <= 2100 && Number.isInteger(mois) && mois >= 1 && mois <= 12)) {
    return moisCourant()
  }
}
const propsMois = (to: RouteLocationNormalized) => ({ annee: Number(to.params.annee), mois: Number(to.params.mois) })

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/aujourdhui' },
    { path: '/connexion', name: 'connexion', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/aujourdhui', name: 'aujourdhui', component: () => import('./views/DayView.vue') },
    { path: '/jour/:date', name: 'jour', component: () => import('./views/DayView.vue'), props: true },
    { path: '/planning', redirect: moisCourant },
    { path: '/planning/:annee/:mois', name: 'mois', component: () => import('./views/MonthView.vue'), props: propsMois, beforeEnter: moisValide },
    { path: '/planning/:annee/:mois/semaine', name: 'semaine-du-mois', component: () => import('./views/PlanWeekView.vue'), props: propsMois, beforeEnter: moisValide },
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
