import { useState, type FormEvent } from 'react'
import { Leaf, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'signin' | 'signup'

// Inicio de sesión con correo + contraseña.
// No se usa "magic link": en iPhone el enlace del correo abre Safari, no la app instalada.
export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(traducirError(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
      })
      if (error) setError(traducirError(error.message))
      else if (!data.session) setNotice('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.')
    }
    setBusy(false)
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Leaf className="size-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Planificador Alimenticio</h1>
        <p className="max-w-xs text-sm text-muted-foreground">Tu perfil nutricional, despensa, menú semanal y compras en un solo lugar.</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}</CardTitle>
          <CardDescription>
            {mode === 'signin' ? 'Entra con tu correo y contraseña.' : 'Solo necesitas hacerlo una vez.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p className="rounded-md bg-secondary p-3 text-sm text-secondary-foreground">{notice}</p>}

            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="animate-spin" />}
              {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNotice(null)
            }}
            className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === 'signin' ? '¿Primera vez? Crea tu cuenta' : 'Ya tengo cuenta'}
          </button>
        </CardContent>
      </Card>
    </main>
  )
}

function traducirError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (msg.includes('Email not confirmed')) return 'Primero confirma tu correo con el enlace que te enviamos.'
  if (msg.includes('User already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.'
  if (msg.includes('Signups not allowed')) return 'El registro está cerrado.'
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 8 caracteres.'
  return msg
}
