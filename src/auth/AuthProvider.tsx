import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const STORAGE_KEY = 'sb-xhioalpsrlvzxsupogtk-auth-token'

function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    return s?.user ? s : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Sin conexión, si el token venció no se puede renovar: se usa la sesión guardada para ver la copia local.
      // Al volver la señal, Supabase la renueva sola.
      setSession(data.session ?? (typeof navigator !== 'undefined' && !navigator.onLine ? storedSession() : null))
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Un fallo de renovación sin señal no debe sacar al usuario; solo un cierre de sesión explícito
      if (!next && event !== 'SIGNED_OUT' && typeof navigator !== 'undefined' && !navigator.onLine) return
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
