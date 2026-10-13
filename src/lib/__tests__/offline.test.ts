import { describe, expect, it } from 'vitest'
import { applyPending, dropPending, enqueue, isNetworkError } from '../offline'

describe('sin señal', () => {
  it('combina cambios del mismo renglón y los aplica sobre la lista', () => {
    enqueue({ table: 'shopping_list_items', id: 'a', changes: { is_checked: true } })
    enqueue({ table: 'shopping_list_items', id: 'a', changes: { quantity: 3 } })
    enqueue({ table: 'meal_plan_items', id: 'a', changes: { is_done: true } })
    const rows = applyPending('shopping_list_items', [
      { id: 'a', is_checked: false, quantity: 1 },
      { id: 'b', is_checked: false, quantity: 2 },
    ])
    expect(rows).toEqual([
      { id: 'a', is_checked: true, quantity: 3 },
      { id: 'b', is_checked: false, quantity: 2 },
    ])
    dropPending('shopping_list_items', ['a'])
    expect(applyPending('shopping_list_items', [{ id: 'a', is_checked: false }])).toEqual([{ id: 'a', is_checked: false }])
    // El cambio de otra tabla sigue en cola
    expect(applyPending('meal_plan_items', [{ id: 'a', is_done: false }])).toEqual([{ id: 'a', is_done: true }])
  })

  it('distingue errores de red de errores de datos', () => {
    expect(isNetworkError('TypeError: Failed to fetch')).toBe(true)
    expect(isNetworkError('Load failed')).toBe(true)
    expect(isNetworkError('new row violates row-level security policy')).toBe(false)
  })
})
