// Unidades y conversiones. Para simplificar, 1 ml ≈ 1 g (aceptable para cocina casera).

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'pza'

export const UNIT_LABEL: Record<Unit, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', pza: 'pza' }

type IngredientLike = { grams_per_unit: number | null; default_unit: string }

export function toGrams(quantity: number, unit: string, ing: IngredientLike): number {
  switch (unit) {
    case 'kg':
    case 'l':
      return quantity * 1000
    case 'pza':
      return quantity * (ing.grams_per_unit ?? 100)
    default:
      return quantity
  }
}

/** Unidades que tiene sentido ofrecer para un ingrediente según su unidad base. */
export function unitsFor(ing: IngredientLike): Unit[] {
  const base = ing.default_unit as Unit
  if (base === 'pza') return ing.grams_per_unit ? ['pza', 'g', 'kg'] : ['pza']
  if (base === 'ml' || base === 'l') return ['ml', 'l']
  return ing.grams_per_unit ? ['g', 'kg', 'pza'] : ['g', 'kg']
}

/** Cantidad legible: "1.5 pza", "250 g", "½ pza". */
export function formatQty(quantity: number, unit: string): string {
  const fractions: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }
  const whole = Math.floor(quantity)
  const frac = Math.round((quantity - whole) * 100) / 100
  // 1,000 g o más se lee mejor en kilos (y ml en litros)
  if ((unit === 'g' || unit === 'ml') && quantity >= 1000) return formatQty(quantity / 1000, unit === 'g' ? 'kg' : 'l')
  let n: string
  if (unit === 'pza' && fractions[String(frac)]) n = `${whole > 0 ? whole : ''}${fractions[String(frac)]}`
  else if (unit === 'g' || unit === 'ml') n = String(Math.round(quantity))
  else n = String(Math.round(quantity * 100) / 100)
  return `${n} ${UNIT_LABEL[unit as Unit] ?? unit}`
}

/** Normaliza texto para buscar sin acentos ni mayúsculas. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// ---------- medidas caseras ----------

export type MeasureLike = { id: string; name: string; plural: string; grams: number; is_piece: boolean }

/** "1 rebanada", "3 rebanadas", "1½ tazas". */
export function measureText(qty: number, m: Pick<MeasureLike, 'name' | 'plural'>): string {
  const n = formatNumber(qty)
  return `${n} ${qty > 0 && qty <= 1 ? m.name : m.plural}`
}

/** Número con medios y cuartos legibles: 1.5 → "1½", 0.25 → "¼". */
export function formatNumber(n: number): string {
  const fractions: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }
  const whole = Math.floor(n)
  const frac = Math.round((n - whole) * 100) / 100
  if (fractions[String(frac)]) return `${whole > 0 ? whole : ''}${fractions[String(frac)]}`
  return String(Math.round(n * 10) / 10)
}

/** Equivalencia en piezas para mostrar junto a gramos: "≈ 4 jitomates". Null si no aplica. */
export function pieceEquivalent(grams: number, measures: MeasureLike[] | undefined): string | null {
  const piece = measures?.find((m) => m.is_piece)
  if (!piece || grams <= 0) return null
  const qty = Math.round((grams / Number(piece.grams)) * 2) / 2
  return qty > 0 ? `≈ ${measureText(qty, piece)}` : null
}
