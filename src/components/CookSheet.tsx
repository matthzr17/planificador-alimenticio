import { useMemo, useState } from 'react'
import { ArrowLeftRight, Check, ChevronLeft, Loader2, Minus, Plus, RotateCcw, Search, Undo2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import type { Catalog, Ingredient, Recipe } from '@/hooks/useCatalog'
import type { InventoryItem } from '@/hooks/useInventory'
import type { MealPlanItem } from '@/hooks/usePlan'
import { applySwap, itemUses, macrosOf, pantryAfterUsing, scaleUses, versionIngredients, type Use } from '@/lib/cooking'
import { batchFactor } from '@/lib/planner'
import { supabase } from '@/lib/supabase'
import { describeServing } from '@/lib/servings'
import { formatQty, norm, toGrams, type Unit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { normalizeQty, QuantityInput, type QtyUnit } from '@/components/QuantityInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'

type Row = {
  key: string
  ingredient_id: string
  /** Ingrediente de la receta al que reemplaza (si es un cambio). */
  replaces: string | null
  added: boolean
  removed: boolean
  qty: string
  unit: QtyUnit
}

type Mode = { kind: 'choose' } | { kind: 'edit' } | { kind: 'swap'; rowKey: string } | { kind: 'add' } | { kind: 'ask' }

export type CookDeps = {
  catalog: Catalog
  inventory: InventoryItem[]
  weekItems: MealPlanItem[]
  updateItem: (item: MealPlanItem, changes: Partial<Pick<MealPlanItem, 'recipe_id' | 'is_done' | 'ingredients_override'>>) => Promise<string | null>
  upsertPantry: (row: { ingredient_id: string; quantity: number; unit: string; is_approximate: boolean; expires_on: string | null }) => Promise<string | null>
  reloadCatalog: () => Promise<void>
}

/**
 * Marcar un platillo como hecho.
 * "Lo cociné tal cual" descuenta lo planeado. "Hice cambios" permite cambiar, ajustar, quitar o agregar ingredientes;
 * se descuenta exactamente lo usado y las calorías del platillo se recalculan.
 */
export function CookSheet({ item, recipe, deps, onClose, onNotice }: { item: MealPlanItem; recipe: Recipe; deps: CookDeps; onClose: () => void; onNotice: (t: string, kind?: 'ok' | 'error') => void }) {
  const { catalog, inventory } = deps
  const { session } = useAuth()
  // Si se cocina de más (hoy y sobras), se cocina y descuenta la tanda completa
  const factor = Math.max(1, batchFactor(item, deps.weekItems))
  const leftovers = deps.weekItems.filter((o) => o.leftover_of_day === item.day_of_week && o.meal_type === item.meal_type && o.recipe_id === item.recipe_id)
  const planned = useMemo(() => scaleUses(itemUses({ ...item, servings: Number(item.servings) }, recipe), factor), [item, recipe, factor])
  const [mode, setMode] = useState<Mode>({ kind: 'choose' })
  const [rows, setRows] = useState<Row[]>(() =>
    planned.map((u, i) => ({ key: `r${i}`, ingredient_id: u.ingredient_id, replaces: null, added: false, removed: false, qty: fmt(u.quantity), unit: { kind: 'unit', unit: u.unit as Unit } })),
  )
  const [weekScope, setWeekScope] = useState<'once' | 'week'>('once')
  const [recipeScope, setRecipeScope] = useState<'once' | 'always'>('once')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const servingText = describeServing(recipe.serving_parts, Number(item.servings))

  const ing = (id: string) => catalog.ingredientById.get(id)!
  const actual: Use[] = rows
    .filter((r) => !r.removed)
    .map((r) => ({ r, n: Number(r.qty.replace(',', '.')) }))
    .filter(({ n }) => n > 0)
    .map(({ r, n }) => ({ ingredient_id: r.ingredient_id, ...normalizeQty(n, r.unit, ing(r.ingredient_id)) }))
  const swaps = rows.filter((r) => r.replaces && r.replaces !== r.ingredient_id && !r.removed).map((r) => ({ from: r.replaces!, to: r.ingredient_id }))
  const additions = actual.filter((u) => rows.find((r) => r.ingredient_id === u.ingredient_id)?.added)
  const otherItemsWithSwap = deps.weekItems.filter((other) => {
    if (other.id === item.id || other.is_done || leftovers.some((l) => l.id === other.id)) return false
    const r = catalog.recipeById.get(other.recipe_id)
    if (!r) return false
    const uses = itemUses({ ...other, servings: Number(other.servings) }, r)
    return swaps.some((s) => uses.some((u) => u.ingredient_id === s.from))
  })
  const kcalPlanned = macrosOf(planned, catalog.ingredientById).kcal / factor
  const kcalActual = macrosOf(actual, catalog.ingredientById).kcal / factor

  async function deduct(uses: Use[]) {
    for (const r of pantryAfterUsing(uses, inventory, catalog.ingredientById, -1)) {
      const err = await deps.upsertPantry({ ingredient_id: r.ingredient_id, quantity: r.quantity, unit: r.unit, is_approximate: r.is_approximate, expires_on: r.expires_on })
      if (err) return err
    }
    return null
  }

  async function cookAsPlanned() {
    setBusy(true)
    const err = (await deps.updateItem(item, { is_done: true })) ?? (await deduct(planned))
    setBusy(false)
    if (err) return setError(err)
    onNotice('Listo. Se descontaron los ingredientes de tu despensa.')
    onClose()
  }

  async function finish() {
    setBusy(true)
    setError(null)
    // 1. Este platillo: hecho, con lo que realmente se usó (por comida); se descuenta la tanda completa
    const perMeal = scaleUses(actual, 1 / factor)
    let err = await deps.updateItem(item, { is_done: true, ingredients_override: perMeal })
    if (!err) err = await deduct(actual)
    // Las sobras de esta tanda llevan lo mismo
    for (const l of leftovers) if (!err) err = await deps.updateItem(l, { ingredients_override: perMeal })

    // 2. Cambios para el resto de la semana (solo si así lo elegiste)
    if (!err && weekScope === 'week') {
      for (const other of otherItemsWithSwap) {
        const r = catalog.recipeById.get(other.recipe_id)!
        let uses = itemUses({ ...other, servings: Number(other.servings) }, r)
        for (const s of swaps) uses = applySwap(uses, s.from, s.to, catalog.ingredientById)
        err = await deps.updateItem(other, { ingredients_override: uses })
        if (err) break
      }
    }

    // 3. Ingredientes agregados para siempre: tu versión de la receta
    if (!err && recipeScope === 'always' && additions.length && session) {
      err = await saveVersion()
    }

    setBusy(false)
    if (err) return setError(err)
    onNotice('Listo. Se descontó de tu despensa exactamente lo que usaste.')
    onClose()
  }

  async function saveVersion(): Promise<string | null> {
    const base = recipe.base_recipe_id ? catalog.recipeById.get(recipe.base_recipe_id) ?? recipe : recipe
    const isVersion = !!recipe.owner_id
    const newIngredients = versionIngredients(recipe, additions, Number(item.servings) * factor, catalog.ingredientById)
    const m = macrosOf(newIngredients, catalog.ingredientById)
    const per = (n: number) => Math.round((n / recipe.servings) * 10) / 10
    const macros = { kcal_serving: per(m.kcal), protein_serving: per(m.protein), carbs_serving: per(m.carbs), fat_serving: per(m.fat) }

    let versionId = recipe.id
    if (isVersion) {
      const { error } = await supabase.from('recipes').update(macros).eq('id', recipe.id)
      if (error) return error.message
    } else {
      const { data, error } = await supabase
        .from('recipes')
        .insert({
          owner_id: session!.user.id,
          base_recipe_id: base.id,
          name: base.name,
          description: base.description,
          meal_type: base.meal_type,
          prep_time_min: base.prep_time_min,
          servings: base.servings,
          diet_tags: base.diet_tags,
          instructions: base.instructions,
          serving_parts: base.serving_parts,
          ...macros,
        })
        .select('id')
        .single()
      if (error) return error.message
      versionId = data.id
    }
    const { error: e2 } = await supabase
      .from('recipe_ingredients')
      .upsert(newIngredients.map((u) => ({ recipe_id: versionId, ...u })), { onConflict: 'recipe_id,ingredient_id' })
    if (e2) return e2.message
    // Los platillos pendientes de esta semana con esta receta pasan a tu versión
    for (const other of deps.weekItems) {
      if (other.id !== item.id && !other.is_done && other.recipe_id === recipe.id && versionId !== recipe.id) {
        const e = await deps.updateItem(other, { recipe_id: versionId })
        if (e) return e
      }
    }
    await deps.reloadCatalog()
    return null
  }

  function next() {
    if (otherItemsWithSwap.length || additions.length) setMode({ kind: 'ask' })
    else finish()
  }

  // ---------- vistas ----------

  const title = mode.kind === 'swap' ? 'Cambiar ingrediente' : mode.kind === 'add' ? 'Agregar ingrediente' : recipe.name

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={mode.kind === 'choose' || mode.kind === 'edit' ? (servingText ?? undefined) : undefined}
      footer={
        mode.kind === 'edit' ? (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
              {Math.round(kcalActual)} kcal{factor > 1 && ' por comida'}
              {Math.round(kcalActual) !== Math.round(kcalPlanned) && <span> (planeado {Math.round(kcalPlanned)})</span>}
            </p>
            <Button onClick={next} disabled={busy || actual.length === 0}>
              {busy && <Loader2 className="animate-spin" />}
              Guardar y descontar
            </Button>
          </div>
        ) : mode.kind === 'ask' ? (
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setMode({ kind: 'edit' })} disabled={busy}>
              <ChevronLeft />
              Volver
            </Button>
            <Button onClick={finish} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </div>
        ) : undefined
      }
    >
      {mode.kind === 'choose' && (
        <div className="flex flex-col gap-3">
          {factor > 1 && (
            <p className="rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
              Cocinas para {factor} comidas: hoy y {factor === 2 ? 'una de sobras' : `${factor - 1} de sobras`}. Se descuenta la tanda completa.
            </p>
          )}
          <p className="text-sm text-muted-foreground">¿Cómo lo preparaste?</p>
          <Button size="lg" onClick={cookAsPlanned} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Lo cociné tal cual
          </Button>
          <Button size="lg" variant="outline" onClick={() => setMode({ kind: 'edit' })} disabled={busy}>
            <ArrowLeftRight />
            Hice cambios
          </Button>
          <p className="text-xs text-muted-foreground">En los dos casos se descuenta de tu despensa lo que usaste.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {mode.kind === 'edit' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Ajusta lo que realmente usaste. Puedes cambiar, quitar o agregar ingredientes.</p>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const i = ing(r.ingredient_id)
              const replaced = r.replaces && r.replaces !== r.ingredient_id ? ing(r.replaces) : null
              return (
                <li key={r.key} className={cn('rounded-lg border p-3', r.removed && 'bg-muted/50')}>
                  <div className="mb-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-medium', r.removed && 'text-muted-foreground line-through')}>{i.name}</p>
                      {replaced && <p className="text-xs text-primary">En lugar de {replaced.name}</p>}
                      {r.added && <p className="text-xs text-primary">Agregado</p>}
                      {r.removed && <p className="text-xs text-muted-foreground">No lo usaste</p>}
                    </div>
                    {!r.removed && !r.added && (
                      <Button variant="ghost" size="sm" onClick={() => setMode({ kind: 'swap', rowKey: r.key })}>
                        <ArrowLeftRight />
                        Cambiar
                      </Button>
                    )}
                    {replaced && !r.removed && (
                      <Button variant="ghost" size="sm" aria-label="Deshacer cambio" onClick={() => resetRow(r.key)}>
                        <RotateCcw />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        r.added ? setRows((rs) => rs.filter((x) => x.key !== r.key)) : setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, removed: !x.removed } : x)))
                      }
                    >
                      {r.removed ? <Undo2 /> : <Minus />}
                      {r.removed ? 'Lo usé' : 'Quitar'}
                    </Button>
                  </div>
                  {!r.removed && (
                    <QuantityInput
                      compact
                      id={`q-${r.key}`}
                      ingredient={i}
                      measures={catalog.measuresByIngredient.get(i.id) ?? []}
                      quantity={r.qty}
                      onQuantity={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: v } : x)))}
                      unit={r.unit}
                      onUnit={(u) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, unit: u } : x)))}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <Button variant="outline" onClick={() => setMode({ kind: 'add' })}>
            <Plus />
            Agregar ingrediente
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {mode.kind === 'swap' && (
        <IngredientChooser
          catalog={catalog}
          inventory={inventory}
          group={ing(rows.find((r) => r.key === mode.rowKey)!.replaces ?? rows.find((r) => r.key === mode.rowKey)!.ingredient_id).swap_group}
          exclude={rows.filter((r) => !r.removed).map((r) => r.ingredient_id)}
          onBack={() => setMode({ kind: 'edit' })}
          onPick={(picked) => {
            setRows((rs) =>
              rs.map((x) => {
                if (x.key !== mode.rowKey) return x
                // Conserva el peso de lo planeado al cambiar de ingrediente
                const from = ing(x.ingredient_id)
                const n = Number(x.qty.replace(',', '.')) || 0
                const grams = toGrams(normalizeQty(n, x.unit, from).quantity, normalizeQty(n, x.unit, from).unit, from)
                const conv = applySwap([{ ingredient_id: from.id, quantity: grams, unit: 'g' }], from.id, picked.id, catalog.ingredientById)[0]
                return { ...x, replaces: x.replaces ?? x.ingredient_id, ingredient_id: picked.id, qty: fmt(conv.quantity), unit: { kind: 'unit', unit: conv.unit as Unit } }
              }),
            )
            setMode({ kind: 'edit' })
          }}
        />
      )}

      {mode.kind === 'add' && (
        <IngredientChooser
          catalog={catalog}
          inventory={inventory}
          group={null}
          exclude={rows.filter((r) => !r.removed).map((r) => r.ingredient_id)}
          onBack={() => setMode({ kind: 'edit' })}
          onPick={(picked) => {
            const unit: Unit = picked.default_unit === 'pza' && picked.grams_per_unit ? 'pza' : picked.default_unit === 'ml' ? 'ml' : 'g'
            const firstMeasure = catalog.measuresByIngredient.get(picked.id)?.find((m) => !m.is_piece)
            setRows((rs) => [
              ...rs,
              {
                key: `a${Date.now()}`,
                ingredient_id: picked.id,
                replaces: null,
                added: true,
                removed: false,
                qty: '1',
                unit: firstMeasure ? { kind: 'measure', measure: firstMeasure } : { kind: 'unit', unit },
              },
            ])
            setMode({ kind: 'edit' })
          }}
        />
      )}

      {mode.kind === 'ask' && (
        <div className="flex flex-col gap-5">
          {otherItemsWithSwap.length > 0 && (
            <Question
              title={swaps.map((s) => `${ing(s.to).name} en lugar de ${ing(s.from).name}`).join(', ')}
              text={`Hay ${otherItemsWithSwap.length === 1 ? 'otro platillo' : `${otherItemsWithSwap.length} platillos`} esta semana con ese ingrediente.`}
              value={weekScope}
              onChange={(v) => setWeekScope(v as 'once' | 'week')}
              options={[
                { value: 'once', label: 'Solo esta vez', hint: 'Los demás platillos y la lista de compras se quedan igual.' },
                { value: 'week', label: 'Resto de la semana', hint: 'Cambia los demás platillos y la lista de compras.' },
              ]}
            />
          )}
          {additions.length > 0 && (
            <Question
              title={`Agregaste ${additions.map((a) => ing(a.ingredient_id).name.toLowerCase()).join(', ')}`}
              text={`¿Lo quieres siempre en ${recipe.name}?`}
              value={recipeScope}
              onChange={(v) => setRecipeScope(v as 'once' | 'always')}
              options={[
                { value: 'once', label: 'Solo esta vez', hint: 'La receta no cambia.' },
                { value: 'always', label: 'Siempre en esta receta', hint: 'Se guarda en tu versión; el menú y la lista lo consideran.' },
              ]}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Sheet>
  )

  function resetRow(key: string) {
    setRows((rs) =>
      rs.map((x) => {
        if (x.key !== key || !x.replaces) return x
        const original = planned.find((u) => u.ingredient_id === x.replaces)
        return { ...x, ingredient_id: x.replaces, replaces: null, qty: fmt(original?.quantity ?? 0), unit: { kind: 'unit', unit: (original?.unit ?? 'g') as Unit } }
      }),
    )
  }
}

function fmt(n: number) {
  return String(Math.round(n * 100) / 100)
}

function Question({
  title,
  text,
  value,
  onChange,
  options,
}: {
  title: string
  text: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint: string }[]
}) {
  return (
    <section>
      <p className="font-medium">{title}</p>
      <p className="mb-2 text-sm text-muted-foreground">{text}</p>
      <div role="radiogroup" className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn('rounded-lg border p-3 text-left', value === o.value ? 'border-primary ring-1 ring-primary' : 'border-input')}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Lista para elegir un ingrediente: primero los intercambiables que tienes en la despensa. */
function IngredientChooser({
  catalog,
  inventory,
  group,
  exclude,
  onBack,
  onPick,
}: {
  catalog: Catalog
  inventory: InventoryItem[]
  group: string | null
  exclude: string[]
  onBack: () => void
  onPick: (i: Ingredient) => void
}) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(!group)
  const stock = new Map(inventory.filter((i) => Number(i.quantity) > 0).map((i) => [i.ingredient_id, i]))
  const list = catalog.ingredients
    .filter((i) => !exclude.includes(i.id))
    .filter((i) => all || i.swap_group === group)
    .filter((i) => !q || norm(i.name).includes(norm(q)))
    .sort((a, b) => Number(stock.has(b.id)) - Number(stock.has(a.id)) || a.name.localeCompare(b.name, 'es'))
    .slice(0, 50)

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 self-start text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        Volver
      </button>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar ingrediente" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {group && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setAll(false)} className={cn('h-9 rounded-full border px-3.5 text-sm', !all ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
            Parecidos
          </button>
          <button type="button" onClick={() => setAll(true)} className={cn('h-9 rounded-full border px-3.5 text-sm', all ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
            Todos
          </button>
        </div>
      )}
      <ul className="divide-y overflow-hidden rounded-lg border">
        {list.map((i) => {
          const s = stock.get(i.id)
          return (
            <li key={i.id}>
              <button type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/60 active:bg-muted">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.name}</span>
                {s && <span className="shrink-0 text-xs text-primary">Tienes {formatQty(Number(s.quantity), s.unit)}</span>}
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Sin resultados.</li>}
      </ul>
    </div>
  )
}

