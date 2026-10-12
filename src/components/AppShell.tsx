import { NavLink, Outlet } from 'react-router'
import { Home, ShoppingCart, Soup, User, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/perfil', label: 'Perfil', icon: User },
  { to: '/despensa', label: 'Despensa', icon: Warehouse },
  { to: '/menu', label: 'Menú', icon: Soup },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
]

// Estructura móvil: contenido con scroll + barra de pestañas fija abajo,
// respetando la zona segura del iPhone (notch y barra de inicio).
export default function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <main className="flex-1 px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <Outlet />
      </main>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
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
                <Icon className="size-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
