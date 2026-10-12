import type { Macros } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

const ROWS: { key: keyof Macros; label: string; kcalPerG: number; color: string }[] = [
  { key: 'proteinG', label: 'Proteína', kcalPerG: 4, color: 'bg-primary' },
  { key: 'carbsG', label: 'Carbohidratos', kcalPerG: 4, color: 'bg-amber-500' },
  { key: 'fatG', label: 'Grasa', kcalPerG: 9, color: 'bg-sky-600' },
]

// Calorías objetivo + barra apilada de macros + desglose en gramos.
export function MacroSummary({ kcal, macros, className }: { kcal: number; macros: Macros; className?: string }) {
  const total = ROWS.reduce((s, r) => s + macros[r.key] * r.kcalPerG, 0) || 1

  return (
    <div className={cn('grid gap-4', className)}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tabular-nums tracking-tight">{kcal.toLocaleString('es-MX')}</span>
        <span className="text-sm text-muted-foreground">kcal / día</span>
      </div>

      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {ROWS.map((r) => (
          <div key={r.key} className={r.color} style={{ width: `${((macros[r.key] * r.kcalPerG) / total) * 100}%` }} />
        ))}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {ROWS.map((r) => (
          <div key={r.key} className="grid gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', r.color)} aria-hidden />
              {r.label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {macros[r.key]} <span className="text-xs font-normal text-muted-foreground">g</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
