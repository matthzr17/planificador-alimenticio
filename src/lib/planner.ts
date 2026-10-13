// Generador del menú semanal. Funciones puras: reciben datos y regresan el plan, sin red ni UI.
//
// Para cada día (lunes a domingo) y cada comida:
//   1. Filtra recetas del tipo de comida, compatibles con la dieta y que caben en el tiempo del día
//      (días ocupados → máximo de minutos corto; días libres → máximo largo).
//   2. Puntúa cada candidata: cuánto se cubre con la despensa (lo más importante), si usa algo
//      que caduca pronto, variedad (castiga repetir), afinidad con la dieta y un poco de azar.
//   3. Ajusta las porciones para que la comida aporte su parte de las calorías del día.
//   4. "Consume" de una despensa virtual para que la siguiente comida no cuente lo mismo dos veces.

import type { DietType } from './nutrition'
import { parseParts, snapServings } from './servings'
import { toGrams } from './units'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Colación',
}

/**
 * Orden de los días en el plan: domingo (0) … sábado (6), con la convención de JS.
 * La semana empieza en domingo para poder cocinar de más el domingo y comer sobras lunes y martes.
 */
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6]

// Reparto de las calorías del día. Con ayuno 16:8 no hay desayuno.
export const MEAL_SPLIT: Record<'default' | 'fasting', Partial<Record<MealType, number>>> = {
  default: { breakfast: 0.25, lunch: 0.35, dinner: 0.28, snack: 0.12 },
  fasting: { lunch: 0.45, dinner: 0.4, snack: 0.15 },
}

export type PlannerIngredient = { id: string; grams_per_unit: number | null; default_unit: string }
export type PlannerRecipe = {
  id: string
  name: string
  meal_type: string | null
  prep_time_min: number
  servings: number
  diet_tags: string[] | null
  kcal_serving: number | null
  protein_serving: number | null
  /** Cómo se sirve 1 porción; sirve para que las piezas salgan enteras. */
  serving_parts?: unknown
  ingredients: { ingredient_id: string; quantity: number; unit: string }[]
}
export type PantryItem = { ingredient_id: string; quantity: number; unit: string; expires_on: string | null }

export type PlannerInput = {
  recipes: PlannerRecipe[]
  ingredientById: Map<string, PlannerIngredient>
  pantry: PantryItem[]
  diet: DietType
  targetKcal: number
  busyDays: number[]
  busyMaxMin: number
  freeMaxMin: number
  /** Fecha del domingo con el que empieza la semana (para saber qué caduca pronto). */
  weekStart: Date
  seed?: number
  /** Recetas favoritas: salen más seguido. */
  favorites?: Set<string>
  /** Cocinar de más en días libres para comer sobras en días ocupados. */
  batchCooking?: boolean
  /** Presupuesto semanal para comida (MXN). Con precios capturados, el menú prefiere lo que cabe. */
  weeklyBudget?: number | null
  /** Precio más barato capturado por gramo de cada ingrediente (MXN/g). */
  pricePerGram?: Map<string, number>
}

export type PlanItem = {
  day_of_week: number
  meal_type: MealType
  recipe_id: string
  servings: number
  /** Si es sobra: el día en que se cocinó la tanda. */
  leftover_of_day?: number | null
}
export type PlanResult = { items: PlanItem[]; warnings: string[] }

const SERVING_STEP = 0.5
const MIN_SERVINGS = 0.5
const MAX_SERVINGS = 3

// ---------- utilidades ----------

/** Generador pseudoaleatorio con semilla (mulberry32): mismo seed → mismo menú. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Domingo con el que empieza la semana del menú. */
export function weekStartOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function dietAllows(recipe: Pick<PlannerRecipe, 'diet_tags'>, diet: DietType): boolean {
  const tags = recipe.diet_tags ?? []
  if (diet === 'keto') return tags.includes('keto')
  if (diet === 'vegetarian') return tags.includes('vegetarian')
  return true
}

