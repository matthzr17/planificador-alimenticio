import { NavLink, Outlet } from 'react-router'
import { Home, Leaf, LogOut, ShoppingCart, Soup, User, Warehouse } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/perfil', label: 'Perfil', icon: User },
  { to: '/despensa', label: 'Despensa', icon: Warehouse },
  { to: '/menu', label: 'Menú', icon: Soup },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
]

/*
  Layout adaptable:
  - Teléfono (< 768 px): barra de pestañas fija abajo, respetando la zona segura del iPhone.
  - Tablet y computadora (≥ 768 px): barra lateral a la izquierda y contenido centrado.
  `min-w-0` en cada nivel evita que un texto largo ensanche la página.
*/
export default function AppShell() {
  const { session, signOut } = useAuth()

  return (
    <div className="flex min-h-dvh min-w-0">
      {/* Barra lateral (tablet / escritorio) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card px-4 py-6 md:flex lg:w-64">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Leaf className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold leading-tight">Planificador</span>
        </div>

        <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 grid min-w-0 gap-2 border-t pt-4">
          <p className="truncate px-3 text-xs text-muted-foreground" title={session?.user.email}>
            {session?.user.email}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <main className="min-w-0 flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:px-6 md:px-10 md:pt-10 md:pb-12">
        <div className="mx-auto w-full min-w-0 max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Pestañas inferiores (teléfono) */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="min-w-0">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-secondary')}>
                      <Icon className="size-5" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
