// Cocinar con cambios. Funciones puras.
//
// Un platillo del plan usa los ingredientes de su receta escalados a sus porciones, salvo que tenga
// `ingredients_override`: la lista real (cantidades totales) que se usó o se usará. Ese override se llena
//   - al cocinar con cambios (lo que de verdad usaste), o
//   - al cambiar un ingrediente "para el resto de la semana".
// Todo lo demás (lista de compras, descuento de despensa, calorías del día) usa esta lista efectiva.

import { toGrams } from './units'

export type Use = { ingredient_id: string; quantity: number; unit: string }

type Ing = {
  id: string
  default_unit: string
  grams_per_unit: number | null
  kcal_100g?: number | null
  protein_100g?: number | null
  carbs_100g?: number | null
  fat_100g?: number | null
}
type RecipeLike = {
  id: string
  servings: number
  ingredients: { ingredient_id: string; quantity: number; unit: string }[]
  kcal_serving?: number | null
  protein_serving?: number | null
  carbs_serving?: number | null
  fat_serving?: number | null
}
type ItemLike = { recipe_id: string; servings: number; ingredients_override?: unknown }

export function parseUses(raw: unknown): Use[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((u) => u && typeof u.ingredient_id === 'string' && Number(u.quantity) >= 0 && typeof u.unit === 'string')
    .map((u) => ({ ingredient_id: u.ingredient_id, quantity: Number(u.quantity), unit: u.unit }))
}

/** Ingredientes efectivos de un platillo del plan (cantidades totales para sus porciones). */
export function itemUses(item: ItemLike, recipe: RecipeLike): Use[] {
  const override = parseUses(item.ingredients_override)
  if (override) return override
  const f = Number(item.servings) / recipe.servings
  return recipe.ingredients.map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: round3(Number(ri.quantity) * f), unit: ri.unit }))
}

/** Multiplica las cantidades (para cocinar una tanda de varias comidas o volver a una sola). */
export function scaleUses(uses: Use[], factor: number): Use[] {
  return uses.map((u) => ({ ...u, quantity: round3(u.quantity * factor) }))
}

export type Macros4 = { kcal: number; protein: number; carbs: number; fat: number }

export function macrosOf(uses: Use[], ingredientById: Map<string, Ing>): Macros4 {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const u of uses) {
    const ing = ingredientById.get(u.ingredient_id)
    if (!ing) continue
    const g = toGrams(u.quantity, u.unit, ing) / 100
    t.kcal += g * (ing.kcal_100g ?? 0)
    t.protein += g * (ing.protein_100g ?? 0)
    t.carbs += g * (ing.carbs_100g ?? 0)
    t.fat += g * (ing.fat_100g ?? 0)
  }
  return t
}

/** Calorías y macros de un platillo del plan, con lo que realmente lleva si hubo cambios. */
export function itemMacros(item: ItemLike, recipe: RecipeLike, ingredientById: Map<string, Ing>): Macros4 {
  if (parseUses(item.ingredients_override)) return macrosOf(itemUses(item, recipe), ingredientById)
  const s = Number(item.servings)
  return {
    kcal: (recipe.kcal_serving ?? 0) * s,
    protein: (recipe.protein_serving ?? 0) * s,
    carbs: (recipe.carbs_serving ?? 0) * s,
    fat: (recipe.fat_serving ?? 0) * s,
  }
}

export function sumMacros(list: Macros4[]): Macros4 {
  return list.reduce((a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })
}

/** Unidad natural para guardar una cantidad de un ingrediente: piezas si se cuenta por pieza, si no g o ml. */
export function baseUnit(ing: Ing): 'pza' | 'g' | 'ml' {
  if (ing.default_unit === 'pza' && ing.grams_per_unit) return 'pza'
  return ing.default_unit === 'ml' || ing.default_unit === 'l' ? 'ml' : 'g'
}

