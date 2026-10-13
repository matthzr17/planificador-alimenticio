import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/database.types'

export type InventoryItem = Tables<'inventory'>

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('inventory').select('*')
    if (error) setError(error.message)
    else setItems(data)
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('inventory')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setItems(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
