import { useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { useProfile, type Profile } from '@/hooks/useProfile'
import { ACTIVITY_OPTIONS, DIET_OPTIONS, GOAL_OPTIONS, WEEK_DAYS } from '@/lib/catalogs'
import {
  ageFromBirthDate,
  calculate,
  type ActivityLevel,
  type DietType,
  type Goal,
  type NutritionResult,
  type Sex,
} from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { MacroSummary } from '@/components/MacroSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OptionGroup } from '@/components/ui/option-group'

type Form = {
  fullName: string
  sex: Sex | null
  birthDate: string
  heightCm: string
  weightKg: string
  bodyFatPct: string
  activity: ActivityLevel | null
  goal: Goal | null
  diet: DietType | null
  busyDays: number[]
  busyMax: number
  freeMax: number
  batchCooking: boolean
  weeklyBudget: string
  /** Ajuste de calorías aceptado por tu progreso de peso. */
  kcalAdjustment: number
}

const BUSY_MINUTES = [10, 15, 20, 30]
const FREE_MINUTES = [30, 45, 60, 90]

function fromProfile(p: Profile | null): Form {
  return {
    fullName: p?.full_name ?? '',
    sex: (p?.sex as Sex) ?? null,
    birthDate: p?.birth_date ?? '',
    heightCm: p?.height_cm?.toString() ?? '',
    weightKg: p?.weight_kg?.toString() ?? '',
    bodyFatPct: p?.body_fat_pct?.toString() ?? '',
    activity: (p?.activity_level as ActivityLevel) ?? null,
    goal: (p?.goal as Goal) ?? null,
    diet: (p?.diet_type as DietType) ?? null,
    busyDays: p?.busy_days ?? [1, 2, 3, 4, 5],
    busyMax: p?.busy_day_max_min ?? 15,
    freeMax: p?.free_day_max_min ?? 60,
    batchCooking: p?.batch_cooking ?? true,
    weeklyBudget: p?.weekly_budget != null ? String(Number(p.weekly_budget)) : '',
    kcalAdjustment: p?.kcal_adjustment ?? 0,
  }
}

/** "1,200" o "$1200" → 1200; vacío o inválido → null. */
const budgetValue = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return s.trim() && n > 0 ? Math.round(n * 100) / 100 : null
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

// Valida el formulario y, si está completo, calcula el resultado.
function evaluate(f: Form) {
  const height = num(f.heightCm)
  const weight = num(f.weightKg)
  const bf = num(f.bodyFatPct)
  const age = f.birthDate ? ageFromBirthDate(f.birthDate) : null

  const errors: Partial<Record<'heightCm' | 'weightKg' | 'bodyFatPct' | 'birthDate', string>> = {}
  if (height != null && (Number.isNaN(height) || height < 100 || height > 250)) errors.heightCm = 'Entre 100 y 250 cm.'
  if (weight != null && (Number.isNaN(weight) || weight < 30 || weight > 300)) errors.weightKg = 'Entre 30 y 300 kg.'
  if (bf != null && (Number.isNaN(bf) || bf < 3 || bf > 60)) errors.bodyFatPct = 'Entre 3 y 60 %.'
  if (age != null && (age < 18 || age > 100)) errors.birthDate = 'Los cálculos son válidos para adultos (18 años o más).'

  const missing: string[] = []
  if (!f.sex) missing.push('sexo')
  if (!f.birthDate) missing.push('fecha de nacimiento')
  if (height == null) missing.push('estatura')
  if (weight == null) missing.push('peso')
  if (!f.activity) missing.push('actividad')
  if (!f.goal) missing.push('objetivo')
  if (!f.diet) missing.push('tipo de dieta')

  let result: NutritionResult | null = null
  if (missing.length === 0 && Object.keys(errors).length === 0) {
    result = calculate({
      sex: f.sex!,
      ageYears: age!,
      heightCm: height!,
      weightKg: weight!,
      bodyFatPct: bf,
      activity: f.activity!,
      goal: f.goal!,
      diet: f.diet!,
      extraKcal: f.kcalAdjustment,
    })
  }
  return { errors, missing, result, height, weight, bf }
}

export default function Perfil() {
  const { profile, loading, save } = useProfile()

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  // El formulario se monta ya con el perfil guardado como estado inicial.
  return <PerfilForm initial={profile} save={save} />
}

function PerfilForm({ initial, save }: { initial: Profile | null; save: ReturnType<typeof useProfile>['save'] }) {
  const [form, setForm] = useState<Form>(() => fromProfile(initial))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  const { errors, missing, result, height, weight, bf } = useMemo(() => evaluate(form), [form])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setStatus(null)
  }

  const toggleDay = (d: number) =>
    set('busyDays', form.busyDays.includes(d) ? form.busyDays.filter((x) => x !== d) : [...form.busyDays, d])

  async function handleSave() {
    if (!result) return
    setSaving(true)
    const { error } = await save({
      full_name: form.fullName.trim() || null,
      sex: form.sex,
      birth_date: form.birthDate,
      height_cm: height,
      weight_kg: weight,
      body_fat_pct: bf,
      activity_level: form.activity,
      goal: form.goal,
      diet_type: form.diet,
      busy_days: [...form.busyDays].sort((a, b) => a - b),
      busy_day_max_min: form.busyMax,
      free_day_max_min: form.freeMax,
      batch_cooking: form.batchCooking,
      weekly_budget: budgetValue(form.weeklyBudget),
      kcal_adjustment: form.kcalAdjustment,
      target_kcal: result.targetKcal,
      target_protein_g: result.macros.proteinG,
      target_carbs_g: result.macros.carbsG,
      target_fat_g: result.macros.fatG,
    })
    setSaving(false)
    setStatus(error ? { kind: 'error', text: `No se pudo guardar: ${error}` } : { kind: 'ok', text: 'Perfil guardado' })
  }

  const statusLine = status ? (
    <span className={cn('flex items-center gap-1.5', status.kind === 'ok' ? 'text-primary' : 'text-destructive')}>
      {status.kind === 'ok' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
      {status.text}
    </span>
  ) : result ? (
    <span className="font-medium tabular-nums">{result.targetKcal.toLocaleString('es-MX')} kcal / día</span>
  ) : (
    <span className="text-muted-foreground">Completa tu perfil</span>
  )

  const saveButton = (
    <Button onClick={handleSave} disabled={!result || saving} className="shrink-0">
      {saving && <Loader2 className="animate-spin" />}
      Guardar
    </Button>
  )

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-24 xl:pb-0">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Perfil nutricional</h1>
        <p className="text-sm text-muted-foreground">Con estos datos se calculan tus calorías y macros diarios.</p>
      </header>

      {/* Una columna hasta pantallas anchas; en escritorio grande, formulario + resultado fijo a la derecha */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-5">
      <Section title="Tus datos">
        <Field label="Nombre" htmlFor="name">
          <Input id="name" autoComplete="given-name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>

        <Field label="Sexo">
          <OptionGroup
            label="Sexo"
            className="grid-cols-2"
            value={form.sex}
            onChange={(v) => set('sex', v)}
            options={[
              { value: 'male', label: 'Hombre' },
              { value: 'female', label: 'Mujer' },
            ]}
          />
        </Field>

        <Field label="Fecha de nacimiento" htmlFor="birth" error={errors.birthDate}>
          <Input id="birth" type="date" value={form.birthDate} max={today} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Estatura (cm)" htmlFor="height" error={errors.heightCm}>
            <Input id="height" inputMode="decimal" placeholder="175" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
          </Field>
          <Field label="Peso (kg)" htmlFor="weight" error={errors.weightKg}>
            <Input id="weight" inputMode="decimal" placeholder="80" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          </Field>
        </div>

        <Field
          label="% de grasa corporal (opcional)"
          htmlFor="bf"
          error={errors.bodyFatPct}
          hint="Si lo conoces (báscula de bioimpedancia o InBody), el cálculo es más preciso."
        >
          <Input id="bf" inputMode="decimal" placeholder="Ej. 22" value={form.bodyFatPct} onChange={(e) => set('bodyFatPct', e.target.value)} />
        </Field>
      </Section>

      <Section title="Actividad física">
        <OptionGroup label="Actividad física" className="@md:grid-cols-2" value={form.activity} options={ACTIVITY_OPTIONS} onChange={(v) => set('activity', v)} />
      </Section>

      <Section title="Objetivo">
        <OptionGroup label="Objetivo" className="@lg:grid-cols-3" value={form.goal} options={GOAL_OPTIONS} onChange={(v) => set('goal', v)} />
      </Section>

      <Section title="Tipo de dieta" description="Toca una opción para ver sus beneficios y riesgos.">
        <OptionGroup
          label="Tipo de dieta"
          value={form.diet}
          onChange={(v) => set('diet', v)}
          options={DIET_OPTIONS.map((d) => ({ value: d.value, label: d.label, hint: d.summary }))}
          renderExtra={(opt, selected) => {
            if (!selected) return null
            const info = DIET_OPTIONS.find((d) => d.value === opt.value)!
            return (
              <div className="grid grid-cols-1 gap-3 border-t px-3 py-3 text-xs">
                <ProsCons title="A favor" items={info.pros} tone="good" />
                <ProsCons title="A considerar" items={info.cons} tone="warn" />
              </div>
            )
          }}
        />
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Información general; no sustituye la consulta con un nutriólogo o médico.
        </p>
      </Section>

      <Section title="Tiempo para cocinar" description="El menú usará recetas rápidas en tus días ocupados.">
        <Field label="Días ocupados">
          <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Días ocupados">
            {WEEK_DAYS.map((d) => {
              const on = form.busyDays.includes(d.value)
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={d.label}
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    'h-11 rounded-md border text-sm font-medium transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-muted-foreground',
                  )}
                >
                  {d.short}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Máximo en días ocupados">
          <Chips values={BUSY_MINUTES} value={form.busyMax} onChange={(v) => set('busyMax', v)} />
        </Field>
        <Field label="Máximo en días libres">
          <Chips values={FREE_MINUTES} value={form.freeMax} onChange={(v) => set('freeMax', v)} />
        </Field>
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Cocinar de más en días libres</span>
            <span className="block text-xs text-muted-foreground">
              Guisos y caldos se cocinan en un día libre y se reparten como sobras en los días ocupados siguientes.
            </span>
          </span>
          <input type="checkbox" checked={form.batchCooking} onChange={(e) => set('batchCooking', e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
        </label>
      </Section>

      <Section title="Presupuesto" description="Opcional. Con los precios que captures en Compras, el menú prefiere recetas que quepan.">
        <Field label="Presupuesto semanal para comida (MXN)" htmlFor="budget" hint="Déjalo vacío si no quieres limitarlo." error={form.weeklyBudget && !budgetValue(form.weeklyBudget) ? 'Escribe una cantidad mayor a 0.' : undefined}>
          <Input id="budget" inputMode="decimal" placeholder="Ej. 1200" value={form.weeklyBudget} onChange={(e) => set('weeklyBudget', e.target.value)} />
        </Field>
      </Section>

      </div>

      <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-10">
        <Section title="Tu resultado">
          {result ? (
            <ResultDetail result={result} kcalAdjustment={form.kcalAdjustment} onClearAdjustment={() => set('kcalAdjustment', 0)} />
          ) : (
            <p className="text-sm text-muted-foreground">Falta: {missing.join(', ') || 'corregir los campos marcados'}.</p>
          )}
        </Section>
        <div className="hidden items-center gap-3 rounded-xl border bg-card p-4 text-sm xl:flex">
          <div className="min-w-0 flex-1">{statusLine}</div>
          {saveButton}
        </div>
      </aside>
      </div>

      {/* Barra de guardado fija: encima de las pestañas en teléfono; al pie (junto a la barra lateral) en tablet */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-10 border-t bg-card/95 backdrop-blur-md md:bottom-0 md:left-60 md:pb-[env(safe-area-inset-bottom)] lg:left-64 xl:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 md:px-10">
          <div className="min-w-0 flex-1 text-sm">{statusLine}</div>
          {saveButton}
        </div>
      </div>
    </div>
  )
}

function ResultDetail({ result, kcalAdjustment, onClearAdjustment }: { result: NutritionResult; kcalAdjustment: number; onClearAdjustment: () => void }) {
  const bmiLabel = { bajo: 'Bajo peso', normal: 'Normal', sobrepeso: 'Sobrepeso', obesidad: 'Obesidad' }[result.bmiCategory]
  return (
    <div className="grid grid-cols-1 gap-5">
      <MacroSummary kcal={result.targetKcal} macros={result.macros} />

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center">
        <Stat label="IMC" value={result.bmi.toFixed(1)} sub={bmiLabel} />
        <Stat label="Basal" value={result.bmr.toLocaleString('es-MX')} sub="kcal" />
        <Stat label="Gasto diario" value={result.tdee.toLocaleString('es-MX')} sub="kcal" />
      </dl>

      <p className="text-xs text-muted-foreground">
        Metabolismo basal con la fórmula {result.bmrMethod === 'katch-mcardle' ? 'Katch-McArdle (usa tu % de grasa)' : 'Mifflin-St Jeor'}.
        {result.adjustment !== 0 &&
          ` Ajuste por objetivo: ${result.adjustment > 0 ? '+' : '−'}${Math.abs(result.adjustment).toLocaleString('es-MX')} kcal.`}
      </p>

      {kcalAdjustment !== 0 && (
        <div className="flex items-center gap-3 rounded-md bg-secondary p-3 text-xs text-secondary-foreground">
          <span className="min-w-0 flex-1">
            Incluye un ajuste de <strong>{kcalAdjustment > 0 ? '+' : '−'}{Math.abs(kcalAdjustment)} kcal</strong> que aceptaste por tu progreso de peso.
          </span>
          <button type="button" onClick={onClearAdjustment} className="shrink-0 font-medium underline-offset-4 hover:underline">
            Quitar
          </button>
        </div>
      )}

      {result.floorApplied && (
        <p className="flex gap-2 rounded-md bg-accent p-3 text-xs text-accent-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          El cálculo daba menos del mínimo recomendado, así que se fijó en el piso de seguridad. Para un déficit mayor conviene
          supervisión profesional.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5">
      <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      <dd className="text-[11px] text-muted-foreground">{sub}</dd>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="@container grid grid-cols-1 gap-4">{children}</CardContent>
    </Card>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function Chips({ values, value, onChange }: { values: number[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={cn(
            'h-10 rounded-md border text-sm tabular-nums transition-colors',
            v === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
          )}
        >
          {v} min
        </button>
      ))}
    </div>
  )
}

function ProsCons({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'warn' }) {
  return (
    <div>
      <p className={cn('mb-1 font-medium', tone === 'good' ? 'text-primary' : 'text-accent-foreground')}>{title}</p>
      <ul className="grid grid-cols-1 gap-1 text-muted-foreground">
        {items.map((t) => (
          <li key={t} className="flex gap-1.5">
            <span aria-hidden>•</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}
