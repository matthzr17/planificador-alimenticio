import type { Ingredient, Measure } from '@/hooks/useCatalog'
import { formatQty, pieceEquivalent, toGrams, unitsFor, UNIT_LABEL, type Unit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/** Unidad elegida en pantalla: una unidad base (g, kg, ml, l, pza) o una medida casera (rebanada, taza...). */
export type QtyUnit = { kind: 'unit'; unit: Unit } | { kind: 'measure'; measure: Measure }

/** Convierte lo capturado a algo que se puede guardar (g/ml/pza…). Las medidas caseras se guardan en gramos o mililitros. */
export function normalizeQty(qty: number, u: QtyUnit, ing: Ingredient): { quantity: number; unit: Unit } {
  if (u.kind === 'unit') return { quantity: qty, unit: u.unit }
  const base: Unit = ing.default_unit === 'ml' || ing.default_unit === 'l' ? 'ml' : 'g'
  return { quantity: Math.round(qty * Number(u.measure.grams) * 100) / 100, unit: base }
}

export function gramsOfQty(qty: number, u: QtyUnit, ing: Ingredient): number {
  const n = normalizeQty(qty, u, ing)
  return toGrams(n.quantity, n.unit, ing)
}

/**
 * Captura de cantidad con unidades base y medidas caseras del ingrediente.
 * Debajo muestra la equivalencia ("= 90 g", "≈ 4 jitomates") para que la conversión sea visible.
 */
export function QuantityInput({
  id,
  ingredient,
  measures,
  quantity,
  onQuantity,
  unit,
  onUnit,
  autoFocus,
}: {
  id: string
  ingredient: Ingredient
  measures: Measure[]
  quantity: string
  onQuantity: (v: string) => void
  unit: QtyUnit
  onUnit: (u: QtyUnit) => void
  autoFocus?: boolean
}) {
  const piece = measures.find((m) => m.is_piece)
  const baseUnits = unitsFor(ingredient)
  const extra = measures.filter((m) => !m.is_piece)
  const qty = Number(quantity.replace(',', '.'))
  const grams = !Number.isNaN(qty) && qty > 0 ? gramsOfQty(qty, unit, ingredient) : 0
  const isMl = ingredient.default_unit === 'ml' || ingredient.default_unit === 'l'

  let hint: string | null = null
  if (grams > 0) {
    if (unit.kind === 'measure' || (unit.kind === 'unit' && unit.unit === 'pza')) hint = `= ${formatQty(grams, isMl ? 'ml' : 'g')}`
    else hint = pieceEquivalent(grams, measures)
  }

  const selected = (u: QtyUnit) =>
    u.kind === unit.kind && (u.kind === 'unit' ? u.unit === (unit as { unit: Unit }).unit : u.measure.id === (unit as { measure: Measure }).measure.id)
  const chip = (active: boolean) =>
    cn('h-9 min-w-14 shrink-0 rounded-md border px-3 text-sm transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')

  return (
    <div className="grid gap-2">
      <Input id={id} inputMode="decimal" autoFocus={autoFocus} value={quantity} onChange={(e) => onQuantity(e.target.value)} placeholder="0" />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Unidad">
        {baseUnits.map((u) => {
          const value: QtyUnit = { kind: 'unit', unit: u }
          return (
            <button key={u} type="button" role="radio" aria-checked={selected(value)} onClick={() => onUnit(value)} className={chip(selected(value))}>
              {u === 'pza' && piece ? piece.plural : UNIT_LABEL[u]}
            </button>
          )
        })}
        {extra.map((m) => {
          const value: QtyUnit = { kind: 'measure', measure: m }
          return (
            <button key={m.id} type="button" role="radio" aria-checked={selected(value)} onClick={() => onUnit(value)} className={chip(selected(value))}>
              {m.plural}
            </button>
          )
        })}
      </div>
      {hint && <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>}
    </div>
  )
}
