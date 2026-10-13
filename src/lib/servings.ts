// Porciones en medidas de casa: "4 quesadillas", "1½ tazas de picadillo y 3 tortillas".
//
// Cada receta guarda cómo se sirve 1 porción (serving_parts). Para N porciones se multiplica cada parte:
//   - Lo que se cuenta por pieza y va de 2 en adelante por porción (tacos, tortillas, quesadillas)
//     se redondea a piezas enteras.
//   - Lo demás (tazas, tazones, platos) se redondea a medios.
// snapServings ajusta las porciones para que las piezas salgan enteras; así las calorías
// corresponden a lo que de verdad te vas a servir.

import { formatNumber } from './units'

export type ServingPart = { q: number; one: string; many: string; count: boolean }

export function parseParts(raw: unknown): ServingPart[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is ServingPart => p && typeof p.q === 'number' && typeof p.one === 'string' && typeof p.many === 'string')
}

const isWhole = (p: ServingPart) => p.count && p.q >= 2

/** La parte que manda al redondear: la primera que se cuenta por pieza enteras. */
function anchor(parts: ServingPart[]) {
  return parts.find(isWhole)
}

/** Porciones ajustadas para que las piezas salgan enteras (sin bajar de media porción). */
export function snapServings(parts: ServingPart[], servings: number): number {
  const a = anchor(parts)
  if (!a) return servings
  const pieces = Math.max(1, Math.round(servings * a.q))
  return Math.max(0.5, pieces / a.q)
}

function partText(p: ServingPart, servings: number) {
  const raw = p.q * servings
  const qty = isWhole(p) ? Math.max(1, Math.round(raw)) : Math.max(0.5, Math.round(raw * 2) / 2)
  return `${formatNumber(qty)} ${qty > 1 ? p.many : p.one}`
}

/** "3 quesadillas", "1½ tazas de picadillo y 3 tortillas". Null si la receta no tiene medida. */
export function describeServing(rawParts: unknown, servings: number): string | null {
  const parts = parseParts(rawParts)
  if (!parts.length) return null
  const texts = parts.map((p) => partText(p, servings))
  return texts.length === 1 ? texts[0] : `${texts.slice(0, -1).join(', ')} y ${texts[texts.length - 1]}`
}
