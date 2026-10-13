import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/database.types'
import type { ListLine } from '@/lib/shopping'

export type ShoppingList = Tables<'shopping_lists'>
export type ShoppingItem = Tables<'shopping_list_items'>
export type ProductPrice = Tables<'product_prices'>

type Loaded = { planId: string | null; list: ShoppingList | null; items: ShoppingItem[]; error: string | null }

async function fetchList(planId: string): Promise<Loaded> {
  const { data: list, error } = await supabase.from('shopping_lists').select('*').eq('meal_plan_id', planId).maybeSingle()
  if (error) return { planId, list: null, items: [], error: error.message }
  if (!list) return { planId, list: null, items: [], error: null }
  const its = await supabase.from('shopping_list_items').select('*').eq('list_id', list.id)
  return { planId, list, items: its.data ?? [], error: its.error?.message ?? null }
}

/** Lista de compras ligada a un plan semanal. */
export function useShoppingList(planId: string | null) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    fetchList(planId).then((r) => !cancelled && setState(r))
    return () => {
      cancelled = true
    }
  }, [planId])

  const current = planId && state?.planId === planId ? state : null

  async function ensureList(): Promise<ShoppingList | string> {
    if (current?.list) return current.list
    const { data, error } = await supabase.from('shopping_lists').insert({ meal_plan_id: planId, name: 'Lista semanal' }).select('*').single()
    return error ? error.message : data
  }

  /**
   * Sincroniza con lo que pide el menú: agrega o ajusta lo que falta, quita lo que ya no se necesita.
   * Respeta lo que ya está palomeado y lo que se agregó a mano.
   */
  const sync = useCallback(
    async (lines: ListLine[]) => {
      if (!planId) return 'Sin plan'
      const list = await ensureList()
      if (typeof list === 'string') return list
      const existing = current?.items ?? []
      const keep = new Set(existing.filter((i) => i.is_checked || i.is_manual).map((i) => i.ingredient_id))
      const wanted = new Set(lines.map((l) => l.ingredient_id))

      const stale = existing.filter((i) => !i.is_checked && !i.is_manual && !wanted.has(i.ingredient_id)).map((i) => i.id)
      if (stale.length) {
        const { error } = await supabase.from('shopping_list_items').delete().in('id', stale)
        if (error) return error.message
      }
      const rows = lines
        .filter((l) => !keep.has(l.ingredient_id))
        .map((l) => ({ list_id: list.id, ingredient_id: l.ingredient_id, quantity: l.quantity, unit: l.unit }))
      if (rows.length) {
        const { error } = await supabase.from('shopping_list_items').upsert(rows, { onConflict: 'list_id,ingredient_id' })
        if (error) return error.message
      }
      setState(await fetchList(planId))
      return null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, current],
  )

  const update = useCallback(async (item: ShoppingItem, changes: Partial<Pick<ShoppingItem, 'is_checked' | 'quantity' | 'unit' | 'product_price_id'>>) => {
    const put = (v: ShoppingItem) => setState((s) => (s ? { ...s, items: s.items.map((i) => (i.id === item.id ? v : i)) } : s))
    put({ ...item, ...changes })
    const { error } = await supabase.from('shopping_list_items').update(changes).eq('id', item.id)
    if (error) {
      put(item)
      return error.message
    }
    return null
  }, [])

  const addManual = useCallback(
    async (row: Omit<TablesInsert<'shopping_list_items'>, 'list_id'>) => {
      const list = await ensureList()
      if (typeof list === 'string') return list
      const { error } = await supabase
        .from('shopping_list_items')
        .upsert({ ...row, list_id: list.id, is_manual: true }, { onConflict: 'list_id,ingredient_id' })
      if (error) return error.message
      setState(await fetchList(planId!))
      return null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planId, current],
  )

  const removeItems = useCallback(async (ids: string[]) => {
    if (!ids.length) return null
    const { error } = await supabase.from('shopping_list_items').delete().in('id', ids)
    if (error) return error.message
    setState((s) => (s ? { ...s, items: s.items.filter((i) => !ids.includes(i.id)) } : s))
    return null
  }, [])

  return {
    list: current?.list ?? null,
    items: current?.items ?? [],
    loading: !!planId && !current,
    error: current?.error ?? null,
    sync,
    update,
    addManual,
    removeItems,
  }
}

/** Precios capturados por el usuario (todas las tiendas). */
export function usePrices() {
  const [prices, setPrices] = useState<ProductPrice[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('product_prices')
      .select('*')
      .order('observed_on', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setPrices(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const add = useCallback(async (row: Omit<TablesInsert<'product_prices'>, 'user_id'>) => {
    const { data, error } = await supabase.from('product_prices').insert(row).select('*').single()
    if (error) return error.message
    setPrices((p) => [data, ...(p ?? [])])
    return null
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('product_prices').delete().eq('id', id)
    if (error) return error.message
    setPrices((p) => (p ?? []).filter((x) => x.id !== id))
    return null
  }, [])

  return { prices, error, add, remove }
}
