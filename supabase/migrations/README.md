# Migraciones aplicadas en Supabase

Se aplicaron con la herramienta de migraciones de Supabase (quedan registradas en el proyecto).
Aquí se describen en orden para referencia:

1. `etapa1_esquema_base` – esquema base y RLS (ver `../schema_etapa1.sql`).
2. `etapa3_catalogo_*` – catálogo de ingredientes y recetas (ver `../seed_etapa3.sql`).
3. `etapa4_precios_y_compras` – tabla `product_prices`, columnas de lista de compras.
4. `bloque1_medidas_por_ingrediente` – tabla `ingredient_measures` (pieza, rebanada, cucharada, taza...) con RLS.
5. `bloque2_porciones_caseras` – `recipes.serving_parts` (cómo se sirve 1 porción).
6. `bloque3_cocinar_con_cambios` – `ingredients.swap_group`, `meal_plan_items.ingredients_override`,
   `recipes.base_recipe_id` (versiones personales) e ingredientes sustitutos nuevos.

Para ver el SQL exacto: Supabase → Database → Migrations.
7. `bloque4_favoritas_y_sobras` – tabla `recipe_favorites`, `profiles.batch_cooking`, `meal_plan_items.leftover_of_day`.
8. `bloque4_semana_inicia_domingo` – los planes existentes pasan a empezar en domingo.
