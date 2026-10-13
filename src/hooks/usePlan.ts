import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'
import type { PlanItem } from '@/lib/planner'

export type MealPlan = Tables<'meal_plans'>
export type MealPlanItem = Tables<'meal_plan_items'>

type Loaded = { week: string; plan: MealPlan | null; items: MealPlanItem[]; error: string | null }

async function fetchWeek(week: string): Promise<Loaded> {
  const { data: plan, error } = await supabase.from('meal_plans').select('*').eq('week_start', week).maybeSingle()
  if (error) return { week, plan: null, items: [], error: error.message }
  if (!plan) return { week, plan: null, items: [], error: null }
  const its = await supabase.from('meal_plan_items').select('*').eq('meal_plan_id', plan.id)
  return { week, plan, items: its.data ?? [], error: its.error?.message ?? null }
}

/** Plan de una semana (identificada por la fecha de su lunes, AAAA-MM-DD). */
export function usePlan(weekStart: string) {
  const [state, setState] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWeek(weekStart).then((r) => !cancelled && setState(r))
    return () => {
      cancelled = true
    }
  }, [weekStart])

  // Mientras llega la semana pedida, no se muestran datos de otra semana
  const current = state?.week === weekStart ? state : null

  /** Guarda un plan nuevo para la semana, reemplazando el anterior. */
  const replace = useCallback(
    async (newItems: PlanItem[], targetKcal: number) => {
      const { data: plan, error: e1 } = await supabase
        .from('meal_plans')
        .upsert({ week_start: weekStart, target_kcal: targetKcal, status: 'active' }, { onConflict: 'user_id,week_start' })
        .select('*')
        .single()
      if (e1) return e1.message
      const { error: e2 } = await supabase.from('meal_plan_items').delete().eq('meal_plan_id', plan.id)
      if (e2) return e2.message
      const { data: items, error: e3 } = await supabase
        .from('meal_plan_items')
        .insert(newItems.map((it) => ({ ...it, meal_plan_id: plan.id })))
        .select('*')
      if (e3) return e3.message
      setState({ week: weekStart, plan, items, error: null })
      return null
    },
    [weekStart],
  )

  /** Cambia un platillo. Recibe el platillo actual para poder revertir si falla. */
  const updateItem = useCallback(async (item: MealPlanItem, changes: Partial<Pick<MealPlanItem, 'recipe_id' | 'servings' | 'is_done'>>) => {
    const put = (value: MealPlanItem) =>
      setState((s) => (s ? { ...s, items: s.items.map((it) => (it.id === item.id ? value : it)) } : s))
    put({ ...item, ...changes }) // optimista: la UI responde al instante
    const { error } = await supabase.from('meal_plan_items').update(changes).eq('id', item.id)
    if (error) {
      put(item)
      return error.message
    }
    return null
  }, [])

  return {
    plan: current?.plan ?? null,
    items: current?.items ?? [],
    loading: !current,
    error: current?.error ?? null,
    replace,
    updateItem,
  }
}
