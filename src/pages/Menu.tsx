import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronLeft, ChevronRight, Clock, Info, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useCatalog, type Catalog, type Recipe } from '@/hooks/useCatalog'
import { useInventory, type InventoryItem } from '@/hooks/useInventory'
import { usePlan, type MealPlanItem } from '@/hooks/usePlan'
import { useProfile, type Profile } from '@/hooks/useProfile'
import { useFavorites } from '@/hooks/useFavorites'
import { usePrices } from '@/hooks/useShopping'
import { buildShoppingList, compareStores, formatMoney, planNeeds, pricePerGramMap } from '@/lib/shopping'
import { toGrams } from '@/lib/units'
import { alternativeFor, batchFactor, generateWeek, isoDate, MEAL_LABEL, weekStartOf, WEEK_ORDER, type MealType, type PlannerInput } from '@/lib/planner'
import { dietAllows } from '@/lib/planner'
import type { DietType } from '@/lib/nutrition'
import { norm } from '@/lib/units'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { fmtServings, pantryCoverage, RecipeSheet } from '@/components/RecipeSheet'
import { itemMacros, itemUses, pantryAfterUsing, scaleUses, sumMacros } from '@/lib/cooking'
import { CookSheet } from '@/components/CookSheet'
import { describeServing } from '@/lib/servings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Semilla nueva para que cada "Rehacer" o "Cambiar" proponga algo distinto. */
const newSeed = () => Math.floor(Math.random() * 1e9)

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function weekLabel(weekStart: Date) {
  const sunday = addDays(weekStart, 6)
  const m = (d: Date) => d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
  return weekStart.getMonth() === sunday.getMonth()
    ? `${weekStart.getDate()} al ${sunday.getDate()} de ${m(sunday)}`
    : `${weekStart.getDate()} de ${m(weekStart)} al ${sunday.getDate()} de ${m(sunday)}`
}

function plannerInput(profile: Profile, catalog: Catalog, inventory: InventoryItem[], weekStart: Date, seed: number, isFavorite?: (r: Recipe) => boolean, pricePerGram?: Map<string, number>): PlannerInput {
  return {
    recipes: catalog.recipes.map((r) => ({ ...r, kcal_serving: r.kcal_serving, ingredients: r.ingredients.map((i) => ({ ...i, quantity: Number(i.quantity) })) })),
    ingredientById: catalog.ingredientById,
    pantry: inventory.map((i) => ({ ...i, quantity: Number(i.quantity) })),
    diet: (profile.diet_type ?? 'traditional') as DietType,
    targetKcal: profile.target_kcal!,
    busyDays: profile.busy_days ?? [],
    busyMaxMin: profile.busy_day_max_min ?? 15,
    freeMaxMin: profile.free_day_max_min ?? 60,
    weekStart,
    seed,
    favorites: new Set(catalog.recipes.filter((r) => isFavorite?.(r)).map((r) => r.id)),
    batchCooking: profile.batch_cooking,
    weeklyBudget: profile.weekly_budget == null ? null : Number(profile.weekly_budget),
    pricePerGram,
  }
}

export default function Menu() {
  const [tab, setTab] = useState<'semana' | 'recetario'>('semana')
  const { profile, loading: loadingProfile } = useProfile()
  const { catalog, error: catalogError, reload: reloadCatalog } = useCatalog()
  const [planRefresh, setPlanRefresh] = useState(0)
  const { isFavorite, toggle: toggleFavorite } = useFavorites()
  const { items: inventory, upsert: upsertPantry } = useInventory()
  const [open, setOpen] = useState<{ recipe: Recipe; servings: number } | null>(null)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Menú</h1>
        <div className="flex rounded-lg bg-muted p-1" role="tablist">
          {(['semana', 'recetario'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'h-9 rounded-md px-4 text-sm font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t === 'semana' ? 'Semana' : 'Recetario'}
            </button>
          ))}
        </div>
      </header>

      {catalogError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">No se pudo cargar el recetario: {catalogError}</p>}

      {!catalog || !inventory || loadingProfile ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === 'semana' ? (
        <Semana profile={profile} catalog={catalog} inventory={inventory} upsertPantry={upsertPantry} reloadCatalog={reloadCatalog} planRefresh={planRefresh} onOpen={(recipe, servings) => setOpen({ recipe, servings })} />
      ) : (
        <Recetario profile={profile} catalog={catalog} inventory={inventory} onOpen={(recipe) => setOpen({ recipe, servings: 1 })} />
      )}

      {open && catalog && inventory && (
        <RecipeSheet
          recipe={open.recipe}
          servings={open.servings}
          catalog={catalog}
          inventory={inventory}
          onClose={() => setOpen(null)}
          isFavorite={isFavorite(open.recipe)}
          onToggleFavorite={() => toggleFavorite(open.recipe)}
          onRestoreOriginal={async () => {
            // Los platillos que usaban tu versión regresan a la original; luego se borra tu versión
            const base = open.recipe.base_recipe_id!
            const { error: e1 } = await supabase.from('meal_plan_items').update({ recipe_id: base }).eq('recipe_id', open.recipe.id)
            if (e1) return e1.message
            const { error: e2 } = await supabase.from('recipes').delete().eq('id', open.recipe.id)
            if (e2) return e2.message
            await reloadCatalog()
            setPlanRefresh((n) => n + 1)
            return null
          }}
        />
      )}
    </div>
  )
}

