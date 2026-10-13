import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useCatalog, type Ingredient } from '@/hooks/useCatalog'
import { useInventory, type InventoryItem } from '@/hooks/useInventory'
import { supabase } from '@/lib/supabase'
import { formatQty, norm, unitsFor, UNIT_LABEL, type Unit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'

export const CATEGORIES = [
  'Proteínas',
  'Lácteos y huevo',
  'Leguminosas',
  'Cereales y tubérculos',
  'Verduras',
  'Frutas',
  'Grasas y semillas',
  'Despensa',
]

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
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {item.is_approximate && '≈ '}
                            {formatQty(Number(item.quantity), item.unit)}
                          </span>
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

function PickIngredientSheet({
  open,
  onOpenChange,
  ingredients,
  inPantry,
  onPick,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  ingredients: Ingredient[]
  inPantry: Set<string>
  onPick: (i: Ingredient) => void
  onCreated: (i: Ingredient) => void
}) {
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const results = useMemo(() => {
    const nq = norm(q)
    const list = nq ? ingredients.filter((i) => norm(i.name).includes(nq)) : ingredients
    return list.slice(0, 60)
  }, [ingredients, q])

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setQ('')
          setCreating(false)
        }
      }}
      title={creating ? 'Nuevo ingrediente' : 'Agregar a la despensa'}
      description={creating ? 'Se guarda solo para ti.' : 'Busca el ingrediente que tienes en casa.'}
    >
      {creating ? (
        <NewIngredientForm initialName={q} onBack={() => setCreating(false)} onCreated={onCreated} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Ej. huevo, pollo, jitomate" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {results.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onPick(i)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/60 active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.name}</span>
                    <span className="block text-xs text-muted-foreground">{i.category}</span>
                  </span>
                  {inPantry.has(i.id) && <span className="text-xs text-primary">Ya la tienes</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No está en el catálogo.</li>}
          </ul>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            {q ? `Crear "${q}"` : 'Crear un ingrediente nuevo'}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function NewIngredientForm({ initialName, onBack, onCreated }: { initialName: string; onBack: () => void; onCreated: (i: Ingredient) => void }) {
  const { session } = useAuth()
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState('Despensa')
  const [unit, setUnit] = useState<Unit>('g')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!name.trim() || !session) return
    setBusy(true)
    const { data, error } = await supabase
      .from('ingredients')
      .insert({ name: name.trim(), category, default_unit: unit, owner_id: session.user.id })
      .select('*')
      .single()
    setBusy(false)
    if (error) setError(error.code === '23505' ? 'Ya existe un ingrediente con ese nombre.' : error.message)
    else onCreated(data)
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 self-start text-sm text-muted-foreground">
        <ChevronLeft className="size-4" />
        Volver a buscar
      </button>
      <div className="grid gap-2">
        <Label htmlFor="ing-name">Nombre</Label>
        <Input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ing-cat">Categoría</Label>
        <select
          id="ing-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label>Se mide en</Label>
        <UnitChips units={['g', 'ml', 'pza']} value={unit} onChange={setUnit} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={create} disabled={!name.trim() || busy}>
        {busy && <Loader2 className="animate-spin" />}
        Crear ingrediente
      </Button>
    </div>
  )
}

function EditItemSheet({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing
  onClose: () => void
  onSave: (v: { quantity: number; unit: string; is_approximate: boolean; expires_on: string | null }) => Promise<string | null>
  onDelete?: () => Promise<string | null>
}) {
  const { ingredient, item } = editing
  const units = unitsFor(ingredient)
  const [quantity, setQuantity] = useState(item ? String(Number(item.quantity)) : '')
  const [unit, setUnit] = useState<Unit>((item?.unit as Unit) ?? units[0])
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
            onClick={() => run(() => onSave({ quantity: qty, unit, is_approximate: approx, expires_on: expires || null }))}
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
          <Input id="qty" inputMode="decimal" autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          <UnitChips units={units} value={unit} onChange={setUnit} />
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

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  )
}

function UnitChips({ units, value, onChange }: { units: Unit[]; value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Unidad">
      {units.map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={u === value}
          onClick={() => onChange(u)}
          className={cn(
            'h-9 min-w-14 rounded-md border px-3 text-sm transition-colors',
            u === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
          )}
        >
          {UNIT_LABEL[u]}
        </button>
      ))}
    </div>
  )
}