/** Expresa unos gramos en la unidad natural del ingrediente. */
export function fromGrams(grams: number, ing: Ing): { quantity: number; unit: string } {
  const unit = baseUnit(ing)
  return { quantity: round3(grams / toGrams(1, unit, ing)), unit }
}

/**
 * Cambia un ingrediente por otro conservando el peso (100 g de Oaxaca → 100 g de panela).
 * Si el sustituto ya estaba en la lista, se suman.
 */
export function applySwap(uses: Use[], fromId: string, toId: string, ingredientById: Map<string, Ing>): Use[] {
  const from = ingredientById.get(fromId)
  const to = ingredientById.get(toId)
  const target = uses.find((u) => u.ingredient_id === fromId)
  if (!from || !to || !target) return uses
  const grams = toGrams(target.quantity, target.unit, from)
  const existing = uses.find((u) => u.ingredient_id === toId)
  const rest = uses.filter((u) => u.ingredient_id !== fromId && u.ingredient_id !== toId)
  const add = fromGrams(grams + (existing ? toGrams(existing.quantity, existing.unit, to) : 0), to)
  // Conserva la posición del ingrediente original
  const idx = uses.findIndex((u) => u.ingredient_id === fromId)
  const out = [...rest]
  out.splice(Math.min(idx, out.length), 0, { ingredient_id: toId, ...add })
  return out
}

/**
 * Nueva lista de ingredientes para una versión personal de la receta, sumando lo agregado.
 * `added` viene en cantidades totales usadas para `servings` porciones; se convierte a la base de la receta.
 */
export function versionIngredients(recipe: RecipeLike, added: Use[], servings: number, ingredientById: Map<string, Ing>): Use[] {
  const out: Use[] = recipe.ingredients.map((ri) => ({ ingredient_id: ri.ingredient_id, quantity: Number(ri.quantity), unit: ri.unit }))
  for (const a of added) {
    const ing = ingredientById.get(a.ingredient_id)
    if (!ing) continue
    const gramsForRecipe = (toGrams(a.quantity, a.unit, ing) / servings) * recipe.servings
    const existing = out.find((u) => u.ingredient_id === a.ingredient_id)
    if (existing) {
      const total = toGrams(existing.quantity, existing.unit, ing) + gramsForRecipe
      Object.assign(existing, fromGrams(total, ing))
    } else {
      out.push({ ingredient_id: a.ingredient_id, ...fromGrams(gramsForRecipe, ing) })
    }
  }
  return out
}

// ---------- despensa ----------

export type PantryRecord = { id?: string; ingredient_id: string; quantity: number; unit: string; is_approximate: boolean; expires_on: string | null }

/**
 * Nuevos registros de despensa después de usar ingredientes (sign = -1) o deshacerlo (sign = +1).
 * Al usar solo se descuenta lo que existe, sin bajar de cero; al deshacer, lo que ya no existe se vuelve a crear.
 */
export function pantryAfterUsing(uses: Use[], pantry: PantryRecord[], ingredientById: Map<string, Ing>, sign: 1 | -1): PantryRecord[] {
  const out: PantryRecord[] = []
  for (const u of uses) {
    const ing = ingredientById.get(u.ingredient_id)
    if (!ing) continue
    const grams = toGrams(u.quantity, u.unit, ing)
    const current = out.find((p) => p.ingredient_id === u.ingredient_id) ?? pantry.find((p) => p.ingredient_id === u.ingredient_id)
    if (!current) {
      if (sign === 1) out.push({ ingredient_id: u.ingredient_id, ...fromGrams(grams, ing), is_approximate: false, expires_on: null })
      continue
    }
    const perUnit = toGrams(1, current.unit, ing)
    const next = { ...current, quantity: Math.max(0, round2(Number(current.quantity) + (sign * grams) / perUnit)) }
    const idx = out.findIndex((p) => p.ingredient_id === u.ingredient_id)
    if (idx >= 0) out[idx] = next
    else out.push(next)
  }
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000
