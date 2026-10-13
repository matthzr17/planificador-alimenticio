import { describe, expect, it } from 'vitest'
import { describeServing, snapServings, type ServingPart } from '../servings'

const quesadillas: ServingPart[] = [{ q: 3, one: 'quesadilla', many: 'quesadillas', count: true }]
const picadillo: ServingPart[] = [
  { q: 1, one: 'taza de picadillo', many: 'tazas de picadillo', count: false },
  { q: 2, one: 'tortilla', many: 'tortillas', count: true },
]
const caldo: ServingPart[] = [{ q: 1, one: 'tazón grande', many: 'tazones grandes', count: false }]

describe('porciones en medidas de casa', () => {
  it('cuenta piezas enteras', () => {
    expect(describeServing(quesadillas, 1)).toBe('3 quesadillas')
    expect(describeServing(quesadillas, 1.5)).toBe('5 quesadillas') // 4.5 → 5
  })
  it('usa medios en tazas y combina partes', () => {
    expect(describeServing(picadillo, 1.5)).toBe('1½ tazas de picadillo y 3 tortillas')
    expect(describeServing(caldo, 1)).toBe('1 tazón grande')
    expect(describeServing(caldo, 2)).toBe('2 tazones grandes')
  })
  it('ajusta las porciones para que las piezas salgan enteras', () => {
    expect(snapServings(quesadillas, 1.5)).toBeCloseTo(5 / 3) // 5 quesadillas
    expect(snapServings(picadillo, 1.25)).toBe(1.5) // 2.5 tortillas → 3 → 1.5 porciones
    expect(snapServings(caldo, 1.5)).toBe(1.5) // sin piezas: no cambia
  })
  it('sin medida regresa null', () => {
    expect(describeServing([], 1)).toBeNull()
    expect(describeServing(null, 1)).toBeNull()
  })
})
