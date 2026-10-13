import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheGet, cacheSet, isNetworkError } from '@/lib/offline'
import type { Tables, TablesInsert } from '@/lib/database.types'

export type InventoryItem = Tables<'inventory'>

async function fetchInventory(): Promise<{ items: InventoryItem[]; error: string | null }> {
  const { data, error } = await supabase.from('inventory').select('*')
  if (!error) return { items: data, error: null }
  const cached = cacheGet<InventoryItem[]>('inventory')
  if (cached && isNetworkError(error.message)) return { items: cached, error: null }
  return { items: [], error: error.message }
}

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await fetchInventory()
    if (r.error) setError(r.error)
    else setItems(r.items)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchInventory().then((r) => {
      if (cancelled) return
      if (r.error) setError(r.error)
      else setItems(r.items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // La copia local siempre refleja lo último que se ve en pantalla
  useEffect(() => {
    if (items) cacheSet('inventory', items)
  }, [items])

  /** Crea o reemplaza el registro de un ingrediente (uno por ingrediente). */
  const upsert = useCallback(async (row: Omit<TablesInsert<'inventory'>, 'user_id'>) => {
    const { data, error } = await supabase
      .from('inventory')
      .upsert(row, { onConflict: 'user_id,ingredient_id' })
      .select('*')
      .single()
    if (error) return error.message
    setItems((prev) => [...(prev ?? []).filter((i) => i.ingredient_id !== data.ingredient_id), data])
    return null
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('inventory').delete().eq('id', id)
    if (error) return error.message
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id))
    return null
  }, [])

  return { items, error, refresh, upsert, remove }
}