export function servingsFor(mealKcal: number, kcalPerServing: number): number {
  const ideal = mealKcal / kcalPerServing
  const rounded = Math.round(ideal / SERVING_STEP) * SERVING_STEP
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, rounded))
}

/** Gramos por ingrediente para N porciones de la receta. */
export function recipeGrams(recipe: PlannerRecipe, servings: number, ingredientById: Map<string, PlannerIngredient>) {
  const out = new Map<string, number>()
  for (const ri of recipe.ingredients) {
    const ing = ingredientById.get(ri.ingredient_id)
    if (!ing) continue
    const g = (toGrams(Number(ri.quantity), ri.unit, ing) / recipe.servings) * servings
    out.set(ri.ingredient_id, (out.get(ri.ingredient_id) ?? 0) + g)
  }
  return out
}

// ---------- estado del generador ----------

type State = {
  input: PlannerInput
  stock: Map<string, number> // gramos disponibles en la despensa virtual
  expiringSoon: Set<string>
  uses: Map<string, number> // veces que se usó cada receta en la semana
  usedOnDay: Map<number, Set<string>>
  random: () => number
  /** Sobras ya apartadas: "día:comida" → receta y porciones. */
  reserved: Map<string, { recipe: PlannerRecipe; servings: number; cookDay: number }>
}

function initState(input: PlannerInput): State {
  const stock = new Map<string, number>()
  const expiringSoon = new Set<string>()
  const limit = new Date(input.weekStart)
  limit.setDate(limit.getDate() + 3)
  for (const p of input.pantry) {
    const ing = input.ingredientById.get(p.ingredient_id)
    if (!ing) continue
    stock.set(p.ingredient_id, (stock.get(p.ingredient_id) ?? 0) + toGrams(Number(p.quantity), p.unit, ing))
    if (p.expires_on && p.expires_on <= isoDate(limit)) expiringSoon.add(p.ingredient_id)
  }
  return {
    input,
    stock,
    expiringSoon,
    uses: new Map(),
    usedOnDay: new Map(),
    random: rng(input.seed ?? 1),
    reserved: new Map(),
  }
}

function candidates(state: State, day: number, meal: MealType): { list: PlannerRecipe[]; relaxed: 'none' | 'time' | 'diet' } {
  const { recipes, diet, busyDays, busyMaxMin, freeMaxMin } = state.input
  const maxMin = busyDays.includes(day) ? busyMaxMin : freeMaxMin
  const ofMeal = recipes.filter((r) => r.meal_type === meal && (r.kcal_serving ?? 0) > 0)
  const byDiet = ofMeal.filter((r) => dietAllows(r, diet))
  const inTime = byDiet.filter((r) => r.prep_time_min <= maxMin)
  if (inTime.length) return { list: inTime, relaxed: 'none' }
  if (byDiet.length) {
    // Nada cabe en el tiempo: usa las más rápidas que haya
    const fastest = Math.min(...byDiet.map((r) => r.prep_time_min))
    return { list: byDiet.filter((r) => r.prep_time_min <= fastest + 10), relaxed: 'time' }
  }
  return { list: ofMeal, relaxed: 'diet' }
}

