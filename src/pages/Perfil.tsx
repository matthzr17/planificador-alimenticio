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
  }
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
      target_kcal: result.targetKcal,
      target_protein_g: result.macros.proteinG,
      target_carbs_g: result.macros.carbsG,
      target_fat_g: result.macros.fatG,
    })
    setSaving(false)
    setStatus(error ? { kind: 'error', text: `No se pudo guardar: ${error}` } : { kind: 'ok', text: 'Perfil guardado' })
  }

  return (
    <div className="grid gap-5 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Perfil nutricional</h1>
        <p className="text-sm text-muted-foreground">Con estos datos se calculan tus calorías y macros diarios.</p>
      </header>

      <Section title="Tus datos">
        <Field label="Nombre" htmlFor="name">
          <Input id="name" autoComplete="given-name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>

        <Field label="Sexo">
          <OptionGroup
            label="Sexo"
            columns={2}
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
        <OptionGroup label="Actividad física" value={form.activity} options={ACTIVITY_OPTIONS} onChange={(v) => set('activity', v)} />
      </Section>

      <Section title="Objetivo">
        <OptionGroup label="Objetivo" value={form.goal} options={GOAL_OPTIONS} onChange={(v) => set('goal', v)} />
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
              <div className="grid gap-3 border-t px-3 py-3 text-xs">
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
      </Section>

      <Section title="Tu resultado">
        {result ? (
          <ResultDetail result={result} />
        ) : (
          <p className="text-sm text-muted-foreground">Falta: {missing.join(', ') || 'corregir los campos marcados'}.</p>
        )}
      </Section>

      {/* Barra de guardado fija, encima de las pestañas */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-10 border-t bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 text-sm">
            {status ? (
              <span className={cn('flex items-center gap-1.5', status.kind === 'ok' ? 'text-primary' : 'text-destructive')}>
                {status.kind === 'ok' ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {status.text}
              </span>
            ) : result ? (
              <span className="font-medium tabular-nums">{result.targetKcal.toLocaleString('es-MX')} kcal / día</span>
            ) : (
              <span className="text-muted-foreground">Completa tu perfil</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!result || saving}>
            {saving && <Loader2 className="animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResultDetail({ result }: { result: NutritionResult }) {
  const bmiLabel = { bajo: 'Bajo peso', normal: 'Normal', sobrepeso: 'Sobrepeso', obesidad: 'Obesidad' }[result.bmiCategory]
  return (
    <div className="grid gap-5">
      <MacroSummary kcal={result.targetKcal} macros={result.macros} />

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center">
        <Stat label="IMC" value={result.bmi.toFixed(1)} sub={bmiLabel} />
        <Stat label="Metabolismo basal" value={result.bmr.toLocaleString('es-MX')} sub="kcal" />
        <Stat label="Gasto total" value={result.tdee.toLocaleString('es-MX')} sub="kcal" />
      </dl>

      <p className="text-xs text-muted-foreground">
        Metabolismo basal con la fórmula {result.bmrMethod === 'katch-mcardle' ? 'Katch-McArdle (usa tu % de grasa)' : 'Mifflin-St Jeor'}.
        {result.adjustment !== 0 &&
          ` Ajuste por objetivo: ${result.adjustment > 0 ? '+' : '−'}${Math.abs(result.adjustment).toLocaleString('es-MX')} kcal.`}
      </p>

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
    <div className="grid gap-0.5">
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
      <CardContent className="grid gap-4">{children}</CardContent>
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
    <div className="grid gap-2">
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
      <ul className="grid gap-1 text-muted-foreground">
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
