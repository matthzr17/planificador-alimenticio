// Lista de compras y comparador de precios. Funciones puras.
//
// Lista = lo que pide el menú de la semana − lo que hay en la despensa,
// redondeado a cantidades que se pueden comprar (piezas enteras, múltiplos de 50 g/ml).
//
// Comparador: para cada artículo se evalúan los precios capturados (tienda, producto, presentación).
//   - Costo para cubrir lo que necesitas = paquetes necesarios × precio del paquete.
//   - Precio por kilo/litro (para comparar presentaciones).
//   - Costo por 10 g de proteína (para elegir la mejor proteína por tu dinero).
// La mejor opción de cada artículo es la de menor costo para cubrir la cantidad.

import { itemUses, pantryAfterUsing, type PantryRecord } from './cooking'
import { toGrams, type Unit } from './units'

export const STORES = [
  { value: 'walmart', label: 'Walmart', search: (q: string) => `https://www.walmart.com.mx/search?q=${encodeURIComponent(q)}` },
  { value: 'soriana', label: 'Soriana', search: (q: string) => siteSearch(q, 'soriana.com') },
  { value: 'chedraui', label: 'Chedraui', search: (q: string) => siteSearch(q, 'chedraui.com.mx') },
  { value: 'bodega_aurrera', label: 'Bodega Aurrera', search: (q: string) => siteSearch(q, 'bodegaaurrera.com.mx') },
  { value: 'sams', label: "Sam's Club", search: (q: string) => siteSearch(q, 'sams.com.mx') },
  { value: 'costco', label: 'Costco', search: (q: string) => siteSearch(q, 'costco.com.mx') },
  { value: 'mercado', label: 'Mercado', search: null },
  { value: 'otro', label: 'Otra tienda', search: null },
] as const

export type StoreId = (typeof STORES)[number]['value']
export const STORE_LABEL = Object.fromEntries(STORES.map((s) => [s.value, s.label])) as Record<string, string>

function siteSearch(q: string, site: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${q} precio site:${site}`)}`
}

type Ing = { id: string; default_unit: string; grams_per_unit: number | null; protein_100g?: number | null }
type RecipeLike = { id: string; servings: number; ingredients: { ingredient_id: string; quantity: number; unit: string }[] }

// ---------- lista ----------

/** Gramos totales por ingrediente que pide el plan (solo platillos no hechos; respeta cambios de ingredientes). */
export function planNeeds(
  items: { recipe_id: string; servings: number; is_done?: boolean; ingredients_override?: unknown }[],
  recipeById: Map<string, RecipeLike>,
  ingredientById: Map<string, Ing>,
): Map<string, number> {
  const needs = new Map<string, number>()
  for (const it of items) {
    if (it.is_done) continue
    const r = recipeById.get(it.recipe_id)
    if (!r) continue
    for (const u of itemUses(it, r)) {
      const ing = ingredientById.get(u.ingredient_id)
      if (!ing) continue
      needs.set(u.ingredient_id, (needs.get(u.ingredient_id) ?? 0) + toGrams(u.quantity, u.unit, ing))
    }
  }
  return needs
}

export type ListLine = { ingredient_id: string; needGrams: number; haveGrams: number; quantity: number; unit: Unit }

/** Convierte gramos faltantes a una cantidad que se puede comprar. */
export function purchasable(grams: number, ing: Ing): { quantity: number; unit: Unit } {
  if (ing.default_unit === 'pza' && ing.grams_per_unit) {
    return { quantity: Math.max(1, Math.ceil(grams / ing.grams_per_unit - 0.05)), unit: 'pza' }
  }
  const unit: Unit = ing.default_unit === 'ml' || ing.default_unit === 'l' ? 'ml' : 'g'
  return { quantity: Math.max(50, Math.ceil(grams / 50) * 50), unit }
}

