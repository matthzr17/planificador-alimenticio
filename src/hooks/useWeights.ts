import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'
import { cacheGet, cacheSet, isNetworkError } from '@/lib/offline'

export type WeightEntry = Tables<'weight_logs'>

const sortByDate = (rows: WeightEntry[]) => [...rows].sort((a, b) => a.logged_on.localeCompare(b.logged_on))

export function useWeights() {
  const [logs, setLogs] = useState<WeightEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('weight_logs')
      .select('*')
      .order('logged_on')
      .then(({ data, error }) => {
        if (cancelled) return
        const cached = error ? cacheGet<WeightEntry[]>('weights') : null
        if (error && cached && isNetworkError(error.message)) setLogs(cached)
        else if (error) setError(error.message)
        else setLogs(data)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (logs) cacheSet('weights', logs)
  }, [logs])

  /** Registra (o corrige) el peso de un día. */
  const save = useCallback(async (loggedOn: string, weightKg: number) => {
    const { data, error } = await supabase
      .from('weight_logs')
      .upsert({ logged_on: loggedOn, weight_kg: weightKg }, { onConflict: 'user_id,logged_on' })
      .select('*')
      .single()
    if (error) return isNetworkError(error.message) ? 'Necesitas conexión para registrar tu peso.' : error.message
    setLogs((prev) => sortByDate([...(prev ?? []).filter((l) => l.logged_on !== data.logged_on), data]))
    return null
  }, [])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('weight_logs').delete().eq('id', id)
    if (error) return error.message
    setLogs((prev) => (prev ?? []).filter((l) => l.id !== id))
    return null
  }, [])

  return { logs, error, save, remove }
}
