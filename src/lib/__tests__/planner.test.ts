import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo JS del seed, sin tipos
import { INGREDIENTES, RECETAS } from '../../../supabase/seed/catalogo.mjs'
import { alternativeFor, batchFactor, dayTotals, generateWeek, weekStartOf, WEEK_ORDER, type PlannerInput, type PlannerRecipe } from '../planner'
import { toGrams } from '../units'

// Reconstruye el catálogo real (mismo cálculo de macros que el SQL) para probar con datos verdaderos.
type IngRow = [string, string, string, number | null, number, number, number, number]
type RecRow = { n: string; t: string; min: number; s: number; tags: string[]; ing: [string, number, string][] }

const ingredients = (INGREDIENTES as IngRow[]).map(([name, , unit, gpu, kcal, p, c, f]) => ({
  id: name,
  grams_per_unit: gpu,
  default_unit: unit,
  kcal,
  p,
  c,
  f,
}))
const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

const recipes: (PlannerRecipe & { carbs_serving: number; fat_serving: number })[] = (RECETAS as RecRow[]).map((r) => {
  const tot = { kcal: 0, p: 0, c: 0, f: 0 }
  for (const [name, q, u] of r.ing) {
    const ing = ingredientById.get(name)!
    const g = toGrams(q, u, ing)
    tot.kcal += (g * ing.kcal) / 100
    tot.p += (g * ing.p) / 100
    tot.c += (g * ing.c) / 100
    tot.f += (g * ing.f) / 100
  }
  return {
    id: r.n,
    name: r.n,
    meal_type: r.t,
    prep_time_min: r.min,
    servings: r.s,
    diet_tags: r.tags,
    kcal_serving: tot.kcal / r.s,
    protein_serving: tot.p / r.s,
    carbs_serving: tot.c / r.s,
    fat_serving: tot.f / r.s,
    ingredients: r.ing.map(([name, q, u]) => ({ ingredient_id: name, quantity: q, unit: u })),
  }
})
const recipeById = new Map(recipes.map((r) => [r.id, r]))

const base: PlannerInput = {
  recipes,
  ingredientById,
  pantry: [],
  diet: 'traditional',
  targetKcal: 2200,
  busyDays: [1, 2, 3, 4, 5],
  busyMaxMin: 15,
  freeMaxMin: 60,
  weekStart: weekStartOf(new Date(2026, 9, 14)),
  seed: 42,
}