export function buildShoppingList(
  needs: Map<string, number>,
  pantry: { ingredient_id: string; quantity: number; unit: string }[],
  ingredientById: Map<string, Ing>,
): ListLine[] {
  const have = new Map<string, number>()
  for (const p of pantry) {
    const ing = ingredientById.get(p.ingredient_id)
    if (ing) have.set(p.ingredient_id, (have.get(p.ingredient_id) ?? 0) + toGrams(Number(p.quantity), p.unit, ing))
  }
  const lines: ListLine[] = []
  for (const [id, need] of needs) {
    const ing = ingredientById.get(id)
    if (!ing) continue
    const got = have.get(id) ?? 0
    const missing = need - got
    // Tolerancia: si falta menos del 10 % o menos de 5 g, no vale la pena comprar
    if (missing <= Math.max(5, need * 0.1)) continue
    lines.push({ ingredient_id: id, needGrams: need, haveGrams: got, ...purchasable(missing, ing) })
  }
  return lines
}

// ---------- precios ----------

export type PriceOption = {
  id: string
  ingredient_id: string
  store: string
  product_name: string
  brand: string | null
  package_qty: number
  package_unit: string
  price: number
}

export type OptionEval = PriceOption & {
  packages: number
  total: number
  perKg: number
  per10gProtein: number | null
}

export function evaluateOption(opt: PriceOption, needGrams: number, ing: Ing): OptionEval {
  const pkgGrams = toGrams(Number(opt.package_qty), opt.package_unit, ing)
  const packages = Math.max(1, Math.ceil(needGrams / pkgGrams - 0.02))
  const protein = ing.protein_100g ?? 0
  return {
    ...opt,
    packages,
    total: round2(packages * Number(opt.price)),
    perKg: round2((Number(opt.price) / pkgGrams) * 1000),
    per10gProtein: protein >= 3 ? round2((Number(opt.price) / ((pkgGrams * protein) / 100)) * 10) : null,
  }
}

/** Opciones evaluadas y ordenadas de menor a mayor costo para cubrir la cantidad. */
export function rankOptions(options: PriceOption[], needGrams: number, ing: Ing): OptionEval[] {
  return options.map((o) => evaluateOption(o, needGrams, ing)).sort((a, b) => a.total - b.total || a.perKg - b.perKg)
}

export type StoreTotal = { store: string; total: number; covered: number }
export type Comparison = {
  byStore: StoreTotal[]
  /** Comprando cada artículo donde sale más barato. */
  best: { total: number; covered: number }
  itemsWithPrices: number
}

/**
 * Compara tiendas para toda la lista.
 * `lines`: artículos con los gramos a comprar; `prices`: todos los precios capturados.
 */
export function compareStores(
  lines: { ingredient_id: string; grams: number }[],
  prices: PriceOption[],
  ingredientById: Map<string, Ing>,
): Comparison {
  const byIng = new Map<string, PriceOption[]>()
  for (const p of prices) byIng.set(p.ingredient_id, [...(byIng.get(p.ingredient_id) ?? []), p])

  const stores = new Map<string, StoreTotal>()
  let bestTotal = 0
  let bestCovered = 0
  let withPrices = 0

  for (const line of lines) {
    const ing = ingredientById.get(line.ingredient_id)
    const opts = byIng.get(line.ingredient_id)
    if (!ing || !opts?.length) continue
    withPrices++
    const ranked = rankOptions(opts, line.grams, ing)
    bestTotal += ranked[0].total
    bestCovered++
    const cheapestPerStore = new Map<string, number>()
    for (const r of ranked) if (!cheapestPerStore.has(r.store)) cheapestPerStore.set(r.store, r.total)
    for (const [store, total] of cheapestPerStore) {
      const s = stores.get(store) ?? { store, total: 0, covered: 0 }
      s.total = round2(s.total + total)
      s.covered++
      stores.set(store, s)
    }
  }

  return {
    // Primero las tiendas que surten más artículos; luego la más barata
    byStore: [...stores.values()].sort((a, b) => b.covered - a.covered || a.total - b.total),
    best: { total: round2(bestTotal), covered: bestCovered },
    itemsWithPrices: withPrices,
  }
}

export function formatMoney(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ---------- descontar de la despensa al cocinar ----------

export type { PantryRecord }

/** Compatibilidad: descuenta (sign −1) o regresa (+1) los ingredientes de N porciones de una receta. */
export function pantryAfterCooking(recipe: RecipeLike, servings: number, pantry: PantryRecord[], ingredientById: Map<string, Ing>, sign: 1 | -1) {
  return pantryAfterUsing(itemUses({ recipe_id: recipe.id, servings }, recipe), pantry, ingredientById, sign)
}
