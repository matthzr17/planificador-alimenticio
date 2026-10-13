import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/database.types'

export type Ingredient = Tables<'ingredients'>
export type RecipeIngredient = Tables<'recipe_ingredients'>
export type Recipe = Tables<'recipes'> & { ingredients: RecipeIngredient[] }

export type Catalog = {
  ingredients: Ingredient[]
  ingredientById: Map<string, Ingredient>
  recipes: Recipe[]
  recipeById: Map<string, Recipe>
}

// El catálogo cambia poco: se carga una vez por sesión y se comparte entre pantallas.
let cache: Promise<Catalog> | null = null

async function load(): Promise<Catalog> {
  const [ing, rec, ri] = await Promise.all([
    supabase.from('ingredients').select('*').order('name'),
    supabase.from('recipes').select('*').order('name'),
    supabase.from('recipe_ingredients').select('*'),
  ])
  const error = ing.error ?? rec.error ?? ri.error
  if (error) throw new Error(error.message)

  const byRecipe = new Map<string, RecipeIngredient[]>()
  for (const row of ri.data ?? []) {
    const list = byRecipe.get(row.recipe_id) ?? []
    list.push(row)
    byRecipe.set(row.recipe_id, list)
  }
  const recipes = (rec.data ?? []).map((r) => ({ ...r, ingredients: byRecipe.get(r.id) ?? [] }))
  const ingredients = ing.data ?? []
  return {
    ingredients,
    ingredientById: new Map(ingredients.map((i) => [i.id, i])),
    recipes,
    recipeById: new Map(recipes.map((r) => [r.id, r])),
  }
}

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    cache ??= load()
    cache
      .then((c) => !cancelled && setCatalog(c))
      .catch((e: Error) => {
        cache = null
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async () => {
    cache = load()
    setCatalog(await cache)
  }, [])

  return { catalog, error, reload }
}
