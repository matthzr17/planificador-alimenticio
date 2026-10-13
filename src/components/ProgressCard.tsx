import { useState } from 'react'
import { Loader2, Plus, Scale, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import type { Profile } from '@/hooks/useProfile'
import { useWeights, type WeightEntry } from '@/hooks/useWeights'
import { isoDate } from '@/lib/planner'
import { recalcTargets, suggestAdjustment, targetColumns } from '@/lib/progress'
import type { TablesUpdate } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { fmtDate, fmtKg, WeightChart } from '@/components/WeightChart'

const DISMISS_KEY = 'nutri:v1:dismissed-suggestion'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

/** Tu peso: último registro, cambio, gráfica y sugerencia de ajuste de calorías. */
export function ProgressCard({ profile, saveProfile }: { profile: Profile; saveProfile: (c: TablesUpdate<'profiles'>) => Promise<{ error: string | null }> }) {
  const { logs, save, remove } = useWeights()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [today] = useState(() => isoDate(new Date()))
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!logs) return null

  const latest = logs[logs.length - 1]
  const first = logs[0]
  const change = latest && first && logs.length > 1 ? Number(latest.weight_kg) - Number(first.weight_kg) : null
  const extra = profile.kcal_adjustment ?? 0
  const goal = (profile.goal ?? 'maintain') as 'cut' | 'maintain' | 'bulk'
  const suggestion = suggestAdjustment(logs, goal, today, { extraKcal: extra, adjustedOn: profile.kcal_adjusted_on })
  const preview = suggestion ? recalcTargets(profile, { extraKcal: extra + suggestion.deltaKcal }) : null
  // Si el piso de seguridad impide bajar más, no tiene caso sugerirlo
  const useful = suggestion && preview && preview.targetKcal !== profile.target_kcal
  const dismissKey = latest ? `${latest.logged_on}:${suggestion?.deltaKcal}` : ''
  const showSuggestion = useful && dismissed !== dismissKey

  async function applySuggestion() {
    if (!suggestion || !preview) return
    setBusy(true)
    const { error } = await saveProfile({ kcal_adjustment: extra + suggestion.deltaKcal, kcal_adjusted_on: today, ...targetColumns(preview) })
    setBusy(false)
    setNotice(error ? `No se pudo aplicar: ${error}` : `Listo: tu objetivo ahora es ${preview.targetKcal.toLocaleString('es-MX')} kcal. Rehaz el menú para que lo use.`)
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, dismissKey)
    } catch {
      /* solo se oculta en esta sesión */
    }
    setDismissed(dismissKey)
  }

  return (
    <section className="min-w-0 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="peso-titulo">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="peso-titulo" className="text-lg font-semibold">
            Tu peso
          </h2>
          {latest ? (
            <p className="text-sm text-muted-foreground">Último registro: {fmtDate(latest.logged_on, true)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Pésate una vez por semana, en ayunas y a la misma hora.</p>
          )}
        </div>
        <Button size="sm" variant={latest ? 'outline' : 'default'} onClick={() => setOpen(true)}>
          <Plus />
          Registrar
        </Button>
      </div>

      {latest && (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-display text-3xl font-semibold tabular-nums">{fmtKg(Number(latest.weight_kg))}</p>
            {change != null && Math.abs(change) >= 0.05 && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                {change < 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
                {change > 0 ? '+' : '−'}
                {fmtKg(Math.abs(change))} desde el {fmtDate(first.logged_on)}
              </p>
            )}
          </div>
          {logs.length > 1 ? (
            <WeightChart data={logs.slice(-16)} />
          ) : (
            <p className="text-sm text-muted-foreground">Con 3 registros en 2 semanas la app revisa si vas al ritmo de tu objetivo.</p>
          )}
        </>
      )}

      {showSuggestion && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-secondary p-4 text-sm text-secondary-foreground">
          <p className="flex items-start gap-2">
            <Scale className="mt-0.5 size-4 shrink-0" />
            <span>
              {suggestion!.reason} Te sugiero <strong>{suggestion!.deltaKcal > 0 ? 'subir' : 'bajar'} {Math.abs(suggestion!.deltaKcal)} kcal</strong>: tu
              objetivo pasaría de {profile.target_kcal?.toLocaleString('es-MX')} a {preview!.targetKcal.toLocaleString('es-MX')} kcal al día.
            </span>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Ahora no
            </Button>
            <Button size="sm" onClick={applySuggestion} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Aplicar ajuste
            </Button>
          </div>
        </div>
      )}
      {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}

      {open && (
        <WeightSheet
          logs={logs}
          today={today}
          onClose={() => setOpen(false)}
          onSave={async (date, kg) => {
            const err = await save(date, kg)
            if (err) return err
            // Si es el registro más reciente, actualiza el peso del perfil y recalcula tus macros
            const isLatest = !logs.some((l) => l.logged_on > date)
            if (isLatest) {
              const r = recalcTargets(profile, { weightKg: kg })
              const { error } = await saveProfile({ weight_kg: kg, ...(r ? targetColumns(r) : {}) })
              if (error) return `Se registró, pero no se actualizó el perfil: ${error}`
            }
            setOpen(false)
            return null
          }}
          onRemove={remove}
        />
      )}
    </section>
  )
}

function WeightSheet({
  logs,
  today,
  onClose,
  onSave,
  onRemove,
}: {
  logs: WeightEntry[]
  today: string
  onClose: () => void
  onSave: (date: string, kg: number) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}) {
  const last = logs[logs.length - 1]
  const [kg, setKg] = useState(last ? String(Number(last.weight_kg)) : '')
  const [date, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(kg.replace(',', '.'))
  const valid = n >= 30 && n <= 300 && date && date <= today

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registrar peso"
      description="Al guardar se actualiza tu perfil y se recalculan tus macros."
      footer={
        <div className="flex justify-end">
          <Button
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true)
              setError(await onSave(date, Math.round(n * 10) / 10))
              setBusy(false)
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="w-kg">Peso (kg)</Label>
            <Input id="w-kg" inputMode="decimal" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} placeholder="80.5" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="w-date">Fecha</Label>
            <Input id="w-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {logs.length > 0 && (
          <section>
            <h3 className="mb-2 text-base font-semibold">Historial</h3>
            <ul className="divide-y rounded-lg border">
              {[...logs].reverse().slice(0, 12).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">{fmtDate(l.logged_on, true)}</span>
                  <span className="tabular-nums">{fmtKg(Number(l.weight_kg))}</span>
                  <button type="button" aria-label={`Borrar registro del ${fmtDate(l.logged_on, true)}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" onClick={async () => setError(await onRemove(l.id))}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  )
}
