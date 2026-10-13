// Progreso de peso y sugerencia de ajuste de calorías. Funciones puras.
//
// Ritmo = pendiente de una recta ajustada a los registros de las últimas 4 semanas (kg por semana),
// expresado como % del peso corporal. Una recta es más estable que comparar dos pesadas sueltas,
// porque el peso varía ±1 kg de un día a otro por agua y comida.
//
// Rangos saludables (por semana):
//   Perder grasa:  bajar 0.25 % – 1 %      → si bajas menos, −150 kcal; si bajas más, +150 kcal
//   Ganar músculo: subir 0.1 % – 0.5 %     → si subes menos, +150 kcal; si subes más, −150 kcal
//   Mantener:      cambio dentro de ±0.25 % → si no, ±150 kcal en sentido contrario
// Solo se sugiere con ≥ 3 registros que cubran ≥ 14 días y si no se ajustó en los últimos 14 días.

import { ageFromBirthDate, calculate, type ActivityLevel, type DietType, type Goal, type NutritionResult, type Sex } from './nutrition'

export type WeightLog = { logged_on: string; weight_kg: number }

const DAY_MS = 86_400_000
const STEP = 150
const MAX_TOTAL = 500
export const WINDOW_DAYS = 28
const MIN_SPAN_DAYS = 14
const MIN_LOGS = 3

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export type Trend = { kgPerWeek: number; pctPerWeek: number; spanDays: number; count: number; latest: number }

/** Tendencia de las últimas 4 semanas (null si no hay datos suficientes). */
export function weeklyTrend(logs: WeightLog[], today: string): Trend | null {
  const t = day(today)
  const recent = logs
    .map((l) => ({ x: day(l.logged_on), y: Number(l.weight_kg) }))
    .filter((p) => p.x <= t && p.x >= t - WINDOW_DAYS)
    .sort((a, b) => a.x - b.x)
  if (recent.length < MIN_LOGS) return null
  const spanDays = recent[recent.length - 1].x - recent[0].x
  if (spanDays < MIN_SPAN_DAYS) return null
  const n = recent.length
  const mx = recent.reduce((s, p) => s + p.x, 0) / n
  const my = recent.reduce((s, p) => s + p.y, 0) / n
  const num = recent.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)
  const den = recent.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  const kgPerWeek = (num / den) * 7
  const latest = recent[n - 1].y
  return { kgPerWeek: round2(kgPerWeek), pctPerWeek: round2((kgPerWeek / latest) * 100), spanDays, count: n, latest }
}

export type Suggestion = { deltaKcal: number; reason: string; trend: Trend }

export function suggestAdjustment(
  logs: WeightLog[],
  goal: Goal,
  today: string,
  current: { extraKcal: number; adjustedOn: string | null },
): Suggestion | null {
  if (current.adjustedOn && day(today) - day(current.adjustedOn) < MIN_SPAN_DAYS) return null
  const trend = weeklyTrend(logs, today)
  if (!trend) return null
  const p = trend.pctPerWeek
  const weeks = Math.round(trend.spanDays / 7)
  const rate = `${trend.kgPerWeek > 0 ? '+' : trend.kgPerWeek < 0 ? '−' : ''}${Math.abs(trend.kgPerWeek).toFixed(2)} kg por semana`
  let delta = 0
  let reason = ''
  if (goal === 'cut') {
    if (p > -0.25) [delta, reason] = [-STEP, `En ${weeks} semanas casi no has bajado (${rate}).`]
    else if (p < -1) [delta, reason] = [STEP, `Estás bajando muy rápido (${rate}); conviene comer un poco más para no perder músculo.`]
  } else if (goal === 'bulk') {
    if (p < 0.1) [delta, reason] = [STEP, `En ${weeks} semanas casi no has subido (${rate}).`]
    else if (p > 0.5) [delta, reason] = [-STEP, `Estás subiendo muy rápido (${rate}); probablemente sea grasa de más.`]
  } else if (Math.abs(p) > 0.25) {
    ;[delta, reason] = [p > 0 ? -STEP : STEP, `Tu peso se está moviendo (${rate}) aunque tu objetivo es mantener.`]
  }
  if (!delta) return null
  const next = Math.max(-MAX_TOTAL, Math.min(MAX_TOTAL, current.extraKcal + delta))
  if (next === current.extraKcal) return null
  return { deltaKcal: next - current.extraKcal, reason, trend }
}

type ProfileLike = {
  sex: string | null
  birth_date: string | null
  height_cm: number | null
  weight_kg: number | null
  body_fat_pct: number | null
  activity_level: string | null
  goal: string | null
  diet_type: string | null
  kcal_adjustment?: number | null
}

/** Recalcula calorías y macros del perfil con cambios (nuevo peso, nuevo ajuste). Null si el perfil está incompleto. */
export function recalcTargets(profile: ProfileLike, changes: { weightKg?: number; extraKcal?: number } = {}): NutritionResult | null {
  const p = profile
  if (!p.sex || !p.birth_date || !p.height_cm || !p.weight_kg || !p.activity_level || !p.goal || !p.diet_type) return null
  return calculate({
    sex: p.sex as Sex,
    ageYears: ageFromBirthDate(p.birth_date),
    heightCm: Number(p.height_cm),
    weightKg: changes.weightKg ?? Number(p.weight_kg),
    bodyFatPct: p.body_fat_pct == null ? null : Number(p.body_fat_pct),
    activity: p.activity_level as ActivityLevel,
    goal: p.goal as Goal,
    diet: p.diet_type as DietType,
    extraKcal: changes.extraKcal ?? Number(p.kcal_adjustment ?? 0),
  })
}

/** Columnas del perfil que se guardan a partir de un resultado. */
export function targetColumns(r: NutritionResult) {
  return { target_kcal: r.targetKcal, target_protein_g: r.macros.proteinG, target_carbs_g: r.macros.carbsG, target_fat_g: r.macros.fatG }
}

const round2 = (n: number) => Math.round(n * 100) / 100
