import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LogOut, ShoppingCart, Soup, User, Warehouse } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const modulos = [
  { to: '/perfil', icon: User, title: 'Perfil nutricional', desc: 'Métricas, objetivo y macros diarios.', etapa: 2 },
  { to: '/despensa', icon: Warehouse, title: 'Despensa', desc: 'Lo que ya tienes en casa.', etapa: 3 },
  { to: '/menu', icon: Soup, title: 'Menú semanal', desc: 'Recetas según tu tiempo y tu despensa.', etapa: 3 },
  { to: '/compras', icon: ShoppingCart, title: 'Lista de compras', desc: 'Lo que falta y dónde conviene comprarlo.', etapa: 4 },
]

export default function Home() {
  const { session, signOut } = useAuth()
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)

  // Lectura de prueba: confirma que la sesión y las políticas RLS funcionan.
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setDbError(error.message)
        else setProfile(data)
      })
  }, [])

  const nombre = profile?.full_name?.split(' ')[0]

  return (
    <div className="grid gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{saludo()}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{nombre ?? 'Bienvenido'}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión">
          <LogOut />
        </Button>
      </header>

      <Card className="border-primary/20 bg-primary text-primary-foreground">
        <CardHeader>
          <CardTitle className="text-lg">Objetivo diario</CardTitle>
          <CardDescription className="text-primary-foreground/80">
            {profile?.target_kcal
              ? `${profile.target_kcal} kcal`
              : 'Completa tu perfil para calcular tus calorías y macros.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Módulos</h2>
        {modulos.map(({ to, icon: Icon, title, desc, etapa }) => (
          <Link key={to} to={to} className="block">
            <Card className="py-4 transition-colors active:bg-muted">
              <CardContent className="flex items-center gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{title}</p>
                  <p className="truncate text-sm text-muted-foreground">{desc}</p>
                </div>
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">Etapa {etapa}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        {dbError ? `Error de conexión: ${dbError}` : `Conectado como ${session?.user.email}`}
      </p>
    </div>
  )
}

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
