import { describe, expect, it } from 'vitest'
import { applySwap, itemMacros, itemUses, macrosOf, pantryAfterUsing, versionIngredients } from '../cooking'

const ing = (id: string, unit: string, gpu: number | null, kcal: number, p = 0, c = 0, f = 0) => ({
  id,
  default_unit: unit,
  grams_per_unit: gpu,
  kcal_100g: kcal,
  protein_100g: p,
  carbs_100g: c,
  fat_100g: f,
})
const byId = new Map(
  [
    ing('tortilla', 'pza', 30, 218, 5.7, 44.6, 2.9),
    ing('oaxaca', 'g', null, 300, 22, 3, 22),
    ing('panela', 'g', null, 260, 18, 3, 20),
    ing('aceite', 'ml', null, 884, 0, 0, 100),
    ing('mantequilla', 'g', null, 717, 0.9, 0.1, 81),
    ing('crema', 'g', null, 198, 2.4, 4.6, 19),
  ].map((i) => [i.id, i]),
)
const quesadillas = {
  id: 'q',
  servings: 1,
  kcal_serving: 400,
  protein_serving: 20,
  carbs_serving: 40,
  fat_serving: 18,
  ingredients: [
    { ingredient_id: 'tortilla', quantity: 3, unit: 'pza' },
    { ingredient_id: 'oaxaca', quantity: 60, unit: 'g' },
    { ingredient_id: 'aceite', quantity: 5, unit: 'ml' },
  ],
}

describe('cocinar con cambios', () => {
  it('sin cambios usa la receta escalada a las porciones', () => {
    expect(itemUses({ recipe_id: 'q', servings: 2 }, quesadillas)).toEqual([
      { ingredient_id: 'tortilla', quantity: 6, unit: 'pza' },
      { ingredient_id: 'oaxaca', quantity: 120, unit: 'g' },
      { ingredient_id: 'aceite', quantity: 10, unit: 'ml' },
    ])
    expect(itemMacros({ recipe_id: 'q', servings: 2 }, quesadillas, byId).kcal).toBe(800)
  })

  it('cambiar Oaxaca por panela conserva el peso y recalcula calorías', () => {
    const uses = applySwap(itemUses({ recipe_id: 'q', servings: 1 }, quesadillas), 'oaxaca', 'panela', byId)
    expect(uses[1]).toEqual({ ingredient_id: 'panela', quantity: 60, unit: 'g' })
    const kcal = macrosOf(uses, byId).kcal
    expect(kcal).toBeCloseTo(3 * 30 * 2.18 + 60 * 2.6 + 5 * 8.84, 5)
  })

  it('con override usa lo que realmente se usó', () => {
    const override = [
      { ingredient_id: 'tortilla', quantity: 4, unit: 'pza' },
      { ingredient_id: 'panela', quantity: 90, unit: 'g' },
    ]
    const item = { recipe_id: 'q', servings: 1, ingredients_override: override }
    expect(itemUses(item, quesadillas)).toEqual(override)
    expect(itemMacros(item, quesadillas, byId).kcal).toBeCloseTo(4 * 30 * 2.18 + 90 * 2.6, 5)
  })

  it('agregar crema a mi versión la guarda por porción de la receta', () => {
    // Usé 30 g de crema en 2 porciones → la receta (1 porción) lleva 15 g
    const v = versionIngredients(quesadillas, [{ ingredient_id: 'crema', quantity: 30, unit: 'g' }], 2, byId)
    expect(v.find((u) => u.ingredient_id === 'crema')).toEqual({ ingredient_id: 'crema', quantity: 15, unit: 'g' })
    expect(v).toHaveLength(4)
  })

  it('descuenta de la despensa lo que se usó, y deshacer lo regresa', () => {
    const pantry = [
      { ingredient_id: 'panela', quantity: 300, unit: 'g', is_approximate: false, expires_on: null },
      { ingredient_id: 'tortilla', quantity: 20, unit: 'pza', is_approximate: false, expires_on: null },
    ]
    const uses = [
      { ingredient_id: 'panela', quantity: 90, unit: 'g' },
      { ingredient_id: 'tortilla', quantity: 4, unit: 'pza' },
      { ingredient_id: 'mantequilla', quantity: 14, unit: 'g' }, // no está en la despensa
    ]
    const after = pantryAfterUsing(uses, pantry, byId, -1)
    expect(after).toEqual([
      { ...pantry[0], quantity: 210 },
      { ...pantry[1], quantity: 16 },
    ])
    const undo = pantryAfterUsing(uses, after, byId, 1)
    expect(undo.find((p) => p.ingredient_id === 'panela')!.quantity).toBe(300)
    expect(undo.find((p) => p.ingredient_id === 'mantequilla')).toMatchObject({ quantity: 14, unit: 'g' })
  })
})
