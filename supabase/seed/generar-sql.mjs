// Genera supabase/seed_etapa3.sql a partir de catalogo.mjs.
// Uso: node supabase/seed/generar-sql.mjs
import fs from 'node:fs'
import path from 'node:path'
import { INGREDIENTES, RECETAS } from './catalogo.mjs'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const nombres = new Set(INGREDIENTES.map((i) => i[0]))
const errores = []

for (const r of RECETAS) {
  for (const [ing] of r.ing) if (!nombres.has(ing)) errores.push(`Receta "${r.n}": ingrediente desconocido "${ing}"`)
  const vistos = new Set()
  for (const [ing] of r.ing) {
    if (vistos.has(ing)) errores.push(`Receta "${r.n}": ingrediente repetido "${ing}"`)
    vistos.add(ing)
  }
  for (const [ing, , unidad] of r.ing) {
    const def = INGREDIENTES.find((i) => i[0] === ing)
    if (def && unidad === 'pza' && !def[3]) errores.push(`Receta "${r.n}": "${ing}" en piezas sin gramos por pieza`)
  }
}
if (errores.length) {
  console.error(errores.join('\n'))
  process.exit(1)
}

const out = []
out.push('-- Etapa 3: catálogo general de ingredientes y recetas (owner_id NULL = visible para todos, solo lectura).')
out.push('-- Generado por supabase/seed/generar-sql.mjs; no editar a mano.\n')
out.push('create unique index if not exists recipes_global_name_uq on public.recipes (lower(name)) where owner_id is null;\n')

out.push('insert into public.ingredients (name, category, default_unit, grams_per_unit, kcal_100g, protein_100g, carbs_100g, fat_100g) values')
out.push(
  INGREDIENTES.map(([n, c, u, gpu, k, p, ch, f]) => `  (${q(n)}, ${q(c)}, ${q(u)}, ${gpu ?? 'null'}, ${k}, ${p}, ${ch}, ${f})`).join(',\n'),
)
out.push(`on conflict (lower(name), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set
  category = excluded.category, default_unit = excluded.default_unit, grams_per_unit = excluded.grams_per_unit,
  kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g, fat_100g = excluded.fat_100g;\n`)

out.push('insert into public.recipes (name, description, meal_type, prep_time_min, servings, diet_tags, instructions) values')
out.push(
  RECETAS.map(
    (r) =>
      `  (${q(r.n)}, ${r.d ? q(r.d) : 'null'}, ${q(r.t)}, ${r.min}, ${r.s}, array[${r.tags.map(q).join(', ')}]::text[], ${q(JSON.stringify(r.pasos))}::jsonb)`,
  ).join(',\n'),
)
out.push(`on conflict (lower(name)) where owner_id is null do update set
  description = excluded.description, meal_type = excluded.meal_type, prep_time_min = excluded.prep_time_min,
  servings = excluded.servings, diet_tags = excluded.diet_tags, instructions = excluded.instructions;\n`)

// Ingredientes por receta. Sin DELETE (Supabase pide confirmación manual para borrar):
// se insertan los que falten y se actualiza la cantidad de los que ya existen.
out.push('insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit)')
out.push('select r.id, i.id, v.quantity, v.unit from (values')
out.push(
  RECETAS.flatMap((r) => r.ing.map(([ing, cant, u]) => `  (${q(r.n)}, ${q(ing)}, ${cant}::numeric, ${q(u)})`)).join(',\n'),
)
out.push(`) as v(recipe, ingredient, quantity, unit)
join public.recipes r on lower(r.name) = lower(v.recipe) and r.owner_id is null
join public.ingredients i on lower(i.name) = lower(v.ingredient) and i.owner_id is null
on conflict (recipe_id, ingredient_id) do update set quantity = excluded.quantity, unit = excluded.unit;\n`)

// Macros por porción calculados desde los ingredientes
out.push(`update public.recipes r set
  kcal_serving    = round((t.kcal / r.servings)::numeric, 1),
  protein_serving = round((t.protein / r.servings)::numeric, 1),
  carbs_serving   = round((t.carbs / r.servings)::numeric, 1),
  fat_serving     = round((t.fat / r.servings)::numeric, 1)
from (
  select ri.recipe_id,
    sum(g.grams * i.kcal_100g / 100)    as kcal,
    sum(g.grams * i.protein_100g / 100) as protein,
    sum(g.grams * i.carbs_100g / 100)   as carbs,
    sum(g.grams * i.fat_100g / 100)     as fat
  from public.recipe_ingredients ri
  join public.ingredients i on i.id = ri.ingredient_id
  cross join lateral (select case ri.unit
      when 'kg' then ri.quantity * 1000
      when 'l'  then ri.quantity * 1000
      when 'pza' then ri.quantity * coalesce(i.grams_per_unit, 100)
      else ri.quantity end as grams) g
  group by ri.recipe_id
) t
where t.recipe_id = r.id and r.owner_id is null;`)

const destino = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'seed_etapa3.sql')
fs.writeFileSync(destino, out.join('\n') + '\n')
console.log(`OK: ${INGREDIENTES.length} ingredientes, ${RECETAS.length} recetas, ${RECETAS.reduce((s, r) => s + r.ing.length, 0)} renglones → ${destino}`)
