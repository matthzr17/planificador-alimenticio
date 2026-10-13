import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronLeft, ChevronRight, ExternalLink, Info, Loader2, PackageCheck, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCatalog, type Catalog, type Ingredient, type Measure } from '@/hooks/useCatalog'
import { useInventory, type InventoryItem } from '@/hooks/useInventory'
import { usePlan } from '@/hooks/usePlan'
import { usePrices, useShoppingList, type ProductPrice, type ShoppingItem } from '@/hooks/useShopping'
import { isoDate, mondayOf } from '@/lib/planner'
import {
  buildShoppingList,
  compareStores,
  formatMoney,
  planNeeds,
  rankOptions,
  STORE_LABEL,
  STORES,
  type ListLine,
  type OptionEval,
} from '@/lib/shopping'
import { formatNumber, formatQty, measureText, toGrams, unitsFor, UNIT_LABEL, type Unit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { CATEGORIES, PickIngredientSheet } from '@/components/IngredientPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export default function Compras() {
  const { catalog, error: catalogError } = useCatalog()
  const { items: inventory, upsert: upsertPantry } = useInventory()
  const { prices, add: addPrice, remove: removePrice } = usePrices()
  const [now] = useState(() => new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = useMemo(() => addDays(mondayOf(now), weekOffset * 7), [now, weekOffset])
  const { plan, items: planItems, loading: loadingPlan } = usePlan(isoDate(monday))
  const shopping = useShoppingList(plan?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [openItem, setOpenItem] = useState<ShoppingItem | null>(null)
  const [picking, setPicking] = useState(false)

  const ready = catalog && inventory && prices && !loadingPlan && !shopping.loading

  // Lo que debería comprarse según el menú y la despensa actuales
  const lines = useMemo(() => {
    if (!catalog || !inventory) return []
    const needs = planNeeds(
      planItems.map((i) => ({ ...i, servings: Number(i.servings) })),
      catalog.recipeById,
      catalog.ingredientById,
    )
    return buildShoppingList(needs, inventory, catalog.ingredientById)
  }, [catalog, inventory, planItems])

  async function refresh() {
    setBusy(true)
    const err = await shopping.sync(lines)
    setBusy(false)
    setNotice(err ? { kind: 'error', text: `No se pudo actualizar: ${err}` } : { kind: 'ok', text: 'Lista actualizada con tu menú y tu despensa.' })
  }

  // La lista se mantiene al día sola: si el menú o la despensa cambian, se recalcula.
  // Compara lo que debería haber contra lo guardado (sin tocar lo palomeado ni lo agregado a mano).
  const wantedKey = useMemo(() => {
    const keep = new Set(shopping.items.filter((i) => i.is_checked || i.is_manual).map((i) => i.ingredient_id))
    return lines
      .filter((l) => !keep.has(l.ingredient_id))
      .map((l) => `${l.ingredient_id}:${l.quantity}${l.unit}`)
      .sort()
      .join('|')
  }, [lines, shopping.items])
  const storedKey = useMemo(
    () =>
      shopping.items
        .filter((i) => !i.is_checked && !i.is_manual)
        .map((i) => `${i.ingredient_id}:${Number(i.quantity)}${i.unit}`)
        .sort()
        .join('|'),
    [shopping.items],
  )
  const syncing = useRef(false)
  useEffect(() => {
    if (!ready || !plan || planItems.length === 0 || syncing.current || wantedKey === storedKey) return
    syncing.current = true
    shopping.sync(lines).finally(() => {
      syncing.current = false
    })
  }, [ready, plan, planItems.length, wantedKey, storedKey, shopping, lines])

  const lineByIngredient = useMemo(() => new Map(lines.map((l) => [l.ingredient_id, l])), [lines])

  const comparison = useMemo(() => {
    if (!catalog || !prices) return null
    return compareStores(
      shopping.items.filter((i) => !i.is_checked).map((i) => ({ ingredient_id: i.ingredient_id, grams: gramsOf(i, catalog) })),
      prices,
      catalog.ingredientById,
    )
  }, [catalog, prices, shopping.items])

  const checked = shopping.items.filter((i) => i.is_checked)

  async function moveToPantry() {
    if (!catalog || !inventory) return
    setBusy(true)
    for (const it of checked) {
      const ing = catalog.ingredientById.get(it.ingredient_id)
      if (!ing) continue
      const current = inventory.find((p) => p.ingredient_id === it.ingredient_id)
      const err = await upsertPantry(mergeQuantity(current, it, ing))
      if (err) {
        setBusy(false)
        setNotice({ kind: 'error', text: `No se pudo pasar ${ing.name} a la despensa: ${err}` })
        return
      }
    }
    const err = await shopping.removeItems(checked.map((i) => i.id))
    setBusy(false)
    setNotice(err ? { kind: 'error', text: err } : { kind: 'ok', text: checked.length === 1 ? '1 artículo pasó a tu despensa.' : `${checked.length} artículos pasaron a tu despensa.` })
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-20 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Compras</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Semana anterior" disabled={weekOffset <= 0} onClick={() => setWeekOffset(0)}>
            <ChevronLeft />
          </Button>
          <p className="text-sm font-medium">{weekOffset === 0 ? 'Esta semana' : 'Próxima semana'}</p>
          <Button variant="ghost" size="icon" aria-label="Semana siguiente" disabled={weekOffset >= 1} onClick={() => setWeekOffset(1)}>
            <ChevronRight />
          </Button>
        </div>
      </header>

      {catalogError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{catalogError}</p>}

      {!ready ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !plan || planItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold">Primero arma el menú de la semana</p>
          <p className="max-w-sm text-sm text-muted-foreground">La lista se calcula con lo que pide tu menú menos lo que ya tienes en la despensa.</p>
          <Button asChild className="mt-2">
            <Link to="/menu">Ir al menú</Link>
          </Button>
        </div>
      ) : (
        <>
          {notice && (
            <p role="status" className={cn('flex gap-2 rounded-lg p-3 text-sm', notice.kind === 'ok' ? 'bg-secondary text-secondary-foreground' : 'bg-destructive/10 text-destructive')}>
              <Info className="mt-0.5 size-4 shrink-0" />
              {notice.text}
            </p>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
            {/* Lista */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm text-muted-foreground">
                  {shopping.items.length} artículos
                  {checked.length > 0 && `, ${checked.length} en el carrito`}
                </p>
                <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                  <Plus />
                  Agregar
                </Button>
                <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Actualizar
                </Button>
              </div>

              {shopping.items.length === 0 ? (
                <div className="rounded-xl border border-dashed px-6 py-10 text-center">
                  <p className="font-display text-lg font-semibold">No te falta nada</p>
                  <p className="mt-1 text-sm text-muted-foreground">Tu despensa cubre el menú de la semana.</p>
                </div>
              ) : (
                <ShoppingGroups
                  items={shopping.items}
                  catalog={catalog!}
                  prices={prices!}
                  lineByIngredient={lineByIngredient}
                  onToggle={(i) => shopping.update(i, { is_checked: !i.is_checked })}
                  onOpen={setOpenItem}
                />
              )}
            </div>

            {/* Comparador */}
            {comparison && <StoreSummary comparison={comparison} pending={shopping.items.filter((i) => !i.is_checked).length} />}
          </div>

          {checked.length > 0 && (
            <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-10 border-t bg-card/95 backdrop-blur-md md:bottom-0 md:left-60 md:pb-[env(safe-area-inset-bottom)] lg:left-64">
              <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 md:px-10">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{checked.length}</span> {checked.length === 1 ? 'comprado' : 'comprados'}
                </p>
                <Button onClick={moveToPantry} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />}
                  Pasar a la despensa
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {openItem && catalog && prices && (
        <ItemSheet
          key={openItem.id}
          item={shopping.items.find((i) => i.id === openItem.id) ?? openItem}
          line={lineByIngredient.get(openItem.ingredient_id)}
          catalog={catalog}
          prices={prices}
          onClose={() => setOpenItem(null)}
          onUpdate={(changes) => shopping.update(openItem, changes)}
          onRemove={async () => {
            const err = await shopping.removeItems([openItem.id])
            if (!err) setOpenItem(null)
            return err
          }}
          onAddPrice={addPrice}
          onRemovePrice={removePrice}
        />
      )}

      {catalog && (
        <PickIngredientSheet
          open={picking}
          onOpenChange={setPicking}
          ingredients={catalog.ingredients}
          inPantry={new Set(shopping.items.map((i) => i.ingredient_id))}
          onPick={async (ing) => {
            setPicking(false)
            const unit = (ing.default_unit === 'pza' ? 'pza' : ing.default_unit === 'ml' ? 'ml' : 'g') as Unit
            const err = await shopping.addManual({ ingredient_id: ing.id, quantity: unit === 'pza' ? 1 : 500, unit })
            if (err) setNotice({ kind: 'error', text: err })
          }}
          onCreated={async (ing) => {
            setPicking(false)
            await shopping.addManual({ ingredient_id: ing.id, quantity: 1, unit: ing.default_unit === 'pza' ? 'pza' : 'g' })
          }}
        />
      )}
    </div>
  )
}

// ---------- helpers ----------

function gramsOf(item: ShoppingItem, catalog: Catalog) {
  const ing = catalog.ingredientById.get(item.ingredient_id)
  return ing ? toGrams(Number(item.quantity), item.unit, ing) : 0
}

/** Suma lo comprado a lo que ya había, en la unidad del registro existente. */
function mergeQuantity(current: InventoryItem | undefined, item: ShoppingItem, ing: Ingredient) {
  if (!current) return { ingredient_id: item.ingredient_id, quantity: Number(item.quantity), unit: item.unit, is_approximate: false, expires_on: null }
  const boughtGrams = toGrams(Number(item.quantity), item.unit, ing)
  const perUnit = toGrams(1, current.unit, ing)
  return {
    ingredient_id: item.ingredient_id,
    quantity: Math.round((Number(current.quantity) + boughtGrams / perUnit) * 100) / 100,
    unit: current.unit,
    is_approximate: current.is_approximate,
    expires_on: current.expires_on,
  }
}

/** "2 jitomates" en lugar de "2 pza" cuando el ingrediente tiene nombre de pieza. */
function qtyLabel(quantity: number, unit: string, measures: Measure[] | undefined) {
  const piece = measures?.find((m) => m.is_piece)
  return unit === 'pza' && piece ? measureText(quantity, piece) : formatQty(quantity, unit)
}

/** "Necesitas 720 g, tienes 530 g, faltan 190 g (2 jitomates)". En piezas si el ingrediente se cuenta por pieza. */
export function breakdown(line: ListLine, ing: Ingredient, measures: Measure[] | undefined) {
  const piece = measures?.find((m) => m.is_piece)
  const missing = Math.max(0, line.needGrams - line.haveGrams)
  if (ing.default_unit === 'pza' && piece) {
    const p = (g: number) => Math.round((g / Number(piece.grams)) * 2) / 2
    if (p(line.haveGrams) === 0) return `Necesitas ${measureText(p(line.needGrams), piece)}, no tienes`
    return `Necesitas ${measureText(p(line.needGrams), piece)}, tienes ${formatNumber(p(line.haveGrams))}, faltan ${formatNumber(p(missing))}`
  }
  const u = ing.default_unit === 'ml' || ing.default_unit === 'l' ? 'ml' : 'g'
  const extra = line.unit === 'pza' && piece ? ` (${measureText(line.quantity, piece)})` : ''
  if (line.haveGrams < 1) return `Necesitas ${formatQty(line.needGrams, u)}, no tienes${extra}`
  return `Necesitas ${formatQty(line.needGrams, u)}, tienes ${formatQty(line.haveGrams, u)}, faltan ${formatQty(missing, u)}${extra}`
}

function bestFor(item: ShoppingItem, catalog: Catalog, prices: ProductPrice[]): OptionEval | null {
  const ing = catalog.ingredientById.get(item.ingredient_id)
  const opts = prices.filter((p) => p.ingredient_id === item.ingredient_id)
  if (!ing || !opts.length) return null
  return rankOptions(opts, gramsOf(item, catalog), ing)[0]
}

// ---------- lista agrupada ----------

function ShoppingGroups({
  items,
  catalog,
  prices,
  lineByIngredient,
  onToggle,
  onOpen,
}: {
  items: ShoppingItem[]
  catalog: Catalog
  prices: ProductPrice[]
  lineByIngredient: Map<string, ListLine>
  onToggle: (i: ShoppingItem) => void
  onOpen: (i: ShoppingItem) => void
}) {
  const rows = items
    .map((item) => ({ item, ing: catalog.ingredientById.get(item.ingredient_id)! }))
    .filter((r) => r.ing)
    .sort((a, b) => Number(a.item.is_checked) - Number(b.item.is_checked) || a.ing.name.localeCompare(b.ing.name, 'es'))
  const groups = [...CATEGORIES, 'Otros']
    .map((c) => ({ c, rows: rows.filter((r) => (CATEGORIES.includes(r.ing.category ?? '') ? r.ing.category : 'Otros') === c) }))
    .filter((g) => g.rows.length)

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.c} className="min-w-0">
          <h2 className="mb-2 text-base font-semibold">{g.c}</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {g.rows.map(({ item, ing }) => {
              const best = bestFor(item, catalog, prices)
              const measures = catalog.measuresByIngredient.get(ing.id)
              const line = lineByIngredient.get(ing.id)
              return (
                <li key={item.id} className="flex min-w-0 items-center">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.is_checked}
                    aria-label={`${ing.name}: ${item.is_checked ? 'en el carrito' : 'pendiente'}`}
                    onClick={() => onToggle(item)}
                    className="flex size-14 shrink-0 items-center justify-center"
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-md border-2 transition-colors',
                        item.is_checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {item.is_checked && <Check className="size-4" strokeWidth={3} />}
                    </span>
                  </button>
                  <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left">
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-medium', item.is_checked && 'text-muted-foreground line-through')}>{ing.name}</span>
                      {line && !item.is_checked && <span className="block text-xs text-muted-foreground">{breakdown(line, ing, measures)}</span>}
                      <span className="block truncate text-xs text-muted-foreground">
                        {best ? `${STORE_LABEL[best.store]}: ${formatMoney(best.total)}` : 'Sin precio, toca para comparar'}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{qtyLabel(Number(item.quantity), item.unit, measures)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ---------- resumen por tienda ----------

function StoreSummary({ comparison, pending }: { comparison: ReturnType<typeof compareStores>; pending: number }) {
  const { byStore, best, itemsWithPrices } = comparison
  return (
    <aside className="min-w-0 rounded-xl border bg-card p-5 xl:sticky xl:top-10" aria-labelledby="comparador-titulo">
      <h2 id="comparador-titulo" className="text-lg font-semibold">
        ¿Dónde conviene comprar?
      </h2>
      {itemsWithPrices === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Toca un artículo de la lista y captura su precio en una o varias tiendas. Aquí verás el total estimado por tienda y la combinación más barata.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Con precios de {itemsWithPrices} de {pending} artículos pendientes.
          </p>
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <p className="text-xs text-secondary-foreground/80">Comprando cada artículo donde sale más barato</p>
            <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-secondary-foreground">{formatMoney(best.total)}</p>
          </div>
          <ul className="mt-4 divide-y">
            {byStore.map((s, i) => (
              <li key={s.store} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{STORE_LABEL[s.store] ?? s.store}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.covered === itemsWithPrices ? 'Tiene todos' : `${s.covered} de ${itemsWithPrices} artículos`}
                  </span>
                </span>
                <span className={cn('shrink-0 tabular-nums', i === 0 && s.covered === itemsWithPrices && 'font-semibold text-primary')}>{formatMoney(s.total)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Totales con los precios que has capturado; pueden variar en tienda.</p>
        </>
      )}
    </aside>
  )
}

// ---------- detalle del artículo: cantidad, comparador y precios ----------

function ItemSheet({
  item,
  line,
  catalog,
  prices,
  onClose,
  onUpdate,
  onRemove,
  onAddPrice,
  onRemovePrice,
}: {
  item: ShoppingItem
  line?: ListLine
  catalog: Catalog
  prices: ProductPrice[]
  onClose: () => void
  onUpdate: (c: Partial<Pick<ShoppingItem, 'quantity' | 'unit'>>) => Promise<string | null>
  onRemove: () => Promise<string | null>
  onAddPrice: (row: Omit<ProductPrice, 'id' | 'user_id' | 'created_at' | 'observed_on'>) => Promise<string | null>
  onRemovePrice: (id: string) => Promise<string | null>
}) {
  const ing = catalog.ingredientById.get(item.ingredient_id)!
  const [qty, setQty] = useState(String(Number(item.quantity)))
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ranked = rankOptions(prices.filter((p) => p.ingredient_id === ing.id), gramsOf(item, catalog), ing)
  const hasProtein = (ing.protein_100g ?? 0) >= 3
  const bestProtein = hasProtein ? [...ranked].sort((a, b) => (a.per10gProtein ?? 1e9) - (b.per10gProtein ?? 1e9))[0] : null

  async function saveQty() {
    const n = Number(qty.replace(',', '.'))
    if (!Number.isNaN(n) && n > 0 && n !== Number(item.quantity)) setError(await onUpdate({ quantity: n }))
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={ing.name}
      description={item.is_manual ? 'Agregado a mano' : 'Según tu menú y tu despensa'}
      footer={
        <div className="flex items-center">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => setError(await onRemove())}>
            <Trash2 />
            Quitar de la lista
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          {line && <p className="rounded-lg bg-muted p-3 text-sm">{breakdown(line, ing, catalog.measuresByIngredient.get(ing.id))}</p>}
          <Label htmlFor="buy-qty">
            Cantidad a comprar (
            {item.unit === 'pza' ? (catalog.measuresByIngredient.get(ing.id)?.find((m) => m.is_piece)?.plural ?? 'pza') : (UNIT_LABEL[item.unit as Unit] ?? item.unit)})
          </Label>
          <Input id="buy-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={saveQty} />
        </div>

        <section>
          <h3 className="mb-2 text-base font-semibold">Opciones de compra</h3>
          {ranked.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Aún no hay precios. Consulta una tienda con los botones de abajo y captura lo que encuentres.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ranked.map((o, i) => (
                <li key={o.id} className={cn('rounded-lg border p-3', i === 0 && 'border-primary ring-1 ring-primary')}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {STORE_LABEL[o.store]}
                        {i === 0 && <span className="ml-2 text-primary">Mejor precio</span>}
                        {bestProtein?.id === o.id && ranked.length > 1 && <span className="ml-2 text-protein">Proteína más barata</span>}
                      </p>
                      <p className="font-medium">
                        {o.product_name}
                        {o.brand && <span className="font-normal text-muted-foreground"> ({o.brand})</span>}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {formatQty(Number(o.package_qty), o.package_unit)} a {formatMoney(Number(o.price))}. {formatMoney(o.perKg)} por {ing.default_unit === 'ml' ? 'litro' : 'kilo'}
                        {o.per10gProtein != null && `, ${formatMoney(o.per10gProtein)} por 10 g de proteína`}.
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-semibold tabular-nums">{formatMoney(o.total)}</p>
                      <p className="text-[11px] text-muted-foreground">{o.packages === 1 ? '1 paquete' : `${o.packages} paquetes`}</p>
                    </div>
                  </div>
                  <button type="button" onClick={async () => setError(await onRemovePrice(o.id))} className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Borrar este precio
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {adding ? (
          <PriceForm ing={ing} onCancel={() => setAdding(false)} onSave={async (row) => {
            const err = await onAddPrice(row)
            if (!err) setAdding(false)
            return err
          }} />
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Capturar un precio
          </Button>
        )}

        <section>
          <h3 className="mb-2 text-base font-semibold">Consultar en tienda</h3>
          <div className="flex flex-wrap gap-2">
            {STORES.filter((s) => s.search).slice(0, 4).map((s) => (
              <a
                key={s.value}
                href={s.search!(ing.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm hover:bg-muted"
              >
                {s.label}
                <ExternalLink className="size-3.5" />
              </a>
            ))}
          </div>
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  )
}

function PriceForm({
  ing,
  onCancel,
  onSave,
}: {
  ing: Ingredient
  onCancel: () => void
  onSave: (row: Omit<ProductPrice, 'id' | 'user_id' | 'created_at' | 'observed_on'>) => Promise<string | null>
}) {
  const units = unitsFor(ing)
  const [store, setStore] = useState<string>('walmart')
  const [name, setName] = useState(ing.name)
  const [brand, setBrand] = useState('')
  const [pkg, setPkg] = useState('')
  const [unit, setUnit] = useState<Unit>(units[0])
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pkgN = Number(pkg.replace(',', '.'))
  const priceN = Number(price.replace(',', '.').replace('$', ''))
  const valid = name.trim() && pkgN > 0 && priceN >= 0 && price.trim() !== ''

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="font-medium">Nuevo precio</p>
      <div className="grid gap-2">
        <Label>Tienda</Label>
        <div className="flex flex-wrap gap-1.5">
          {STORES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStore(s.value)}
              aria-pressed={store === s.value}
              className={cn('h-9 rounded-full border px-3 text-sm', store === s.value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="p-name">Producto</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Huevo blanco 18 piezas" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="p-brand">Marca (opcional)</Label>
        <Input id="p-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. San Juan, Great Value" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="p-pkg">Presentación</Label>
          <Input id="p-pkg" inputMode="decimal" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="Ej. 18" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="p-price">Precio</Label>
          <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
        </div>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Unidad de la presentación">
        {units.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={u === unit}
            onClick={() => setUnit(u)}
            className={cn('h-9 min-w-14 rounded-md border px-3 text-sm', u === unit ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')}
          >
            {UNIT_LABEL[u]}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true)
            setError(
              await onSave({
                ingredient_id: ing.id,
                store,
                product_name: name.trim(),
                brand: brand.trim() || null,
                package_qty: pkgN,
                package_unit: unit,
                price: priceN,
              }),
            )
            setBusy(false)
          }}
        >
          {busy && <Loader2 className="animate-spin" />}
          Guardar precio
        </Button>
      </div>
    </div>
  )
}
