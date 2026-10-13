import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'

export type Ingredient = Tables<'ingredients'>
export type RecipeIngredient = Tables<'recipe_ingredients'>
export type Recipe = Tables<'recipes'> & { ingredients: RecipeIngredient[] }
export type Measure = Tables<'ingredient_measures'>

export type Catalog = {
  ingredients: Ingredient[]
  /** Ingredientes con el peso por pieza ya ajustado a tus medidas. */
  ingredientById: Map<string, Ingredient>
  recipes: Recipe[]
  recipeById: Map<string, Recipe>
  /** Medidas por ingrediente: tus ajustes reemplazan a la medida general del mismo nombre. */
  measuresByIngredient: Map<string, Measure[]>
}

// El catálogo cambia poco: se carga una vez por sesión y se comparte entre pantallas.
let cache: Promise<Catalog> | null = null
const listeners = new Set<(c: Catalog) => void>()

export function mergeMeasures(rows: Measure[]): Map<string, Measure[]> {
  const out = new Map<string, Measure[]>()
  // Generales primero, luego las del usuario sobrescriben por nombre
  const sorted = [...rows].sort((a, b) => Number(a.owner_id != null) - Number(b.owner_id != null))
  for (const m of sorted) {
    const list = out.get(m.ingredient_id) ?? []
    const idx = list.findIndex((x) => x.name.toLowerCase() === m.name.toLowerCase())
    if (idx >= 0) list[idx] = m
    else list.push(m)
    out.set(m.ingredient_id, list)
  }
  return out
}

async function load(): Promise<Catalog> {
  const [ing, rec, ri, me] = await Promise.all([
    supabase.from('ingredients').select('*').order('name'),
    supabase.from('recipes').select('*').order('name'),
    supabase.from('recipe_ingredients').select('*'),
    supabase.from('ingredient_measures').select('*'),
  ])
  const error = ing.error ?? rec.error ?? ri.error ?? me.error
  if (error) throw new Error(error.message)

  const byRecipe = new Map<string, RecipeIngredient[]>()
  for (const row of ri.data ?? []) {
    const list = byRecipe.get(row.recipe_id) ?? []
    list.push(row)
    byRecipe.set(row.recipe_id, list)
  }
  const recipes = (rec.data ?? []).map((r) => ({ ...r, ingredients: byRecipe.get(r.id) ?? [] }))
  const measuresByIngredient = mergeMeasures(me.data ?? [])

  // El peso de "la pieza" sale de la medida (tu ajuste si existe); así todas las conversiones lo respetan
  const ingredients = (ing.data ?? []).map((i) => {
    const piece = measuresByIngredient.get(i.id)?.find((m) => m.is_piece)
    return piece ? { ...i, grams_per_unit: Number(piece.grams) } : i
  })
  return {
    ingredients,
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
    recipes,
    recipeById: new Map(recipes.map((r) => [r.id, r])),
    measuresByIngredient,
  }
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const onUpdate = (c: Catalog) => !cancelled && setCatalog(c)
    listeners.add(onUpdate)
    cache ??= load()
    cache.then(onUpdate).catch((e: Error) => {
      cache = null
      if (!cancelled) setError(e.message)
    })
    return () => {
      cancelled = true
      listeners.delete(onUpdate)
    }
  }, [])

  /** Recarga el catálogo y avisa a todas las pantallas abiertas. */
  const reload = useCallback(async () => {
    cache = load()
    const c = await cache
    listeners.forEach((l) => l(c))
  }, [])

  return { catalog, error, reload }
}
