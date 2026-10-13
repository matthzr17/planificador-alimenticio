import { useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronRight, LogOut, ShoppingCart, Soup, User, Warehouse } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useCatalog } from '@/hooks/useCatalog'
import { usePlan } from '@/hooks/usePlan'
import { useProfile } from '@/hooks/useProfile'
import { DIET_OPTIONS, GOAL_OPTIONS } from '@/lib/catalogs'
import { isoDate, MEAL_LABEL, weekStartOf, type MealType } from '@/lib/planner'
import { itemMacros } from '@/lib/cooking'
import { describeServing } from '@/lib/servings'
import { cn } from '@/lib/utils'
import { InstallHint } from '@/components/InstallHint'
import { MacroSummary } from '@/components/MacroSummary'
import { Button } from '@/components/ui/button'

const modulos = [
  { to: '/perfil', icon: User, title: 'Perfil nutricional', desc: 'Tus datos, objetivo y tipo de dieta' },
  { to: '/despensa', icon: Warehouse, title: 'Despensa', desc: 'Lo que ya tienes en casa' },
  { to: '/menu', icon: Soup, title: 'Menú semanal', desc: 'Recetas según tu tiempo y tu despensa' },
  { to: '/compras', icon: ShoppingCart, title: 'Lista de compras', desc: 'Lo que falta y dónde conviene comprarlo' },
]
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export default function Home() {
  const { signOut } = useAuth()
  const { profile, loading, error } = useProfile()

  const nombre = profile?.full_name?.trim().split(' ')[0]
  const tieneObjetivo = profile?.target_kcal != null
  const objetivo = GOAL_OPTIONS.find((g) => g.value === profile?.goal)?.label
  const dieta = DIET_OPTIONS.find((d) => d.value === profile?.diet_type)?.label

  return (
    <div className="flex min-w-0 flex-col gap-6 md:gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{saludo()}</p>
          <h1 className="truncate text-3xl font-semibold tracking-tight md:text-4xl">{nombre ?? 'Hola'}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión" className="md:hidden">
          <LogOut />
        </Button>
      </header>

      <InstallHint />

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          No se pudo cargar tu perfil: {error}
        </p>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
        {/* El plato del día */}
        {!loading &&
          (tieneObjetivo ? (
            <section className="min-w-0 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="objetivo-titulo">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="objetivo-titulo" className="text-lg font-semibold">
                    Tu plato de hoy
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {objetivo}
                    {dieta && `, dieta ${dieta.toLowerCase()}`}
                  </p>
                </div>
                <Link to="/perfil" className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Ajustar
                </Link>
              </div>
              <MacroSummary
                kcal={profile!.target_kcal!}
                macros={{
                  proteinG: profile!.target_protein_g ?? 0,
                  carbsG: profile!.target_carbs_g ?? 0,
                  fatG: profile!.target_fat_g ?? 0,
                }}
              />
            </section>
          ) : (
            <Link
              to="/perfil"
              className="group relative block min-w-0 overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground transition-opacity active:opacity-90"
            >
              {/* Anillo decorativo que anticipa "el plato" */}
              <svg viewBox="0 0 120 120" className="pointer-events-none absolute -right-10 -bottom-10 size-44 opacity-20" aria-hidden>
                <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" strokeWidth="12" strokeDasharray="90 12 60 12 110 18" />
              </svg>
              <h2 className="text-xl font-semibold">Arma tu plato</h2>
              <p className="mt-1 max-w-[32ch] text-sm text-primary-foreground/85">
                Completa tu perfil para calcular cuántas calorías y macros necesitas al día. Toma unos 2 minutos.
              </p>
              <span className="mt-4 inline-flex h-10 items-center gap-1 rounded-md bg-primary-foreground px-4 text-sm font-medium text-primary">
                Completar perfil
                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        {tieneObjetivo && <TodayMeals />}
        </div>

        {/* Módulos */}
        <section className="min-w-0" aria-labelledby="modulos-titulo">
          <h2 id="modulos-titulo" className="mb-3 text-lg font-semibold">
            Módulos
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {modulos.map(({ to, icon: Icon, title, desc }) => (
              <li key={to}>
                <Link to={to} className="flex min-w-0 items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/60 active:bg-muted">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{desc}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/** Lo que toca comer hoy según el menú de la semana. */
function TodayMeals() {
  const [now] = useState(() => new Date())
  const { items, loading } = usePlan(isoDate(weekStartOf(now)))
  const { catalog } = useCatalog()
  if (loading || !catalog) return null
  const today = items
    .filter((i) => i.day_of_week === now.getDay())
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type as MealType) - MEAL_ORDER.indexOf(b.meal_type as MealType))

  return (
    <section className="min-w-0 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="hoy-titulo">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="hoy-titulo" className="text-lg font-semibold">
          Hoy en tu menú
        </h2>
        <Link to="/menu" className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline">
          Ver semana
        </Link>
      </div>
      {today.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay menú para esta semana.{' '}
          <Link to="/menu" className="font-medium text-primary underline-offset-4 hover:underline">
            Generarlo
          </Link>
        </p>
      ) : (
        <ul className="divide-y">
          {today.map((it) => {
            const r = catalog.recipeById.get(it.recipe_id)
            return (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    it.is_done ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                  aria-label={it.is_done ? 'Hecho' : 'Pendiente'}
                >
                  {it.is_done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{MEAL_LABEL[it.meal_type as MealType]}</span>
                  <span className={cn('block truncate font-medium', it.is_done && 'text-muted-foreground line-through')}>{r?.name}</span>
                  {r && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.leftover_of_day != null && 'Sobras: '}
                      {describeServing(r.serving_parts, Number(it.servings))}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{r ? Math.round(itemMacros({ ...it, servings: Number(it.servings) }, r, catalog.ingredientById).kcal) : 0} kcal</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