function score(state: State, recipe: PlannerRecipe, day: number, mealKcal: number) {
  const { diet, ingredientById } = state.input
  const servings = Math.min(MAX_SERVINGS, snapServings(parseParts(recipe.serving_parts), servingsFor(mealKcal, recipe.kcal_serving!)))
  const need = recipeGrams(recipe, servings, ingredientById)

  // Cobertura con la despensa, ponderada por gramos
  let total = 0
  let covered = 0
  let usesExpiring = false
  for (const [id, g] of need) {
    total += g
    const have = state.stock.get(id) ?? 0
    covered += Math.min(g, have)
    if (have > 0 && state.expiringSoon.has(id)) usesExpiring = true
  }
  const coverage = total > 0 ? covered / total : 0

  let s = coverage * 3
  if (usesExpiring) s += 1.5
  s -= (state.uses.get(recipe.id) ?? 0) * 2.5
  if (state.usedOnDay.get(day)?.has(recipe.id)) s -= 5
  if (diet === 'mediterranean' && recipe.diet_tags?.includes('mediterranean')) s += 1
  if (state.input.favorites?.has(recipe.id)) s += 1.5
  if (batchable(state, recipe, day) && busySlotsAfter(state, day, recipe.meal_type as MealType).length) s += 1.2
  if (diet === 'high_protein' && recipe.kcal_serving) s += (((recipe.protein_serving ?? 0) * 4) / recipe.kcal_serving) * 4
  // Presupuesto: lo que habría que comprar (lo que no cubre la despensa) contra lo que toca por comida
  const budgetPerMeal = mealBudget(state)
  if (budgetPerMeal) {
    const cost = purchaseCost(need, state)
    s -= (cost / budgetPerMeal) * 0.8
    if (cost > budgetPerMeal) s -= ((cost - budgetPerMeal) / budgetPerMeal) * 2
  }
  // Penaliza recetas que necesitan porciones muy forzadas para llegar a las calorías
  const ideal = mealKcal / recipe.kcal_serving!
  s -= Math.abs(ideal - servings) * 0.8
  s += state.random() * 0.8

  return { score: s, servings, need, coverage }
}

/** Presupuesto por comida = presupuesto semanal / comidas de la semana. Null si no aplica. */
function mealBudget(state: State): number | null {
  const { weeklyBudget, pricePerGram, diet } = state.input
  if (!weeklyBudget || !pricePerGram?.size) return null
  const meals = Object.keys(mealsFor(diet)).length * 7
  return weeklyBudget / meals
}

/** Costo estimado de comprar lo que la despensa no cubre (ingredientes sin precio cuentan como $0). */
export function purchaseCost(need: Map<string, number>, state: Pick<State, 'stock' | 'input'>): number {
  let cost = 0
  for (const [id, g] of need) {
    const missing = Math.max(0, g - (state.stock.get(id) ?? 0))
    cost += missing * (state.input.pricePerGram?.get(id) ?? 0)
  }
  return cost
}

function commit(state: State, day: number, recipe: PlannerRecipe, need: Map<string, number>) {
  state.uses.set(recipe.id, (state.uses.get(recipe.id) ?? 0) + 1)
  const set = state.usedOnDay.get(day) ?? new Set<string>()
  set.add(recipe.id)
  state.usedOnDay.set(day, set)
  for (const [id, g] of need) {
    const have = state.stock.get(id)
    if (have != null) state.stock.set(id, Math.max(0, have - g))
  }
}

const MAX_LEFTOVERS = 2

/** Recetas que rinden (3+ porciones) en comida o cena de un día libre: se cocina de más. */
function batchable(state: State, recipe: PlannerRecipe, day: number) {
  return (
    !!state.input.batchCooking &&
    recipe.servings >= 3 &&
    (recipe.meal_type === 'lunch' || recipe.meal_type === 'dinner') &&
    !state.input.busyDays.includes(day)
  )
}

/** Hasta 2 días ocupados siguientes (dentro de 3 días) con esa comida libre para sobras. */
function busySlotsAfter(state: State, day: number, meal: MealType): number[] {
  const idx = WEEK_ORDER.indexOf(day)
  return WEEK_ORDER.slice(idx + 1, idx + 4)
    .filter((d) => state.input.busyDays.includes(d) && !state.reserved.has(`${d}:${meal}`))
    .slice(0, MAX_LEFTOVERS)
}

/** Cuántas comidas cubre un platillo: él mismo más sus sobras en la semana. */
export function batchFactor(item: { day_of_week: number; meal_type: string; recipe_id: string; leftover_of_day?: number | null }, items: typeof item[]) {
  if (item.leftover_of_day != null) return 0
  return 1 + items.filter((o) => o.leftover_of_day === item.day_of_week && o.meal_type === item.meal_type && o.recipe_id === item.recipe_id).length
}

function mealsFor(diet: DietType) {
  return diet === 'intermittent_fasting' ? MEAL_SPLIT.fasting : MEAL_SPLIT.default
}

