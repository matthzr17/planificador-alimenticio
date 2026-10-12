import { describe, expect, it } from 'vitest'
import { ageFromBirthDate, bmr, calculate, type ProfileInput } from '../nutrition'

const base: ProfileInput = {
  sex: 'male', ageYears: 30, heightCm: 175, weightKg: 80,
  activity: 'moderate', goal: 'maintain', diet: 'traditional',
}

describe('edad', () => {
  it('no cumple años hasta el día exacto', () => {
    const hoy = new Date(2026, 9, 12) // 12 oct 2026
    expect(ageFromBirthDate('1995-10-13', hoy)).toBe(30)
    expect(ageFromBirthDate('1995-10-12', hoy)).toBe(31)
  })
})

describe('TMB', () => {
  it('Mifflin-St Jeor sin % de grasa', () => {
    const r = bmr(base)
    expect(r.method).toBe('mifflin-st-jeor')
    expect(r.value).toBeCloseTo(1748.75)
  })
  it('Katch-McArdle con % de grasa', () => {
    const r = bmr({ ...base, bodyFatPct: 20 })
    expect(r.method).toBe('katch-mcardle')
    expect(r.value).toBeCloseTo(1752.4)
  })
})

describe('cálculo completo', () => {
  it('hombre, mantenimiento, dieta tradicional', () => {
    const r = calculate(base)
    expect(r.tdee).toBe(2710)
    expect(r.targetKcal).toBe(2710)
    expect(r.macros).toEqual({ proteinG: 128, carbsG: 346, fatG: 90 })
    expect(r.bmi).toBe(26.1)
    expect(r.bmiCategory).toBe('sobrepeso')
  })

  it('con obesidad usa peso de referencia para la proteína', () => {
    const r = calculate({ sex: 'female', ageYears: 40, heightCm: 160, weightKg: 90, activity: 'sedentary', goal: 'cut', diet: 'traditional' })
    expect(r.bmiCategory).toBe('obesidad')
    expect(r.targetKcal).toBe(1480)
    expect(r.macros.proteinG).toBe(128) // 64 kg × 2.0, no 90 × 2.0
  })

  it('aplica el piso de calorías', () => {
    const r = calculate({ sex: 'female', ageYears: 60, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'cut', diet: 'traditional' })
    expect(r.targetKcal).toBe(1200)
    expect(r.floorApplied).toBe(true)
  })

  it('keto fija carbohidratos bajos y completa con grasa', () => {
    const r = calculate({ ...base, diet: 'keto' })
    expect(r.macros.carbsG).toBe(25)
    expect(r.macros.fatG).toBe(233)
  })

  it('el déficit nunca supera 750 kcal', () => {
    const r = calculate({ ...base, weightKg: 140, activity: 'very_active', goal: 'cut' })
    expect(r.adjustment).toBe(-750)
  })

  it('las calorías de los macros cuadran con el objetivo (±10 kcal)', () => {
    for (const diet of ['traditional', 'high_protein', 'keto', 'vegetarian', 'intermittent_fasting', 'mediterranean'] as const) {
      for (const goal of ['cut', 'maintain', 'bulk'] as const) {
        const r = calculate({ ...base, diet, goal })
        const kcal = r.macros.proteinG * 4 + r.macros.carbsG * 4 + r.macros.fatG * 9
        expect(Math.abs(kcal - r.targetKcal)).toBeLessThanOrEqual(10)
        expect(r.macros.carbsG).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
