import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Favoritas compartidas entre pantallas (menú y recetario)
let cache: Promise<Set<string>> | null = null
const listeners = new Set<(s: Set<string>) => void>()

async function load() {
  const { data, error } = await supabase.from('recipe_favorites').select('recipe_id')
  if (error) throw new Error(error.message)
  return new Set(data.map((r) => r.recipe_id))
}

/** Recetas favoritas. Una versión tuya cuenta como favorita si su receta original lo es (y al revés). */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const on = (s: Set<string>) => !cancelled && setFavorites(s)
    listeners.add(on)
    cache ??= load()
    cache.then(on).catch(() => {
      cache = null
    })
    return () => {
      cancelled = true
      listeners.delete(on)
    }
  }, [])

  const isFavorite = useCallback(
    (r: { id: string; base_recipe_id?: string | null }) => favorites.has(r.id) || (!!r.base_recipe_id && favorites.has(r.base_recipe_id)),
    [favorites],
  )

  const toggle = useCallback(
    async (r: { id: string; base_recipe_id?: string | null }) => {
      // Se guarda contra la receta original para que sobreviva a tus versiones
      const key = r.base_recipe_id ?? r.id
      const fav = isFavorite(r)
      const { error } = fav
        ? await supabase.from('recipe_favorites').delete().in('recipe_id', [key, r.id])
        : await supabase.from('recipe_favorites').insert({ recipe_id: key })
      if (error) return error.message
      const next = new Set(favorites)
      if (fav) {
        next.delete(key)
        next.delete(r.id)
      } else next.add(key)
      cache = Promise.resolve(next)
      listeners.forEach((l) => l(next))
      return null
    },
    [favorites, isFavorite],
  )

  return { favorites, isFavorite, toggle }
}
