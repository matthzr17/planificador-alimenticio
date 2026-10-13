import { useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { useCatalog, type Ingredient, type Measure } from '@/hooks/useCatalog'
import { useInventory, type InventoryItem } from '@/hooks/useInventory'
import { formatQty, norm, pieceEquivalent, toGrams, unitsFor, type Unit } from '@/lib/units'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { CATEGORIES, PickIngredientSheet } from '@/components/IngredientPicker'
import { MeasuresEditor } from '@/components/MeasuresEditor'
import { normalizeQty, QuantityInput, type QtyUnit } from '@/components/QuantityInput'


const DAY_MS = 86_400_000

function daysUntil(date: string | null): number | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / DAY_MS)
}

function expiryLabel(days: number | null) {
  if (days == null) return null
  if (days < 0) return { text: 'Caducado', urgent: true }
  if (days === 0) return { text: 'Caduca hoy', urgent: true }
  if (days === 1) return { text: 'Caduca mañana', urgent: true }
  if (days <= 3) return { text: `Caduca en ${days} días`, urgent: true }
  return null
}

type Editing = { ingredient: Ingredient; item: InventoryItem | null }

export default function Despensa() {
  const { catalog, error: catalogError, reload } = useCatalog()
  const { items, error, upsert, remove } = useInventory()
  const [query, setQuery] = useState('')
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)

  const rows = useMemo(() => {
    if (!catalog || !items) return []
    return items
      .map((item) => ({ item, ingredient: catalog.ingredientById.get(item.ingredient_id)! }))
      .filter((r) => r.ingredient && (!query || norm(r.ingredient.name).includes(norm(query))))
      .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, 'es'))
  }, [catalog, items, query])

  const expiring = rows.filter((r) => expiryLabel(daysUntil(r.item.expires_on)))
  const groups = CATEGORIES.map((c) => ({ category: c, rows: rows.filter((r) => (r.ingredient.category ?? 'Despensa') === c) }))
    .concat([{ category: 'Otros', rows: rows.filter((r) => !CATEGORIES.includes(r.ingredient.category ?? 'Despensa')) }])
    .filter((g) => g.rows.length)

  const loading = !catalog || !items
  const loadError = catalogError ?? error

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Despensa</h1>
          <p className="text-sm text-muted-foreground">
            {items?.length ? `${items.length} ingredientes en casa` : 'Lo que tienes en casa se usa primero en tu menú.'}
          </p>
        </div>
        <Button onClick={() => setPicking(true)} disabled={loading} className="shrink-0">
          <Plus />
          Agregar
        </Button>
      </header>

      {loadError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">No se pudo cargar la despensa: {loadError}</p>}

      {loading && !loadError ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold">Tu despensa está vacía</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Agrega lo que tienes en el refri y la alacena. El menú semanal va a usar esos ingredientes antes de pedirte comprar más.
          </p>
          <Button onClick={() => setPicking(true)} className="mt-2">
            <Plus />
            Agregar el primero
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar en tu despensa" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>

          {expiring.length > 0 && !query && (
            <section className="rounded-xl border border-carbs/40 bg-accent p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-accent-foreground">
                <AlertTriangle className="size-4" />
                Úsalos pronto
              </h2>
              <p className="mt-0.5 text-sm text-accent-foreground/80">El menú les da prioridad.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {expiring.map(({ item, ingredient }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setEditing({ ingredient, item })}
                      className="rounded-full bg-card px-3 py-1.5 text-sm font-medium"
                    >
                      {ingredient.name}: {expiryLabel(daysUntil(item.expires_on))!.text.toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
            {groups.map((g) => (
              <section key={g.category} className="min-w-0">
                <h2 className="mb-2 text-base font-semibold">{g.category}</h2>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {g.rows.map(({ item, ingredient }) => {
                    const exp = expiryLabel(daysUntil(item.expires_on))
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setEditing({ ingredient, item })}
                          className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{ingredient.name}</span>
                            {exp && <span className="block text-xs font-medium text-accent-foreground">{exp.text}</span>}
                          </span>
                          {Number(item.quantity) <= 0 ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Se terminó</span>
                          ) : (
                            <span className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                              <span className="block">
                                {item.is_approximate && '≈ '}
                                {formatQty(Number(item.quantity), item.unit)}
                              </span>
                              {item.unit !== 'pza' && (
                                <span className="block text-xs">
                                  {pieceEquivalent(toGrams(Number(item.quantity), item.unit, ingredient), catalog?.measuresByIngredient.get(ingredient.id))}
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
          {query && rows.length === 0 && <p className="text-center text-sm text-muted-foreground">Nada coincide con "{query}".</p>}
        </>
      )}

      {catalog && (
        <PickIngredientSheet
          open={picking}
          onOpenChange={setPicking}
          ingredients={catalog.ingredients}
          inPantry={new Set(items?.map((i) => i.ingredient_id))}
          onPick={(ingredient) => {
            setPicking(false)
            setEditing({ ingredient, item: items?.find((i) => i.ingredient_id === ingredient.id) ?? null })
          }}
          onCreated={async (ingredient) => {
            await reload()
            setPicking(false)
            setEditing({ ingredient, item: null })
          }}
        />
      )}

      {editing && (
        <EditItemSheet
          key={editing.ingredient.id}
          editing={editing}
          measures={catalog?.measuresByIngredient.get(editing.ingredient.id) ?? []}
          onMeasuresSaved={reload}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const err = await upsert({ ingredient_id: editing.ingredient.id, ...values })
            if (!err) setEditing(null)
            return err
          }}
          onDelete={
            editing.item
              ? async () => {
                  const err = await remove(editing.item!.id)
                  if (!err) setEditing(null)
                  return err
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function EditItemSheet({
  editing,
  measures,
  onMeasuresSaved,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing
  measures: Measure[]
  onMeasuresSaved: () => Promise<void>
  onClose: () => void
  onSave: (v: { quantity: number; unit: string; is_approximate: boolean; expires_on: string | null }) => Promise<string | null>
  onDelete?: () => Promise<string | null>
}) {
  const { ingredient, item } = editing
  const units = unitsFor(ingredient)
  const [quantity, setQuantity] = useState(item ? String(Number(item.quantity)) : '')
  const [unit, setUnit] = useState<QtyUnit>({ kind: 'unit', unit: (item?.unit as Unit) ?? units[0] })
  const [approx, setApprox] = useState(item?.is_approximate ?? false)
  const [expires, setExpires] = useState(item?.expires_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qty = Number(quantity.replace(',', '.'))
  const valid = quantity.trim() !== '' && !Number.isNaN(qty) && qty >= 0

  async function run(fn: () => Promise<string | null>) {
    setBusy(true)
    setError(await fn())
    setBusy(false)
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={ingredient.name}
      description={item ? 'Actualiza cuánto tienes.' : '¿Cuánto tienes?'}
      footer={
        <div className="flex items-center gap-3">
          {onDelete && (
            <Button variant="ghost" onClick={() => run(onDelete)} disabled={busy} className="text-destructive hover:text-destructive">
              <Trash2 />
              Quitar
            </Button>
          )}
          <Button
            className="ml-auto"
            disabled={!valid || busy}
            onClick={() => run(() => onSave({ ...normalizeQty(qty, unit, ingredient), is_approximate: approx, expires_on: expires || null }))}
          >
            {busy && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="qty">Cantidad</Label>
          <QuantityInput id="qty" autoFocus ingredient={ingredient} measures={measures} quantity={quantity} onQuantity={setQuantity} unit={unit} onUnit={setUnit} />
        </div>

        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Es aproximado</span>
            <span className="block text-xs text-muted-foreground">Por ejemplo, "como medio kilo".</span>
          </span>
          <input type="checkbox" checked={approx} onChange={(e) => setApprox(e.target.checked)} className="size-5 accent-primary" />
        </label>

        <div className="grid gap-2">
          <Label htmlFor="exp">Caduca (opcional)</Label>
          <Input id="exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>

        <MeasuresEditor ingredient={ingredient} measures={measures} onSaved={onMeasuresSaved} />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  )
}