// ---------------- Semana ----------------

function Semana({
  profile,
  catalog,
  inventory,
  onOpen,
  upsertPantry,
  reloadCatalog,
  planRefresh,
}: {
  profile: Profile | null
  catalog: Catalog
  inventory: InventoryItem[]
  onOpen: (r: Recipe, servings: number) => void
  upsertPantry: ReturnType<typeof useInventory>['upsert']
  reloadCatalog: () => Promise<void>
  planRefresh: number
}) {
  const [now] = useState(() => new Date())
  const thisWeekStart = useMemo(() => weekStartOf(now), [now])
  const todayDow = now.getDay()
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = useMemo(() => addDays(thisWeekStart, weekOffset * 7), [thisWeekStart, weekOffset])
  const { items, loading, error, replace, updateItem, reload: reloadPlan } = usePlan(isoDate(weekStart))
  // Cuando cambian recetas desde fuera de la semana (p. ej. volver a la original), se relee el plan
  useEffect(() => {
    if (planRefresh) reloadPlan()
  }, [planRefresh, reloadPlan])
  const [day, setDay] = useState<number>(todayDow)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [swapping, setSwapping] = useState<string | null>(null)
  const [cooking, setCooking] = useState<MealPlanItem | null>(null)
  const { isFavorite } = useFavorites()
  const { prices } = usePrices()
  const pricePerGram = useMemo(() => (prices ? pricePerGramMap(prices, catalog.ingredientById) : undefined), [prices, catalog])

  // Costo estimado de las compras de la semana (lo que falta según el menú y la despensa)
  const estimate = useMemo(() => {
    if (!prices || !items.length) return null
    const lines = buildShoppingList(planNeeds(items.map((i) => ({ ...i, servings: Number(i.servings) })), catalog.recipeById, catalog.ingredientById), inventory, catalog.ingredientById)
    const cmp = compareStores(
      lines.map((l) => ({ ingredient_id: l.ingredient_id, grams: toGrams(l.quantity, l.unit, catalog.ingredientById.get(l.ingredient_id)!) })),
      prices,
      catalog.ingredientById,
    )
    return { total: cmp.best.total, priced: cmp.itemsWithPrices, count: lines.length }
  }, [prices, items, inventory, catalog])

  if (!profile?.target_kcal) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="font-display text-lg font-semibold">Primero completa tu perfil</p>
        <p className="max-w-sm text-sm text-muted-foreground">El menú se arma con tus calorías, tu dieta y el tiempo que tienes para cocinar.</p>
        <Button asChild className="mt-2">
          <Link to="/perfil">Completar perfil</Link>
        </Button>
      </div>
    )
  }

  const input = (seed: number) => plannerInput(profile, catalog, inventory, weekStart, seed, isFavorite, pricePerGram)

  async function generate() {
    setBusy(true)
    setNotice(null)
    const { items: newItems, warnings } = generateWeek(input(newSeed()))
    const err = await replace(newItems, profile!.target_kcal!)
    setBusy(false)
    if (err) setNotice({ kind: 'error', text: `No se pudo guardar el menú: ${err}` })
    else if (warnings.length) setNotice({ kind: 'warn', text: warnings.join(' ') })
    else setNotice({ kind: 'ok', text: inventory.length ? 'Menú listo. Se priorizó lo que tienes en la despensa.' : 'Menú listo. Agrega tu despensa para que aproveche lo que ya tienes.' })
  }

  /** Marcar abre "¿Cómo lo preparaste?"; desmarcar regresa a la despensa lo que se había descontado. */
  async function toggleDone(item: MealPlanItem) {
    const recipe = catalog.recipeById.get(item.recipe_id)
    if (!recipe) return
    // Las sobras ya se descontaron al cocinar la tanda: solo se marcan
    if (item.leftover_of_day != null) {
      const err = await updateItem(item, { is_done: !item.is_done })
      if (err) setNotice({ kind: 'error', text: err })
      return
    }
    if (!item.is_done) {
      setCooking(item)
      return
    }
    const err = await updateItem(item, { is_done: false })
    if (err) return setNotice({ kind: 'error', text: `No se pudo desmarcar: ${err}` })
    const uses = scaleUses(itemUses({ ...item, servings: Number(item.servings) }, recipe), Math.max(1, batchFactor(item, items)))
    const records = pantryAfterUsing(uses, inventory, catalog.ingredientById, 1)
    for (const r of records) {
      const e = await upsertPantry({ ingredient_id: r.ingredient_id, quantity: r.quantity, unit: r.unit, is_approximate: r.is_approximate, expires_on: r.expires_on })
      if (e) return setNotice({ kind: 'error', text: `Se desmarcó, pero no se pudo actualizar la despensa: ${e}` })
    }
    setNotice({ kind: 'ok', text: 'Se regresaron los ingredientes a tu despensa.' })
  }

  async function swap(item: MealPlanItem) {
    setSwapping(item.id)
    const plan = items.map((i) => ({ day_of_week: i.day_of_week, meal_type: i.meal_type as MealType, recipe_id: i.recipe_id, servings: Number(i.servings) }))
    const target = plan[items.indexOf(item)]
    const alt = alternativeFor(input(newSeed()), plan, target)
    if (alt) {
      // Una sobra que se cambia deja de ser sobra; si se cambia la tanda, sus sobras siguen a la nueva receta
      const leftoversOfThis = items.filter((o) => o.leftover_of_day === item.day_of_week && o.meal_type === item.meal_type && o.recipe_id === item.recipe_id)
      let err = await updateItem(item, { recipe_id: alt.recipe_id, servings: alt.servings, leftover_of_day: null, ingredients_override: null })
      for (const l of leftoversOfThis) if (!err) err = await updateItem(l, { recipe_id: alt.recipe_id, servings: alt.servings, ingredients_override: null })
      if (err) setNotice({ kind: 'error', text: `No se pudo cambiar: ${err}` })
    } else setNotice({ kind: 'warn', text: 'No hay otra receta que cumpla tus reglas para esa comida.' })
    setSwapping(null)
  }

  const dayItems = items
    .filter((i) => i.day_of_week === day)
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type as MealType) - MEAL_ORDER.indexOf(b.meal_type as MealType))
  const totals = sumMacros(
    dayItems.flatMap((i) => {
      const r = catalog.recipeById.get(i.recipe_id)
      return r ? [itemMacros({ ...i, servings: Number(i.servings) }, r, catalog.ingredientById)] : []
    }),
  )
  const target = profile.target_kcal
  const pct = Math.min(100, (totals.kcal / target) * 100)
  const isBusy = profile.busy_days?.includes(day)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Semana + generar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Semana anterior" disabled={weekOffset <= 0} onClick={() => setWeekOffset((w) => w - 1)}>
            <ChevronLeft />
          </Button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-medium">{weekOffset === 0 ? 'Esta semana' : 'Próxima semana'}</p>
            <p className="text-xs text-muted-foreground">{weekLabel(weekStart)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Semana siguiente" disabled={weekOffset >= 1} onClick={() => setWeekOffset((w) => w + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button onClick={generate} disabled={busy || loading} variant={items.length ? 'outline' : 'default'} className="ml-auto">
          {busy ? <Loader2 className="animate-spin" /> : items.length ? <RefreshCw /> : <Sparkles />}
          {items.length ? 'Rehacer menú' : 'Generar menú'}
        </Button>
      </div>

      {notice && (
        <p
          role="status"
          className={cn(
            'flex gap-2 rounded-lg p-3 text-sm',
            notice.kind === 'ok' && 'bg-secondary text-secondary-foreground',
            notice.kind === 'warn' && 'bg-accent text-accent-foreground',
            notice.kind === 'error' && 'bg-destructive/10 text-destructive',
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          {notice.text}
        </p>
      )}
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {estimate && estimate.count > 0 && (profile.weekly_budget != null || estimate.priced > 0) && (
        <BudgetBar estimate={estimate} budget={profile.weekly_budget == null ? null : Number(profile.weekly_budget)} />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold">Aún no hay menú para esta semana</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Se arma con tus {target.toLocaleString('es-MX')} kcal al día, recetas rápidas en tus días ocupados y lo que tengas en la despensa.
          </p>
        </div>
      ) : (
        <>
          {/* Días */}
          <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Día de la semana">
            {WEEK_ORDER.map((d, idx) => {
              const date = addDays(weekStart, idx)
              const isToday = weekOffset === 0 && d === todayDow
              const selected = d === day
              return (
                <button
                  key={d}
                  role="tab"
                  aria-selected={selected}
                  aria-label={`${DAY_LONG[d]} ${date.getDate()}`}
                  onClick={() => setDay(d)}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
                    selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
                    !selected && isToday && 'border-primary text-primary',
                  )}
                >
                  <span className="font-medium">{DAY_SHORT[d]}</span>
                  <span className={cn('font-display text-base font-semibold tabular-nums', !selected && 'text-foreground')}>{date.getDate()}</span>
                </button>
              )
            })}
          </div>

          {/* Resumen del día */}
          <section className="rounded-xl border bg-card p-4" aria-label="Resumen del día">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {DAY_LONG[day]}
                <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">{isBusy ? 'día ocupado' : 'día libre'}</span>
              </h2>
              <p className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{Math.round(totals.kcal).toLocaleString('es-MX')}</span>
                <span className="text-muted-foreground"> / {target.toLocaleString('es-MX')} kcal</span>
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {[
                ['Proteína', totals.protein, 'bg-protein'],
                ['Carbos', totals.carbs, 'bg-carbs'],
                ['Grasa', totals.fat, 'bg-fat'],
              ].map(([label, v, c]) => (
                <div key={label as string} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className={cn('size-2 rounded-full', c as string)} aria-hidden />
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{Math.round(v as number)} g</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Comidas */}
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dayItems.map((item) => {
              const recipe = catalog.recipeById.get(item.recipe_id)
              if (!recipe) return null
              const servings = Number(item.servings)
              const factor = batchFactor(item, items)
              const cov = pantryCoverage(recipe, servings * Math.max(1, factor), catalog, inventory)
              const isLeftover = item.leftover_of_day != null
              return (
                <li key={item.id} className={cn('min-w-0 rounded-xl border bg-card transition-opacity', item.is_done && 'opacity-60')}>
                  <button type="button" onClick={() => onOpen(recipe, servings * Math.max(1, factor))} className="block w-full min-w-0 p-4 pb-3 text-left">
                    <p className="text-xs font-medium text-muted-foreground">
                      {MEAL_LABEL[item.meal_type as MealType]}
                      {isLeftover && <span className="ml-2 text-primary">Sobras del {DAY_LONG[item.leftover_of_day!].toLowerCase()}</span>}
                      {factor > 1 && <span className="ml-2 text-primary">Cocina para {factor} comidas</span>}
                    </p>
                    <p className={cn('mt-0.5 font-display text-lg font-semibold leading-snug', item.is_done && 'line-through')}>{recipe.name}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {isLeftover ? 'Solo calentar' : `${recipe.prep_time_min} min`}
                      </span>
                      <span className="font-medium text-foreground">{describeServing(recipe.serving_parts, servings) ?? fmtServings(servings)}</span>
                      <span className="tabular-nums">{Math.round(itemMacros({ ...item, servings }, recipe, catalog.ingredientById).kcal)} kcal</span>
                    </p>
                  </button>
                  <div className="flex items-center gap-2 border-t px-2 py-1.5">
                    <span className={cn('px-2 text-xs', isLeftover || cov.have === cov.total ? 'text-primary' : 'text-muted-foreground')}>
                      {isLeftover ? 'Ya está cocinado' : cov.have === cov.total ? 'Tienes todo' : `Tienes ${cov.have} de ${cov.total}`}
                    </span>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => swap(item)} disabled={swapping === item.id}>
                      {swapping === item.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Cambiar
                    </Button>
                    <Button
                      variant={item.is_done ? 'secondary' : 'ghost'}
                      size="sm"
                      aria-pressed={item.is_done}
                      onClick={() => toggleDone(item)}
                    >
                      <Check />
                      {item.is_done ? 'Hecho' : 'Marcar'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {cooking && catalog.recipeById.get(cooking.recipe_id) && (
        <CookSheet
          item={items.find((i) => i.id === cooking.id) ?? cooking}
          recipe={catalog.recipeById.get(cooking.recipe_id)!}
          deps={{ catalog, inventory, weekItems: items, updateItem, upsertPantry, reloadCatalog }}
          onClose={() => setCooking(null)}
          onNotice={(text, kind = 'ok') => setNotice({ kind, text })}
        />
      )}
    </div>
  )
}

// ---------------- Recetario ----------------

function Recetario({
  profile,
  catalog,
  inventory,
  onOpen,
}: {
  profile: Profile | null
  catalog: Catalog
  inventory: InventoryItem[]
  onOpen: (r: Recipe) => void
}) {
  const [q, setQ] = useState('')
  const [meal, setMeal] = useState<MealType | 'all'>('all')
  const [onlyMyDiet, setOnlyMyDiet] = useState(true)
  const [quick, setQuick] = useState(false)
  const [onlyFav, setOnlyFav] = useState(false)
  const { isFavorite } = useFavorites()
  const diet = (profile?.diet_type ?? 'traditional') as DietType
  const quickMax = profile?.busy_day_max_min ?? 15

  const list = catalog.recipes
    .filter((r) => meal === 'all' || r.meal_type === meal)
    .filter((r) => !onlyMyDiet || dietAllows(r, diet))
    .filter((r) => !quick || r.prep_time_min <= quickMax)
    .filter((r) => !onlyFav || isFavorite(r))
    .filter((r) => !q || norm(r.name).includes(norm(q)))
    .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type as MealType) - MEAL_ORDER.indexOf(b.meal_type as MealType) || a.name.localeCompare(b.name, 'es'))

  const chip = (active: boolean) =>
    cn('h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar receta" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button className={chip(meal === 'all')} onClick={() => setMeal('all')}>
          Todas
        </button>
        {MEAL_ORDER.map((m) => (
          <button key={m} className={chip(meal === m)} onClick={() => setMeal(m)}>
            {MEAL_LABEL[m]}
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
        <button className={chip(onlyMyDiet)} aria-pressed={onlyMyDiet} onClick={() => setOnlyMyDiet((v) => !v)}>
          Mi dieta
        </button>
        <button className={chip(onlyFav)} aria-pressed={onlyFav} onClick={() => setOnlyFav((v) => !v)}>
          Favoritas
        </button>
        <button className={chip(quick)} aria-pressed={quick} onClick={() => setQuick((v) => !v)}>
          {quickMax} min o menos
        </button>
      </div>

      <p className="text-sm text-muted-foreground">{list.length} recetas</p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => {
          const cov = pantryCoverage(r, 1, catalog, inventory)
          return (
            <li key={r.id} className="min-w-0">
              <button type="button" onClick={() => onOpen(r)} className="flex h-full w-full min-w-0 flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">
                  {MEAL_LABEL[r.meal_type as MealType]}
                  {r.owner_id && <span className="ml-2 text-primary">Tu versión</span>}
                  {isFavorite(r) && <span className="ml-2 text-primary">Favorita</span>}
                </span>
                <span className="mt-0.5 font-display text-base font-semibold leading-snug">{r.name}</span>
                <span className="mt-auto flex flex-wrap gap-x-3 pt-2 text-sm text-muted-foreground">
                  <span>{r.prep_time_min} min</span>
                  <span className="tabular-nums">{Math.round(r.kcal_serving ?? 0)} kcal</span>
                  <span className="tabular-nums">{Math.round(r.protein_serving ?? 0)} g proteína</span>
                </span>
                {cov.have > 0 && (
                  <span className={cn('mt-1 text-xs', cov.have === cov.total ? 'text-primary' : 'text-muted-foreground')}>
                    {cov.have === cov.total ? 'Tienes todo' : `Tienes ${cov.have} de ${cov.total} ingredientes`}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ninguna receta coincide con los filtros.</p>}
    </div>
  )
}

/** Compras estimadas de la semana contra el presupuesto. */
function BudgetBar({ estimate, budget }: { estimate: { total: number; priced: number; count: number }; budget: number | null }) {
  const over = budget != null && estimate.total > budget
  const pct = budget ? Math.min(100, (estimate.total / budget) * 100) : 0
  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Costo estimado de la semana">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">Compras estimadas de la semana</p>
        <p className="text-sm tabular-nums">
          <span className={cn('font-semibold', over && 'text-destructive')}>{formatMoney(estimate.total)}</span>
          {budget != null && <span className="text-muted-foreground"> / {formatMoney(budget)}</span>}
        </p>
      </div>
      {budget != null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {estimate.priced === 0
          ? 'Captura precios en Compras para estimar el costo.'
          : `Con precio en ${estimate.priced} de ${estimate.count} artículos; el resto no se cuenta.`}
        {over && ' Toca "Rehacer menú" para buscar opciones más baratas.'}
      </p>
    </section>
  )
}
