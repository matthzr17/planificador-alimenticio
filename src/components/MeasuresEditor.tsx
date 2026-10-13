import { useState } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import type { Ingredient, Measure } from '@/hooks/useCatalog'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Medidas del ingrediente con su peso. Cambiar un peso guarda tu ajuste (la medida general no se toca),
 * y desde ese momento todas las conversiones de la app lo usan.
 */
export function MeasuresEditor({ ingredient, measures, onSaved }: { ingredient: Ingredient; measures: Measure[]; onSaved: () => Promise<void> }) {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [newGrams, setNewGrams] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isMl = ingredient.default_unit === 'ml' || ingredient.default_unit === 'l'
  const unitLabel = isMl ? 'ml' : 'g'
  const needsPiece = ingredient.default_unit === 'pza' && !measures.some((m) => m.is_piece)

  async function save(m: Pick<Measure, 'name' | 'plural' | 'is_piece'>, grams: number) {
    if (!session || !(grams > 0)) return
    setBusy(true)
    setError(null)
    // Si ya tienes un ajuste con ese nombre se actualiza; si no, se crea (la medida general no se modifica)
    const own = measures.find((x) => x.owner_id && x.name.toLowerCase() === m.name.toLowerCase())
    const { error } = own
      ? await supabase.from('ingredient_measures').update({ grams }).eq('id', own.id)
      : await supabase
          .from('ingredient_measures')
          .insert({ owner_id: session.user.id, ingredient_id: ingredient.id, name: m.name, plural: m.plural, grams, is_piece: m.is_piece })
    if (error) {
      setError(error.code === '23505' ? 'Ya existe una medida con ese nombre.' : error.message)
      setBusy(false)
      return
    }
    await onSaved()
    setBusy(false)
  }

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-3 text-left" aria-expanded={open}>
        <span>
          <span className="block text-sm font-medium">Medidas y equivalencias</span>
          <span className="block text-xs text-muted-foreground">
            {needsPiece ? 'Dile a la app cuánto pesa una pieza.' : 'Ajusta cuánto pesa cada medida si las tuyas son distintas.'}
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t p-3">
          {measures.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">
                1 {m.name}
                {m.owner_id && <span className="ml-1.5 text-xs text-primary">tu ajuste</span>}
              </span>
              <Input
                aria-label={`Peso de 1 ${m.name}`}
                inputMode="decimal"
                className="h-9 w-24 text-right"
                value={draft[m.id] ?? String(Number(m.grams))}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                onBlur={() => {
                  const g = Number((draft[m.id] ?? '').replace(',', '.'))
                  if (draft[m.id] != null && g > 0 && g !== Number(m.grams)) save(m, g)
                }}
              />
              <span className="w-6 text-sm text-muted-foreground">{unitLabel}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              aria-label="Nueva medida"
              placeholder={needsPiece ? 'pieza' : 'Ej. rebanada, taza'}
              className="h-9 min-w-0 flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input aria-label="Peso" inputMode="decimal" placeholder="Peso" className="h-9 w-24 text-right" value={newGrams} onChange={(e) => setNewGrams(e.target.value)} />
            <span className="w-6 text-sm text-muted-foreground">{unitLabel}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !(newName.trim() || needsPiece) || !(Number(newGrams.replace(',', '.')) > 0)}
            onClick={async () => {
              const name = (newName.trim() || 'pieza').toLowerCase()
              const plural = name.endsWith('s') ? name : /[aeiouáéíóú]$/.test(name) ? `${name}s` : `${name}es`
              await save({ name, plural, is_piece: needsPiece && (name === 'pieza' || !newName.trim()) }, Number(newGrams.replace(',', '.')))
              setNewName('')
              setNewGrams('')
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Agregar medida
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}
