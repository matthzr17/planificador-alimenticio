import { useLayoutEffect, useRef, useState } from 'react'

type Point = { logged_on: string; weight_kg: number }

const fmtDate = (iso: string, long = false) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', long ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' }).replace('.', '')
}
const fmtKg = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg`

/**
 * Peso en el tiempo: una sola serie (sin leyenda; el título de la tarjeta la nombra).
 * Línea de 2 px, marcadores de 8 px con anillo del color de la tarjeta, cuadrícula tenue,
 * y un tooltip con el punto más cercano al pasar el dedo o el cursor.
 */
export function WeightChart({ data, height = 160 }: { data: Point[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (data.length === 0) return null

  const pad = { top: 12, right: 12, bottom: 22, left: 40 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const days = data.map((p) => Date.parse(p.logged_on))
  const minX = Math.min(...days)
  const maxX = Math.max(...days)
  const ys = data.map((p) => Number(p.weight_kg))
  // Escala con margen de 1 kg para que un cambio pequeño no se vea como un desplome
  const lo = Math.floor(Math.min(...ys) - 1)
  const hi = Math.ceil(Math.max(...ys) + 1)
  const x = (t: number) => pad.left + (maxX === minX ? w / 2 : ((t - minX) / (maxX - minX)) * w)
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * h
  const ticks = [lo, Math.round(((lo + hi) / 2) * 2) / 2, hi]
  const path = data.map((_, i) => `${i ? 'L' : 'M'}${x(days[i]).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ')

  function onMove(clientX: number) {
    const rect = ref.current!.getBoundingClientRect()
    const px = clientX - rect.left
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(days[i]) - px) < Math.abs(x(days[best]) - px)) best = i
    setHover(best)
  }

  const hp = hover != null ? { cx: x(days[hover]), cy: y(ys[hover]), p: data[hover] } : null

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="Gráfica de tu peso en el tiempo" className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        <text x={pad.left} y={height - 4} className="fill-muted-foreground text-[10px]">
          {fmtDate(data[0].logged_on)}
        </text>
        {data.length > 1 && (
          <text x={pad.left + w} y={height - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {fmtDate(data[data.length - 1].logged_on)}
          </text>
        )}
        {hp && <line x1={hp.cx} x2={hp.cx} y1={pad.top} y2={pad.top + h} stroke="var(--muted-foreground)" strokeOpacity={0.4} strokeWidth={1} />}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((p, i) => (
          <circle
            key={p.logged_on}
            cx={x(days[i])}
            cy={y(ys[i])}
            r={hover === i ? 5 : 4}
            fill="var(--chart-line)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        ))}
        {/* Zona de toque más grande que los puntos */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerDown={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: Math.min(Math.max(hp.cx, 60), width - 60), top: hp.cy - 10 }}
        >
          <p className="font-semibold tabular-nums text-popover-foreground">{fmtKg(Number(hp.p.weight_kg))}</p>
          <p className="text-muted-foreground">{fmtDate(hp.p.logged_on, true)}</p>
        </div>
      )}
      {/* Vista en tabla para lectores de pantalla */}
      <table className="sr-only">
        <caption>Registro de peso</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Peso</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.logged_on}>
              <td>{fmtDate(p.logged_on, true)}</td>
              <td>{fmtKg(Number(p.weight_kg))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { fmtDate, fmtKg }
