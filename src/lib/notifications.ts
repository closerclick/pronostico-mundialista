// Web Push (notificaciones) para el pronosticador. Reusa el transporte del
// ecosistema: el usuario opta por recibir un "timbre" cuando le llega algo a su
// cola offline del proxy estando la app cerrada (p.ej. una invitación a sala o
// el pronóstico de un miembro vía `sendByPubkey`).
//
// El timbre NO transporta contenido; el Service Worker (closer-click-push-sw.js,
// inyectado en el SW de Workbox vía importScripts) despierta, la app reconecta e
// `identify()` drena la cola cifrada. La subscription se liga a la MISMA pubkey
// del vault usada en identify, con un sobre firmado por el vault.

import { ref, computed } from 'vue'
import { getProxyClient } from './connection'
import { getIdentity } from './identity'

const LS_KEY = 'mundial_push_enabled'

const enabled = ref(localStorage.getItem(LS_KEY) === '1')
const permission = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'default'
)
const busy = ref(false)
const error = ref('')

const supported = computed(() =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
)

async function vaultPubkeyAndSign () {
  const id = await getIdentity()
  const publicKey = id?.me?.publickey
  if (!id || !publicKey) throw new Error('Vault de identidad no disponible')
  return { publicKey, sign: (d: unknown) => id.signData(d) }
}

async function enable (): Promise<boolean> {
  error.value = ''
  if (!supported.value) { error.value = 'Tu navegador no soporta notificaciones push'; return false }
  busy.value = true
  try {
    const perm = await Notification.requestPermission()
    permission.value = perm
    if (perm !== 'granted') { error.value = 'Permiso de notificaciones denegado'; return false }
    const { publicKey, sign } = await vaultPubkeyAndSign()
    // Sin swPath: reutiliza el SW de la PWA (handler inyectado vía importScripts).
    await getProxyClient().enablePush({ publicKey, sign })
    enabled.value = true
    localStorage.setItem(LS_KEY, '1')
    return true
  } catch (e) {
    error.value = (e as Error)?.message || String(e)
    return false
  } finally {
    busy.value = false
  }
}

async function disable (): Promise<boolean> {
  error.value = ''
  busy.value = true
  try {
    let publicKey: string | undefined
    let sign: ((d: unknown) => Promise<{ signature: string }>) | undefined
    try { ({ publicKey, sign } = await vaultPubkeyAndSign()) } catch { /* igual cancelamos local */ }
    await getProxyClient().disablePush({ publicKey: publicKey as string, sign: sign as never })
    enabled.value = false
    localStorage.removeItem(LS_KEY)
    return true
  } catch (e) {
    error.value = (e as Error)?.message || String(e)
    return false
  } finally {
    busy.value = false
  }
}

// Re-registra la subscription tras cada identify (los endpoints pueden rotar).
// Silencioso: si el usuario no optó o el permiso no está, no hace nada.
async function ensureSubscribed (): Promise<void> {
  if (!enabled.value || !supported.value) return
  if (typeof Notification !== 'undefined') permission.value = Notification.permission
  if (permission.value !== 'granted') return
  try {
    const { publicKey, sign } = await vaultPubkeyAndSign()
    await getProxyClient().enablePush({ publicKey, sign })
  } catch (e) {
    console.warn('[push] ensureSubscribed falló:', (e as Error)?.message || e)
  }
}

export function useNotifications () {
  return { supported, enabled, permission, busy, error, enable, disable, ensureSubscribed }
}

// Acceso directo (no-componente) para hooks como connection.identifyWithVault.
export { ensureSubscribed }
