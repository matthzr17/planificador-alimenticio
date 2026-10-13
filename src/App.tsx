import { Component, lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { Loader2, RotateCw } from 'lucide-react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import AppShell from '@/components/AppShell'
import { Button } from '@/components/ui/button'
import Home from '@/pages/Home'
import Login from '@/pages/Login'

// Cada módulo se descarga cuando se abre por primera vez: la app arranca más rápido.
const Perfil = lazy(() => import('@/pages/Perfil'))
const Despensa = lazy(() => import('@/pages/Despensa'))
const Menu = lazy(() => import('@/pages/Menu'))
const Compras = lazy(() => import('@/pages/Compras'))

function Spinner() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Si algo falla al dibujar una pantalla, muestra una salida en vez de una página en blanco. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-xl font-semibold">{offline ? 'Sin conexión' : 'Algo salió mal'}</p>
        <p className="text-sm text-muted-foreground">
          {offline ? 'Conéctate a internet para cargar tus datos.' : 'Recarga la app. Si vuelve a pasar, avísame qué estabas haciendo.'}
        </p>
        <p className="text-xs break-all text-muted-foreground/70">{this.state.error.message}</p>
        <Button className="mt-2" onClick={() => window.location.reload()}>
          <RotateCw />
          Recargar
        </Button>
      </div>
    )
  }
}

// HashRouter (#/ruta): GitHub Pages no sabe redirigir rutas de una SPA,
// y con hash las recargas y la app instalada siempre funcionan.
function Rutas() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="perfil" element={<Suspense fallback={<Spinner />}><Perfil /></Suspense>} />
        <Route path="despensa" element={<Suspense fallback={<Spinner />}><Despensa /></Suspense>} />
        <Route path="menu" element={<Suspense fallback={<Spinner />}><Menu /></Suspense>} />
        <Route path="compras" element={<Suspense fallback={<Spinner />}><Compras /></Suspense>} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <Rutas />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
