import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { disablePush, enablePush, pushStatus, testPush, type PushStatus } from '@/lib/push'
import { Button } from '@/components/ui/button'

/** Activar o desactivar los avisos de caducidad en este teléfono. */
export function ExpiryAlerts() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('unsupported'))
  }, [])

  async function run(fn: () => Promise<string | null>, ok: string) {
    setBusy(true)
    const err = await fn().catch((e: Error) => e.message)
    setBusy(false)
    setMessage(err ? { ok: false, text: err } : { ok: true, text: ok })
    setStatus(await pushStatus().catch(() => 'unsupported' as const))
  }

  if (!status) return null

  return (
    <section className="rounded-xl border bg-card p-4" aria-labelledby="avisos-titulo">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {status === 'on' ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="avisos-titulo" className="text-base font-semibold">
            Avisos de caducidad {status === 'on' && <span className="ml-1 text-xs font-medium text-primary">Activos</span>}
          </h2>
          <p className="text-sm text-muted-foreground">
            {status === 'on' && 'Todos los días a las 9 a.m. te avisamos si algo caduca hoy, mañana o pasado mañana.'}
            {status === 'off' && 'Recibe una notificación a las 9 a.m. cuando algo de tu despensa esté por caducar.'}
            {status === 'needs-install' &&
              'En iPhone, los avisos solo funcionan con la app instalada: ábrela en Safari, toca Compartir y luego Agregar a inicio. Después ábrela desde el ícono.'}
            {status === 'denied' && 'Las notificaciones están bloqueadas. Actívalas en Ajustes del iPhone, Notificaciones, Nutri.'}
            {status === 'unsupported' && 'Este navegador no permite notificaciones.'}
          </p>
          {message && <p className={message.ok ? 'mt-2 text-sm text-primary' : 'mt-2 text-sm text-destructive'}>{message.text}</p>}
        </div>
      </div>
      {(status === 'off' || status === 'on') && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {status === 'off' ? (
            <Button size="sm" onClick={() => run(async () => (await enablePush()) ?? (await testPush()), 'Listo. Te mandamos un aviso de prueba.')} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Activar avisos
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => run(disablePush, 'Avisos desactivados en este teléfono.')} disabled={busy}>
                Desactivar
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(testPush, 'Aviso de prueba enviado.')} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Enviar prueba
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
