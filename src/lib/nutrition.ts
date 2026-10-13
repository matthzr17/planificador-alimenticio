// Motor de cálculo nutricional. Funciones puras, sin acceso a red ni a la UI.
//
// TMB (tasa metabólica basal):
//   - Katch-McArdle si hay % de grasa:  370 + 21.6 × masa magra (kg)
//   - Mifflin-St Jeor si no:            10·peso + 6.25·estatura − 5·edad + 5 (hombre) / −161 (mujer)
// Gasto total (TDEE) = TMB × factor de actividad.
// Objetivo: déficit 20 % (máx. 750 kcal), mantenimiento, o superávit 10 % (máx. 350 kcal).
// Piso de seguridad: 1,500 kcal hombres / 1,200 kcal mujeres.

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Goal = 'cut' | 'maintain' | 'bulk'
export type DietType =
  | 'traditional'
  | 'high_protein'
  | 'keto'
  | 'vegetarian'
  | 'intermittent_fasting'
  | 'mediterranean'

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 }

// Gramos de proteína por kg de peso de referencia, según objetivo.
const PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.0, maintain: 1.6, bulk: 1.8 }
const HIGH_PROTEIN_BONUS = 0.4

// % de calorías que vienen de grasa (el resto, carbohidratos). Keto se calcula aparte.
const FAT_PCT: Record<Exclude<DietType, 'keto'>, number> = {
  traditional: 0.3,
  high_protein: 0.25,
  vegetarian: 0.3,
  intermittent_fasting: 0.3,
  mediterranean: 0.35,
}
const KETO_CARBS_G = 25
const MIN_CARBS_G = 50 // por debajo de esto, en dietas no keto se reduce la grasa
const MIN_FAT_PCT = 0.2

export type ProfileInput = {
  sex: Sex
  ageYears: number
  heightCm: number
  weightKg: number
  bodyFatPct?: number | null
  activity: ActivityLevel
  goal: Goal
  diet: DietType
  /** Ajuste aceptado a partir del progreso de peso (kcal, + o −). */
  extraKcal?: number
}

export type Macros = { proteinG: number; carbsG: number; fatG: number }

export type NutritionResult = {
  bmi: number
  bmiCategory: 'bajo' | 'normal' | 'sobrepeso' | 'obesidad'
  bmr: number
  bmrMethod: 'katch-mcardle' | 'mifflin-st-jeor'
  tdee: number
  adjustment: number // kcal sumadas (+) o restadas (−) por el objetivo
  targetKcal: number
  floorApplied: boolean
  macros: Macros
  macroPct: Macros // % de las calorías totales
}

export function ageFromBirthDate(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  let age = today.getFullYear() - y
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100
  return round1(weightKg / (h * h))
}

export function bmiCategory(value: number): NutritionResult['bmiCategory'] {
  if (value < 18.5) return 'bajo'
  if (value < 25) return 'normal'
  if (value < 30) return 'sobrepeso'
  return 'obesidad'
}

export function bmr(p: Pick<ProfileInput, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct'>) {
  if (p.bodyFatPct != null && p.bodyFatPct > 0) {
    const leanMass = p.weightKg * (1 - p.bodyFatPct / 100)
    return { value: 370 + 21.6 * leanMass, method: 'katch-mcardle' as const }
  }
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears
  return { value: base + (p.sex === 'male' ? 5 : -161), method: 'mifflin-st-jeor' as const }
}

function goalAdjustment(tdee: number, goal: Goal): number {
  if (goal === 'cut') return -Math.min(tdee * 0.2, 750)
  if (goal === 'bulk') return Math.min(tdee * 0.1, 350)
  return 0
}

// Con obesidad, calcular proteína sobre el peso total sobreestima; se usa el peso equivalente a IMC 25.
function proteinReferenceWeight(weightKg: number, heightCm: number): number {
  const h = heightCm / 100
  return bmi(weightKg, heightCm) >= 30 ? 25 * h * h : weightKg
}

export function macrosFor(targetKcal: number, p: ProfileInput): Macros {
  const perKg = PROTEIN_G_PER_KG[p.goal] + (p.diet === 'high_protein' ? HIGH_PROTEIN_BONUS : 0)
  const proteinG = proteinReferenceWeight(p.weightKg, p.heightCm) * perKg
  const proteinKcal = proteinG * 4

  if (p.diet === 'keto') {
    const carbsG = KETO_CARBS_G
    const fatG = Math.max(0, (targetKcal - proteinKcal - carbsG * 4) / 9)
    return roundMacros({ proteinG, carbsG, fatG })
  }

  let fatPct = FAT_PCT[p.diet]
  let carbsG = (targetKcal - proteinKcal - targetKcal * fatPct) / 4
  if (carbsG < MIN_CARBS_G && fatPct > MIN_FAT_PCT) {
    fatPct = Math.max(MIN_FAT_PCT, (targetKcal - proteinKcal - MIN_CARBS_G * 4) / targetKcal)
    carbsG = (targetKcal - proteinKcal - targetKcal * fatPct) / 4
  }
  const fatG = (targetKcal * fatPct) / 9
  return roundMacros({ proteinG, carbsG: Math.max(0, carbsG), fatG })
}

export function calculate(p: ProfileInput): NutritionResult {
  const b = bmr(p)
  const tdee = b.value * ACTIVITY_FACTORS[p.activity]
  const adjustment = goalAdjustment(tdee, p.goal)
  const raw = round10(tdee + adjustment + (p.extraKcal ?? 0))
  const floor = KCAL_FLOOR[p.sex]
  const targetKcal = Math.max(raw, floor)
  const macros = macrosFor(targetKcal, p)
  const imc = bmi(p.weightKg, p.heightCm)

  return {
    bmi: imc,
    bmiCategory: bmiCategory(imc),
    bmr: Math.round(b.value),
    bmrMethod: b.method,
    tdee: round10(tdee),
    adjustment: Math.round(adjustment),
    targetKcal,
    floorApplied: raw < floor,
    macros,
    macroPct: {
      proteinG: Math.round(((macros.proteinG * 4) / targetKcal) * 100),
      carbsG: Math.round(((macros.carbsG * 4) / targetKcal) * 100),
      fatG: Math.round(((macros.fatG * 9) / targetKcal) * 100),
    },
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round10 = (n: number) => Math.round(n / 10) * 10
const roundMacros = (m: Macros): Macros => ({
  proteinG: Math.round(m.proteinG),
  carbsG: Math.round(m.carbsG),
  fatG: Math.round(m.fatG),
})
