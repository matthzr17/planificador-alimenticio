import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesUpdate } from '@/lib/database.types'
import { useAuth } from '@/auth/AuthProvider'

export type Profile = Tables<'profiles'>

export function useProfile() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setProfile(data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const save = useCallback(
    async (changes: TablesUpdate<'profiles'>) => {
      if (!userId) return { error: 'Sin sesión' }
      const { data, error } = await supabase.from('profiles').update(changes).eq('id', userId).select('*').single()
      if (error) return { error: error.message }
      setProfile(data)
      return { error: null }
    },
    [userId],
  )

  return { profile, loading, error, save }
}
