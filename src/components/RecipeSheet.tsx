import { Check, Clock, Users } from 'lucide-react'
import type { Catalog, Recipe } from '@/hooks/useCatalog'
import type { InventoryItem } from '@/hooks/useInventory'
import { MEAL_LABEL, type MealType } from '@/lib/planner'
import { describeServing } from '@/lib/servings'
import { formatQty, measureText, toGrams, type MeasureLike } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Sheet } from '@/components/ui/sheet'

/** Cantidad con nombre de pieza cuando aplica: "3 huevos" en lugar de "3 pza". */
function qtyText(q: number, unit: string, measures: MeasureLike[] | undefined) {
  const piece = measures?.find((m) => m.is_piece)
  return unit === 'pza' && piece ? measureText(Math.round(q * 4) / 4, piece) : formatQty(q, unit)
}

const fmtServings = (s: number) => (s === 1 ? '1 porción' : `${String(s).replace('.5', '½').replace(/^0/, '')} porciones`)

/** Cuántos ingredientes de la receta (para N porciones) alcanzan con la despensa. */
export function pantryCoverage(recipe: Recipe, servings: number, catalog: Catalog, inventory: InventoryItem[]) {
  const stock = new Map<string, number>()
  for (const it of inventory) {
    const ing = catalog.ingredientById.get(it.ingredient_id)
    if (ing) stock.set(it.ingredient_id, toGrams(Number(it.quantity), it.unit, ing))
  }
  let have = 0
  const status = new Map<string, boolean>()
  for (const ri of recipe.ingredients) {
    const ing = catalog.ingredientById.get(ri.ingredient_id)
    if (!ing) continue
    const need = (toGrams(Number(ri.quantity), ri.unit, ing) / recipe.servings) * servings
    const ok = (stock.get(ri.ingredient_id) ?? 0) >= need * 0.9
    status.set(ri.ingredient_id, ok)
    if (ok) have++
  }
  return { have, total: recipe.ingredients.length, status }
}

export function RecipeSheet({
  recipe,
  servings,
  catalog,
  inventory,
  onClose,
  onRestoreOriginal,
}: {
  recipe: Recipe
  servings: number
  catalog: Catalog
  inventory: InventoryItem[]
  onClose: () => void
  /** Solo para tus versiones: volver a la receta original. */
  onRestoreOriginal?: () => Promise<string | null>
}) {
  const { status } = pantryCoverage(recipe, servings, catalog, inventory)
  const factor = servings / recipe.servings
  const steps = Array.isArray(recipe.instructions) ? (recipe.instructions as string[]) : []
  const macros = [
    { label: 'kcal', value: Math.round((recipe.kcal_serving ?? 0) * servings) },
    { label: 'proteína', value: `${Math.round((recipe.protein_serving ?? 0) * servings)} g` },
    { label: 'carbos', value: `${Math.round((recipe.carbs_serving ?? 0) * servings)} g` },
    { label: 'grasa', value: `${Math.round((recipe.fat_serving ?? 0) * servings)} g` },
  ]

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={recipe.name} description={recipe.description ?? MEAL_LABEL[recipe.meal_type as MealType]}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" />
            {recipe.prep_time_min} min
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-4" />
            {describeServing(recipe.serving_parts, servings) ?? fmtServings(servings)}
          </span>
        </div>

        {recipe.owner_id && recipe.base_recipe_id && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-secondary p-3 text-sm text-secondary-foreground">
            <p className="min-w-0 flex-1">Es tu versión de esta receta, con los ingredientes que agregaste.</p>
            {onRestoreOriginal && (
              <button type="button" className="shrink-0 text-sm font-medium underline-offset-4 hover:underline" onClick={() => onRestoreOriginal().then((e) => !e && onClose())}>
                Volver a la original
              </button>
            )}
          </div>
        )}

        <dl className="grid grid-cols-4 gap-2 rounded-lg bg-muted p-3 text-center">
          {macros.map((m) => (
            <div key={m.label}>
              <dd className="font-display text-lg font-semibold tabular-nums">{m.value}</dd>
              <dt className="text-[11px] text-muted-foreground">{m.label}</dt>
            </div>
          ))}
        </dl>

        <section>
          <h3 className="mb-2 text-base font-semibold">Ingredientes</h3>
          <ul className="divide-y rounded-lg border">
            {recipe.ingredients.map((ri) => {
              const ing = catalog.ingredientById.get(ri.ingredient_id)
              const ok = status.get(ri.ingredient_id)
              return (
                <li key={ri.ingredient_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border',
                      ok ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                    )}
                    aria-label={ok ? 'Lo tienes en la despensa' : 'No alcanza con tu despensa'}
                  >
                    {ok && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{ing?.name ?? 'Ingrediente'}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{qtyText(Number(ri.quantity) * factor, ri.unit, catalog.measuresByIngredient.get(ri.ingredient_id))}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Marcados: lo tienes en la despensa en cantidad suficiente.</p>
        </section>

        {steps.length > 0 && (
          <section>
            <h3 className="mb-2 text-base font-semibold">Preparación</h3>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Las cantidades ya están ajustadas a tus porciones. Sal y pimienta al gusto.</p>
          </section>
        )}
      </div>
    </Sheet>
  )
}

export { fmtServings }
