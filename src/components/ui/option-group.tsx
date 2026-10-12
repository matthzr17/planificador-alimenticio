import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Option<T extends string> = { value: T; label: string; hint?: string }

// Grupo de opciones tipo "tarjeta" con semántica de radio (accesible con lector de pantalla).
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 1,
  renderExtra,
}: {
  label: string
  value: T | null
  options: Option<T>[]
  onChange: (value: T) => void
  columns?: 1 | 2 | 3
  renderExtra?: (option: Option<T>, selected: boolean) => ReactNode
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3')}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <div
            key={opt.value}
            className={cn(
              'rounded-lg border bg-card transition-colors',
              selected ? 'border-primary ring-1 ring-primary' : 'border-input',
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className="flex w-full items-start gap-3 p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{opt.label}</span>
                {opt.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>}
              </span>
            </button>
            {renderExtra?.(opt, selected)}
          </div>
        )
      })}
    </div>
  )
}