describe('generador de menú', () => {
  it('arma 7 días con 4 comidas', () => {
    const { items } = generateWeek(base)
    expect(items).toHaveLength(28)
    for (const d of WEEK_ORDER) expect(items.filter((i) => i.day_of_week === d)).toHaveLength(4)
  })

  it('cada día queda cerca de las calorías objetivo (±15 %)', () => {
    const { items } = generateWeek(base)
    for (const d of WEEK_ORDER) {
      const kcal = dayTotals(items.filter((i) => i.day_of_week === d), recipeById).kcal
      expect(Math.abs(kcal - base.targetKcal) / base.targetKcal).toBeLessThan(0.15)
    }
  })

  it('respeta el tiempo en días ocupados cuando hay recetas que caben', () => {
    const { items } = generateWeek(base)
    const busyBreakfasts = items.filter((i) => base.busyDays.includes(i.day_of_week) && i.meal_type === 'breakfast')
    for (const it of busyBreakfasts) expect(recipeById.get(it.recipe_id)!.prep_time_min).toBeLessThanOrEqual(15)
  })

  it('con dieta keto solo usa recetas keto', () => {
    const { items } = generateWeek({ ...base, diet: 'keto' })
    for (const it of items) expect(recipeById.get(it.recipe_id)!.diet_tags).toContain('keto')
  })

  it('con dieta vegetariana no usa carne', () => {
    const { items } = generateWeek({ ...base, diet: 'vegetarian' })
    for (const it of items) expect(recipeById.get(it.recipe_id)!.diet_tags).toContain('vegetarian')
  })

  it('con ayuno intermitente no hay desayunos', () => {
    const { items } = generateWeek({ ...base, diet: 'intermittent_fasting' })
    expect(items.some((i) => i.meal_type === 'breakfast')).toBe(false)
    expect(items).toHaveLength(21)
  })

  it('prioriza lo que hay en la despensa', () => {
    const pantry = [
      { ingredient_id: 'Salmón', quantity: 600, unit: 'g', expires_on: null },
      { ingredient_id: 'Camote', quantity: 3, unit: 'pza', expires_on: null },
      { ingredient_id: 'Ejotes', quantity: 400, unit: 'g', expires_on: null },
    ]
    const { items } = generateWeek({ ...base, pantry })
    expect(items.some((i) => i.recipe_id === 'Salmón al horno con camote y ejotes')).toBe(true)
  })

  it('da variedad: ninguna receta más de 3 veces por semana', () => {
    const { items } = generateWeek(base)
    const count = new Map<string, number>()
    for (const it of items) count.set(it.recipe_id, (count.get(it.recipe_id) ?? 0) + 1)
    expect(Math.max(...count.values())).toBeLessThanOrEqual(3)
  })

  it('la misma semilla da el mismo menú; otra semilla, uno distinto', () => {
    const a = generateWeek(base).items.map((i) => i.recipe_id).join()
    const b = generateWeek(base).items.map((i) => i.recipe_id).join()
    const c = generateWeek({ ...base, seed: 7 }).items.map((i) => i.recipe_id).join()
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  it('propone una alternativa distinta para un platillo', () => {
    const { items } = generateWeek(base)
    const target = items.find((i) => i.meal_type === 'lunch')!
    const alt = alternativeFor(base, items, target)
    expect(alt).not.toBeNull()
    expect(alt!.recipe_id).not.toBe(target.recipe_id)
    expect(alt!.meal_type).toBe('lunch')
  })
})

describe('porciones en piezas enteras', () => {
  it('las recetas por pieza salen con piezas enteras', () => {
    const conPiezas = recipes.map((r) =>
      r.meal_type === 'dinner' || r.meal_type === 'lunch' ? { ...r, serving_parts: [{ q: 3, one: 'taco', many: 'tacos', count: true }] } : r,
    )
    const { items } = generateWeek({ ...base, recipes: conPiezas })
    for (const it of items.filter((i) => i.meal_type === 'lunch' || i.meal_type === 'dinner')) {
      expect(Number.isInteger(Math.round(it.servings * 3 * 1000) / 1000)).toBe(true)
    }
  })
})

describe('favoritas y cocinar para varios días', () => {
  it('las favoritas salen más seguido', () => {
    const fav = 'Tacos de pollo con nopales'
    const count = (favorites?: Set<string>) =>
      [1, 2, 3, 4, 5].reduce((n, seed) => n + generateWeek({ ...base, seed, favorites }).items.filter((i) => i.recipe_id === fav).length, 0)
    expect(count(new Set([fav]))).toBeGreaterThan(count())
  })

  it('cocina de más en día libre y aparta sobras para días ocupados', () => {
    // Lunes a viernes ocupados: se cocina de más el domingo y las sobras van a lunes y martes
    const input = { ...base, batchCooking: true, busyDays: [1, 2, 3, 4, 5], freeMaxMin: 60 }
    const { items } = generateWeek(input)
    const leftovers = items.filter((i) => i.leftover_of_day != null)
    expect(leftovers.length).toBeGreaterThan(0)
    expect(leftovers.every((l) => l.leftover_of_day === 0 && [1, 2].includes(l.day_of_week))).toBe(true)
    for (const l of leftovers) {
      const cook = items.find((i) => i.day_of_week === l.leftover_of_day && i.meal_type === l.meal_type)!
      expect(cook.recipe_id).toBe(l.recipe_id)
      expect(input.busyDays).toContain(l.day_of_week)
      expect(input.busyDays).not.toContain(cook.day_of_week)
      expect(batchFactor(cook, items)).toBeGreaterThan(1)
    }
  })

  it('con días libres entre semana sí genera sobras', () => {
    const { items } = generateWeek({ ...base, batchCooking: true, busyDays: [2, 3, 5, 6], freeMaxMin: 60 })
    expect(items.some((i) => i.leftover_of_day != null)).toBe(true)
  })

  it('sin la opción no hay sobras', () => {
    const { items } = generateWeek({ ...base, batchCooking: false })
    expect(items.some((i) => i.leftover_of_day != null)).toBe(false)
  })
})
