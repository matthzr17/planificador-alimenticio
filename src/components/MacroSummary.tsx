import type { Macros } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

const ROWS = [
  { key: 'proteinG', label: 'Proteína', short: 'Proteína', kcalPerG: 4, stroke: 'var(--protein)', dot: 'bg-protein' },
  { key: 'carbsG', label: 'Carbohidratos', short: 'Carbos', kcalPerG: 4, stroke: 'var(--carbs)', dot: 'bg-carbs' },
  { key: 'fatG', label: 'Grasa', short: 'Grasa', kcalPerG: 9, stroke: 'var(--fat)', dot: 'bg-fat' },
] as const

/*
  "El plato": las calorías del día al centro y cada macro como una porción del borde,
  proporcional a las calorías que aporta. Se acomoda en columna en teléfono
  y en fila cuando hay espacio.
*/
export function MacroSummary({ kcal, macros, className }: { kcal: number; macros: Macros; className?: string }) {
  const kcalOf = (k: keyof Macros, perG: number) => macros[k] * perG
  const total = ROWS.reduce((s, r) => s + kcalOf(r.key, r.kcalPerG), 0) || 1

  // Geometría del anillo
  const R = 52
  const C = 2 * Math.PI * R
  // Separación entre porciones; incluye el grosor del trazo porque las puntas redondeadas sobresalen
  const STROKE = 11
  const GAP = 5 + STROKE
  const fracs = ROWS.map((r) => kcalOf(r.key, r.kcalPerG) / total)
  const arcs = ROWS.map((r, i) => ({
    ...r,
    len: Math.max(0, fracs[i] * C - GAP),
    offset: fracs.slice(0, i).reduce((s, f) => s + f * C, 0),
  }))

  return (
    <div className={cn('@container min-w-0', className)}>
    <div className="flex min-w-0 flex-col items-center gap-6 @md:flex-row @md:gap-8">
      <figure className="relative aspect-square w-44 shrink-0 sm:w-48" aria-label={`${kcal} kilocalorías al día`}>
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--muted)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={a.stroke}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset - GAP / 2}
            />
          ))}
        </svg>
        <figcaption className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-semibold tabular-nums tracking-tight">{kcal.toLocaleString('es-MX')}</span>
          <span className="text-xs text-muted-foreground">kcal al día</span>
        </figcaption>
      </figure>

      <dl className="grid w-full min-w-0 grid-cols-3 gap-3 @md:grid-cols-1 @md:gap-4">
        {ROWS.map((r) => {
          const pct = Math.round((kcalOf(r.key, r.kcalPerG) / total) * 100)
          return (
            <div key={r.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-2 shrink-0 rounded-full', r.dot)} aria-hidden />
                <span className="truncate @[19rem]:hidden">{r.short}</span>
                <span className="hidden truncate @[19rem]:inline">{r.label}</span>
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-semibold tabular-nums">{macros[r.key]}</span>
                <span className="text-xs text-muted-foreground">g</span>
              </dd>
              <dd className="text-xs tabular-nums text-muted-foreground">
                {pct}%<span className="hidden @md:inline"> de las calorías</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
    </div>
  )
}