// ---------- API ----------

export function generateWeek(input: PlannerInput): PlanResult {
  const state = initState(input)
  const split = mealsFor(input.diet)
  const items: PlanItem[] = []
  const warnings = new Set<string>()

  for (const day of WEEK_ORDER) {
    for (const meal of Object.keys(split) as MealType[]) {
      const mealKcal = input.targetKcal * split[meal]!

      // Si esta comida ya tiene sobras apartadas, se usan
      const reserved = state.reserved.get(`${day}:${meal}`)
      if (reserved) {
        commit(state, day, reserved.recipe, new Map())
        items.push({ day_of_week: day, meal_type: meal, recipe_id: reserved.recipe.id, servings: reserved.servings, leftover_of_day: reserved.cookDay })
        continue
      }

      const { list, relaxed } = candidates(state, day, meal)
      if (!list.length) {
        warnings.add(`No hay recetas de ${MEAL_LABEL[meal].toLowerCase()} disponibles.`)
        continue
      }
      if (relaxed === 'time') warnings.add(`Algunos ${MEAL_LABEL[meal].toLowerCase()}s tardan más que tu tiempo disponible: no hay recetas tan rápidas.`)
      if (relaxed === 'diet') warnings.add(`No hay suficientes recetas de ${MEAL_LABEL[meal].toLowerCase()} para tu dieta; se usaron otras.`)

      const best = list.map((r) => ({ r, ...score(state, r, day, mealKcal) })).sort((a, b) => b.score - a.score)[0]

      // Cocinar de más: aparta sobras para los siguientes días ocupados
      const slots = batchable(state, best.r, day) ? busySlotsAfter(state, day, meal) : []
      for (const d of slots) state.reserved.set(`${d}:${meal}`, { recipe: best.r, servings: best.servings, cookDay: day })
      const need = new Map([...best.need].map(([id, g]) => [id, g * (1 + slots.length)]))

      commit(state, day, best.r, need)
      items.push({ day_of_week: day, meal_type: meal, recipe_id: best.r.id, servings: best.servings })
    }
  }
  return { items, warnings: [...warnings] }
}

/**
 * Propone otra receta para un platillo del plan, respetando las mismas reglas.
 * `plan` es el plan actual (para la variedad); el platillo a cambiar se excluye.
 */
export function alternativeFor(input: PlannerInput, plan: PlanItem[], target: PlanItem, exclude: string[] = []): PlanItem | null {
  const state = initState(input)
  for (const it of plan) {
    if (it === target || (it.day_of_week === target.day_of_week && it.meal_type === target.meal_type)) continue
    const r = input.recipes.find((x) => x.id === it.recipe_id)
    if (r) commit(state, it.day_of_week, r, recipeGrams(r, it.servings, input.ingredientById))
  }
  const split = mealsFor(input.diet)
  const mealKcal = input.targetKcal * (split[target.meal_type] ?? 0.25)
  const skip = new Set([target.recipe_id, ...exclude])
  const { list } = candidates(state, target.day_of_week, target.meal_type)
  const ranked = list
    .filter((r) => !skip.has(r.id))
    .map((r) => ({ r, ...score(state, r, target.day_of_week, mealKcal) }))
    .sort((a, b) => b.score - a.score)
  if (!ranked.length) return null
  return { ...target, recipe_id: ranked[0].r.id, servings: ranked[0].servings }
}

/** Totales de un día del plan. */
export function dayTotals(items: { recipe_id: string; servings: number }[], recipeById: Map<string, { kcal_serving: number | null; protein_serving: number | null; carbs_serving?: number | null; fat_serving?: number | null }>) {
  return items.reduce(
    (t, it) => {
      const r = recipeById.get(it.recipe_id)
      if (!r) return t
      t.kcal += (r.kcal_serving ?? 0) * it.servings
      t.protein += (r.protein_serving ?? 0) * it.servings
      t.carbs += (r.carbs_serving ?? 0) * it.servings
      t.fat += (r.fat_serving ?? 0) * it.servings
      return t
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}
