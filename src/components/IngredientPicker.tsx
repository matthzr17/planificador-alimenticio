import { useMemo, useState } from 'react'
import { ChevronLeft, Loader2, Plus, Search } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import type { Ingredient } from '@/hooks/useCatalog'
import { supabase } from '@/lib/supabase'
import { norm, UNIT_LABEL, type Unit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'

// Buscador de ingredientes del catálogo (con opción de crear uno propio). Lo usan Despensa y Compras.

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

export function PickIngredientSheet({
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

export function UnitChips({ units, value, onChange }: { units: Unit[]; value: Unit; onChange: (u: Unit) => void }) {
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
