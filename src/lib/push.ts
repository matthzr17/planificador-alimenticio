// Avisos de caducidad por notificación (Web Push).
// En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más reciente).
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = 'BEkQU75Xo7Axqbg8ozVVzGYJ8qUlNAGgp4QSTPg3D5iUADUp44HJGB6qBRjNYsTei8iTrct4zvdDJF7LAOcuFrk'

export type PushStatus = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushStatus(): Promise<PushStatus> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Pide permiso, suscribe este teléfono y lo registra en Supabase. Regresa un mensaje de error o null. */
export async function enablePush(): Promise<string | null> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'No se dio permiso para notificaciones.'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' })
  return error ? error.message : null
}

export async function disablePush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
  return error ? error.message : null
}

/** Manda un aviso de prueba a tus teléfonos (con lo que caduca hoy si hay algo). */
export async function testPush(): Promise<string | null> {
  const { error } = await supabase.functions.invoke('avisos-caducidad', { body: { test: true } })
  return error ? error.message : null
}
