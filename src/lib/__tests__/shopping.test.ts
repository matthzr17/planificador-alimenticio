import { describe, expect, it } from 'vitest'
import { buildShoppingList, compareStores, evaluateOption, pantryAfterCooking, planNeeds, purchasable, rankOptions, type PriceOption } from '../shopping'

const huevo = { id: 'huevo', default_unit: 'pza', grams_per_unit: 50, protein_100g: 12.6 }
const claras = { id: 'claras', default_unit: 'ml', grams_per_unit: null, protein_100g: 10.9 }
const pollo = { id: 'pollo', default_unit: 'g', grams_per_unit: null, protein_100g: 22.5 }
const ingredientById = new Map([huevo, claras, pollo].map((i) => [i.id, i]))

describe('lista de compras', () => {
  it('suma lo que pide el menú y omite platillos ya hechos', () => {
    const recipeById = new Map([
      ['omelette', { id: 'omelette', servings: 1, ingredients: [{ ingredient_id: 'huevo', quantity: 2, unit: 'pza' }] }],
      ['pollo', { id: 'pollo', servings: 2, ingredients: [{ ingredient_id: 'pollo', quantity: 300, unit: 'g' }] }],
    ])
    const needs = planNeeds(
      [
        { recipe_id: 'omelette', servings: 1.5 },
        { recipe_id: 'omelette', servings: 1, is_done: true },
        { recipe_id: 'pollo', servings: 1 },
      ],
      recipeById,
      ingredientById,
    )
    expect(needs.get('huevo')).toBe(150) // 1.5 porciones × 2 pza × 50 g
    expect(needs.get('pollo')).toBe(150) // 300 g / 2 porciones × 1
  })

  it('resta la despensa y redondea a cantidades comprables', () => {
    const needs = new Map([
      ['huevo', 500], // 10 piezas
      ['pollo', 820],
      ['claras', 100],
    ])
    const pantry = [
      { ingredient_id: 'huevo', quantity: 3, unit: 'pza' },
      { ingredient_id: 'claras', quantity: 1, unit: 'l' },
    ]
    const list = buildShoppingList(needs, pantry, ingredientById)
    expect(list.find((l) => l.ingredient_id === 'huevo')).toMatchObject({ quantity: 7, unit: 'pza' })
    expect(list.find((l) => l.ingredient_id === 'pollo')).toMatchObject({ quantity: 850, unit: 'g' })
    expect(list.find((l) => l.ingredient_id === 'claras')).toBeUndefined() // ya alcanza
  })

  it('ignora faltantes mínimos', () => {
    const list = buildShoppingList(new Map([['pollo', 1000]]), [{ ingredient_id: 'pollo', quantity: 950, unit: 'g' }], ingredientById)
    expect(list).toHaveLength(0)
  })

  it('compra al menos una pieza o 50 g', () => {
    expect(purchasable(10, huevo)).toEqual({ quantity: 1, unit: 'pza' })
    expect(purchasable(12, pollo)).toEqual({ quantity: 50, unit: 'g' })
  })
})

describe('comparador de precios', () => {
  const opt = (id: string, store: string, ingredient_id: string, qty: number, unit: string, price: number): PriceOption => ({
    id,
    ingredient_id,
    store,
    product_name: id,
    brand: null,
    package_qty: qty,
    package_unit: unit,
    price,
  })

  it('calcula paquetes, precio por kilo y costo por proteína', () => {
    const e = evaluateOption(opt('h18', 'walmart', 'huevo', 18, 'pza', 63), 600, huevo) // 12 huevos
    expect(e.packages).toBe(1)
    expect(e.total).toBe(63)
    expect(e.perKg).toBe(70) // 63 / 900 g × 1000
    expect(e.per10gProtein).toBeCloseTo(5.56, 1) // 63 / (900 × 12.6 %) × 10
  })

  it('elige la presentación más barata para la cantidad que necesitas', () => {
    // Necesitas 400 g: 2 paquetes de 250 g ($90) cuestan menos que 1 de 1 kg ($150)
    const ranked = rankOptions([opt('kilo', 'sams', 'pollo', 1, 'kg', 150), opt('chico', 'walmart', 'pollo', 250, 'g', 45)], 400, pollo)
    expect(ranked[0].id).toBe('chico')
    expect(ranked[0].packages).toBe(2)
    expect(ranked[0].total).toBe(90)
  })

  it('compara tiendas y la combinación más barata', () => {
    const prices = [
      opt('h-w', 'walmart', 'huevo', 18, 'pza', 63),
      opt('h-s', 'soriana', 'huevo', 18, 'pza', 59),
      opt('p-w', 'walmart', 'pollo', 1, 'kg', 140),
    ]
    const cmp = compareStores(
      [
        { ingredient_id: 'huevo', grams: 600 },
        { ingredient_id: 'pollo', grams: 800 },
        { ingredient_id: 'claras', grams: 500 }, // sin precios
      ],
      prices,
      ingredientById,
    )
    expect(cmp.itemsWithPrices).toBe(2)
    expect(cmp.best).toEqual({ total: 199, covered: 2 }) // 59 + 140
    expect(cmp.byStore[0]).toEqual({ store: 'walmart', total: 203, covered: 2 })
    expect(cmp.byStore[1]).toEqual({ store: 'soriana', total: 59, covered: 1 })
  })
})

describe('despensa al cocinar', () => {
  const recipe = { id: 'r', servings: 2, ingredients: [{ ingredient_id: 'huevo', quantity: 4, unit: 'pza' }, { ingredient_id: 'pollo', quantity: 300, unit: 'g' }] }
  const pantry = [
    { id: 'a', ingredient_id: 'huevo', quantity: 12, unit: 'pza', is_approximate: false, expires_on: null },
    { id: 'b', ingredient_id: 'pollo', quantity: 0.1, unit: 'kg', is_approximate: true, expires_on: '2026-10-20' },
  ]
  it('descuenta en la unidad del registro y no baja de cero', () => {
    const out = pantryAfterCooking(recipe, 1, pantry, ingredientById, -1)
    expect(out.find((p) => p.ingredient_id === 'huevo')!.quantity).toBe(10) // 4 pza / 2 porciones
    expect(out.find((p) => p.ingredient_id === 'pollo')).toMatchObject({ quantity: 0, unit: 'kg', expires_on: '2026-10-20' })
  })
  it('deshacer regresa lo descontado y recrea lo que ya no existía', () => {
    const out = pantryAfterCooking(recipe, 1, [pantry[0]], ingredientById, 1)
    expect(out.find((p) => p.ingredient_id === 'huevo')!.quantity).toBe(14)
    expect(out.find((p) => p.ingredient_id === 'pollo')).toMatchObject({ quantity: 150, unit: 'g' })
  })
})

describe('formato de cantidades', async () => {
  const { formatQty } = await import('../units')
  it('usa kilos y litros desde 1,000', () => {
    expect(formatQty(1050, 'g')).toBe('1.05 kg')
    expect(formatQty(1500, 'ml')).toBe('1.5 L')
    expect(formatQty(250, 'g')).toBe('250 g')
    expect(formatQty(1.5, 'pza')).toBe('1½ pza')
  })
})
