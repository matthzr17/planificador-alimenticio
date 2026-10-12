import { HashRouter, Route, Routes } from 'react-router'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import AppShell from '@/components/AppShell'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Proximamente from '@/pages/Proximamente'

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
        <Route path="perfil" element={<Proximamente titulo="Perfil nutricional" etapa={2} />} />
        <Route path="despensa" element={<Proximamente titulo="Despensa" etapa={3} />} />
        <Route path="menu" element={<Proximamente titulo="Menú semanal" etapa={3} />} />
        <Route path="compras" element={<Proximamente titulo="Lista de compras" etapa={4} />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Rutas />
      </HashRouter>
    </AuthProvider>
  )
}
