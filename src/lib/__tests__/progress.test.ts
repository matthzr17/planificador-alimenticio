import { describe, expect, it } from 'vitest'
import { recalcTargets, suggestAdjustment, weeklyTrend } from '../progress'

const logs = (weights: number[], startDay = 1) =>
  weights.map((w, i) => ({ logged_on: `2026-10-${String(startDay + i * 7).padStart(2, '0')}`, weight_kg: w }))
const today = '2026-10-29'
const none = { extraKcal: 0, adjustedOn: null }

describe('progreso de peso', () => {
  it('necesita al menos 3 registros en 2 semanas', () => {
    expect(weeklyTrend(logs([80, 79.5]), today)).toBeNull()
    expect(weeklyTrend(logs([80, 79.5, 79]), today)).toMatchObject({ kgPerWeek: -0.5, count: 3 })
  })

  it('perdiendo grasa y estancado: sugiere −150', () => {
    const s = suggestAdjustment(logs([80, 80.1, 79.9, 80]), 'cut', today, none)
    expect(s?.deltaKcal).toBe(-150)
  })

  it('perdiendo a buen ritmo: no sugiere nada', () => {
    expect(suggestAdjustment(logs([80, 79.5, 79, 78.5]), 'cut', today, none)).toBeNull()
  })

  it('bajando demasiado rápido: sugiere +150', () => {
    expect(suggestAdjustment(logs([80, 79, 78, 77]), 'cut', today, none)?.deltaKcal).toBe(150)
  })

  it('ganando músculo sin subir: sugiere +150', () => {
    expect(suggestAdjustment(logs([70, 70, 70.05, 70]), 'bulk', today, none)?.deltaKcal).toBe(150)
  })

  it('espera 2 semanas desde el último ajuste y respeta el tope de ±500', () => {
    const stuck = logs([80, 80.1, 79.9, 80])
    expect(suggestAdjustment(stuck, 'cut', today, { extraKcal: -150, adjustedOn: '2026-10-20' })).toBeNull()
    expect(suggestAdjustment(stuck, 'cut', today, { extraKcal: -400, adjustedOn: '2026-10-01' })?.deltaKcal).toBe(-100)
    expect(suggestAdjustment(stuck, 'cut', today, { extraKcal: -500, adjustedOn: '2026-10-01' })).toBeNull()
  })

  it('el ajuste se suma al cálculo del perfil', () => {
    const p = { sex: 'male', birth_date: '1995-05-10', height_cm: 175, weight_kg: 80, body_fat_pct: null, activity_level: 'moderate', goal: 'maintain', diet_type: 'traditional', kcal_adjustment: 0 }
    const base = recalcTargets(p)!
    expect(recalcTargets(p, { extraKcal: -150 })!.targetKcal).toBe(base.targetKcal - 150)
    expect(recalcTargets({ ...p, sex: null })).toBeNull()
  })
})
