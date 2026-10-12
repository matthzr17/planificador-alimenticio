import { Link } from 'react-router'
import { ChevronRight, LogOut, ShoppingCart, Soup, User, Warehouse } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useProfile } from '@/hooks/useProfile'
import { DIET_OPTIONS, GOAL_OPTIONS } from '@/lib/catalogs'
import { MacroSummary } from '@/components/MacroSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const modulos = [
  { to: '/perfil', icon: User, title: 'Perfil nutricional', desc: 'Métricas, objetivo y macros diarios.', etapa: null },
  { to: '/despensa', icon: Warehouse, title: 'Despensa', desc: 'Lo que ya tienes en casa.', etapa: 3 },
  { to: '/menu', icon: Soup, title: 'Menú semanal', desc: 'Recetas según tu tiempo y tu despensa.', etapa: 3 },
  { to: '/compras', icon: ShoppingCart, title: 'Lista de compras', desc: 'Lo que falta y dónde conviene comprarlo.', etapa: 4 },
]

export default function Home() {
  const { session, signOut } = useAuth()
  const { profile, loading, error } = useProfile()

  const nombre = profile?.full_name?.split(' ')[0]
  const tieneObjetivo = profile?.target_kcal != null
  const objetivo = GOAL_OPTIONS.find((g) => g.value === profile?.goal)?.label
  const dieta = DIET_OPTIONS.find((d) => d.value === profile?.diet_type)?.label

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

      {!loading &&
        (tieneObjetivo ? (
          <Card>
            <CardHeader>
              <CardTitle>Objetivo diario</CardTitle>
              <CardDescription>{[objetivo, dieta].filter(Boolean).join(' · ')}</CardDescription>
            </CardHeader>
            <CardContent>
              <MacroSummary
                kcal={profile!.target_kcal!}
                macros={{
                  proteinG: profile!.target_protein_g ?? 0,
                  carbsG: profile!.target_carbs_g ?? 0,
                  fatG: profile!.target_fat_g ?? 0,
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <Link to="/perfil" className="block">
            <Card className="border-primary/20 bg-primary text-primary-foreground transition-opacity active:opacity-90">
              <CardHeader>
                <CardTitle className="text-lg">Completa tu perfil</CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Con tus datos se calculan tus calorías y macros diarios. Toma 2 minutos.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}

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
                {etapa && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">Etapa {etapa}</span>
                )}
                <ChevronRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        {error ? `Error de conexión: ${error}` : `Conectado como ${session?.user.email}`}
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
