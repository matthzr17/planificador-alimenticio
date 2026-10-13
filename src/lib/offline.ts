// Funcionamiento sin señal.
//
// 1. Copia local: cada pantalla guarda en el teléfono lo último que cargó (menú, despensa, lista, precios,
//    catálogo). Si al abrir no hay conexión, se muestra esa copia.
// 2. Cola de cambios: sin señal, palomear la lista (o marcar un platillo) se guarda en una cola local
//    y se envía a Supabase en cuanto vuelve la conexión.
//
// Todo acceso a localStorage va protegido: si el navegador lo bloquea, la app sigue funcionando en línea.

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

const PREFIX = 'nutri:v1:'
const QUEUE_KEY = `${PREFIX}queue`

// ---------- copia local ----------

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* sin espacio o almacenamiento bloqueado: no pasa nada, solo no hay copia local */
  }
}

/** ¿El error es por falta de conexión (y no un error real de datos)? */
export function isNetworkError(message: string | null | undefined): boolean {
  if (isOffline()) return true
  return !!message && /failed to fetch|network|load failed|fetch failed|timed? ?out|internet/i.test(message)
}

// ---------- estado de conexión ----------

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** true si hay conexión; se actualiza solo. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => !isOffline(), () => true)
}

// ---------- cola de cambios pendientes ----------

type Table = 'shopping_list_items' | 'meal_plan_items'
export type PendingOp = { table: Table; id: string; changes: Record<string, unknown> }

const queueListeners = new Set<() => void>()
let queueSnapshot: PendingOp[] = readQueue()

function readQueue(): PendingOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as PendingOp[]
  } catch {
    return []
  }
}

function writeQueue(q: PendingOp[]) {
  queueSnapshot = q
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* ignorar */
  }
  queueListeners.forEach((l) => l())
}

/** Guarda un cambio para enviarlo después. Cambios al mismo renglón se combinan en uno. */
export function enqueue(op: PendingOp) {
  const q = [...queueSnapshot]
  const i = q.findIndex((x) => x.table === op.table && x.id === op.id)
  if (i >= 0) q[i] = { ...q[i], changes: { ...q[i].changes, ...op.changes } }
  else q.push(op)
  writeQueue(q)
}

/** Quita de la cola los cambios de renglones que ya no existen (p. ej. artículos borrados). */
export function dropPending(table: Table, ids: string[]) {
  writeQueue(queueSnapshot.filter((x) => !(x.table === table && ids.includes(x.id))))
}

/** Cambios pendientes aplicados sobre una lista de renglones (para mostrar lo que el usuario ya hizo). */
export function applyPending<T extends { id: string }>(table: Table, rows: T[]): T[] {
  const ops = queueSnapshot.filter((x) => x.table === table)
  if (!ops.length) return rows
  return rows.map((r) => {
    const op = ops.find((x) => x.id === r.id)
    return op ? ({ ...r, ...op.changes } as T) : r
  })
}

let flushing: Promise<number> | null = null

/** Envía la cola. Regresa cuántos cambios se enviaron. Se detiene al primer error de red. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    for (const op of [...queueSnapshot]) {
      if (isOffline()) break
      const { error } = await supabase.from(op.table).update(op.changes as never).eq('id', op.id)
      if (error && isNetworkError(error.message)) break
      // Enviado, o rechazado por la base (dato inválido): en ambos casos sale de la cola
      writeQueue(queueSnapshot.filter((x) => !(x.table === op.table && x.id === op.id)))
      if (!error) sent++
    }
    return sent
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export function usePendingCount() {
  return useSyncExternalStore(
    (cb) => {
      queueListeners.add(cb)
      return () => queueListeners.delete(cb)
    },
    () => queueSnapshot.length,
    () => 0,
  )
}

// Al volver la conexión, enviar lo pendiente
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushQueue()
  })
}
