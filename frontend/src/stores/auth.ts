import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { pb } from '../lib/pb'

export const FUSEAU_DEFAUT = 'Africa/Porto-Novo'

export const useAuth = defineStore('auth', () => {
  const user = ref(pb.authStore.record)
  pb.authStore.onChange(() => {
    user.value = pb.authStore.record
  })

  const connecte = computed(() => user.value !== null)
  /** Fuseau IANA du profil : c'est lui, pas celui du navigateur, qui définit « aujourd'hui ». */
  const timezone = computed(() => (user.value?.timezone as string | undefined) || FUSEAU_DEFAUT)

  async function login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password)
  }

  async function signup(email: string, password: string) {
    await pb.collection('users').create({ email, password, passwordConfirm: password })
    await login(email, password)
  }

  /** Recharge le profil au démarrage ; un token refusé ferme la session. */
  async function refresh() {
    if (!pb.authStore.isValid) return
    try {
      await pb.collection('users').authRefresh()
    } catch {
      pb.authStore.clear()
    }
  }

  async function setTimezone(timezone: string) {
    if (!user.value) return
    // Le SDK répercute la mise à jour du compte connecté dans authStore.
    await pb.collection('users').update(user.value.id, { timezone })
  }

  function logout() {
    pb.authStore.clear()
    // Rechargement complet : aucune donnée du compte précédent ne reste dans les stores.
    window.location.assign('/connexion')
  }

  return { user, connecte, timezone, login, signup, refresh, setTimezone, logout }
})
