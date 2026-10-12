-- =====================================================================
-- Planificador alimenticio — Etapa 1: esquema base
-- Usuarios: se usa auth.users de Supabase (no se crea tabla "users").
-- Un solo usuario por ahora, pero todo queda aislado por user_id con RLS.
-- =====================================================================

-- ---------- Utilidades ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- 1. Perfil nutricional ----------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  full_name          text,
  sex                text check (sex in ('male','female')),
  birth_date         date,
  height_cm          numeric(5,1) check (height_cm between 100 and 250),
  weight_kg          numeric(5,1) check (weight_kg between 30 and 300),
  body_fat_pct       numeric(4,1) check (body_fat_pct between 3 and 60),
  bmi                numeric(4,1) generated always as
                       (round(weight_kg / ((height_cm / 100) ^ 2), 1)) stored,
  activity_level     text check (activity_level in
                       ('sedentary','light','moderate','active','very_active')),
  goal               text check (goal in ('cut','maintain','bulk')),
  diet_type          text check (diet_type in
                       ('traditional','high_protein','keto','vegetarian',
                        'intermittent_fasting','mediterranean')),
  -- Tiempo para cocinar: días ocupados (0=domingo … 6=sábado) y minutos máximos
  busy_days          smallint[] default '{}',
  busy_day_max_min   smallint default 15,
  free_day_max_min   smallint default 60,
  -- Objetivos calculados por la app (Mifflin-St Jeor / Katch-McArdle)
  target_kcal        integer,
  target_protein_g   integer,
  target_carbs_g     integer,
  target_fat_g       integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crear el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. Catálogo de ingredientes ----------
-- owner_id NULL = catálogo general (solo lectura); con owner_id = ingrediente propio
create table public.ingredients (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users(id) on delete cascade,
  name           text not null,
  category       text,            -- proteína, verdura, fruta, lácteo, cereal, etc.
  default_unit   text not null default 'g' check (default_unit in ('g','kg','ml','l','pza')),
  grams_per_unit numeric(7,2),    -- p. ej. 1 huevo = 50 g, para convertir 'pza'
  kcal_100g      numeric(6,1),
  protein_100g   numeric(5,1),
  carbs_100g     numeric(5,1),
  fat_100g       numeric(5,1),
  created_at     timestamptz not null default now()
);
create unique index ingredients_name_owner_uq
  on public.ingredients (lower(name), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index ingredients_owner_idx on public.ingredients (owner_id);

-- ---------- 3. Despensa ----------
create table public.inventory (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  quantity       numeric(10,2) not null check (quantity >= 0),
  unit           text not null check (unit in ('g','kg','ml','l','pza')),
  is_approximate boolean not null default false,
  expires_on     date,
  updated_at     timestamptz not null default now(),
  unique (user_id, ingredient_id)
);
create index inventory_ingredient_idx on public.inventory (ingredient_id);
create trigger inventory_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

-- ---------- 4. Recetas ----------
create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users(id) on delete cascade,  -- NULL = recetario general
  name           text not null,
  description    text,
  meal_type      text check (meal_type in ('breakfast','lunch','dinner','snack')),
  prep_time_min  smallint not null,
  servings       smallint not null default 1 check (servings > 0),
  diet_tags      text[] default '{}',
  instructions   jsonb not null default '[]'::jsonb,   -- lista de pasos
  kcal_serving   numeric(6,1),
  protein_serving numeric(5,1),
  carbs_serving  numeric(5,1),
  fat_serving    numeric(5,1),
  created_at     timestamptz not null default now()
);
create index recipes_owner_idx on public.recipes (owner_id);

create table public.recipe_ingredients (
  recipe_id      uuid not null references public.recipes(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  quantity       numeric(10,2) not null check (quantity > 0),
  unit           text not null check (unit in ('g','kg','ml','l','pza')),
  primary key (recipe_id, ingredient_id)
);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

-- ---------- 5. Planes de comida ----------
create table public.meal_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start     date not null,
  target_kcal    integer,
  status         text not null default 'draft' check (status in ('draft','active','archived')),
  created_at     timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.meal_plan_items (
  id             uuid primary key default gen_random_uuid(),
  meal_plan_id   uuid not null references public.meal_plans(id) on delete cascade,
  day_of_week    smallint not null check (day_of_week between 0 and 6),
  meal_type      text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  recipe_id      uuid not null references public.recipes(id) on delete restrict,
  servings       numeric(4,2) not null default 1 check (servings > 0),
  is_done        boolean not null default false
);
create index meal_plan_items_plan_idx on public.meal_plan_items (meal_plan_id);
create index meal_plan_items_recipe_idx on public.meal_plan_items (recipe_id);

-- ---------- 6. Listas de compras ----------
create table public.shopping_lists (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_plan_id   uuid references public.meal_plans(id) on delete set null,
  name           text not null default 'Lista semanal',
  status         text not null default 'open' check (status in ('open','done')),
  created_at     timestamptz not null default now()
);
create index shopping_lists_user_idx on public.shopping_lists (user_id);
create index shopping_lists_plan_idx on public.shopping_lists (meal_plan_id);

create table public.shopping_list_items (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.shopping_lists(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  quantity       numeric(10,2) not null check (quantity > 0),
  unit           text not null check (unit in ('g','kg','ml','l','pza')),
  is_checked     boolean not null default false,
  notes          text
);
create index shopping_list_items_list_idx on public.shopping_list_items (list_id);
create index shopping_list_items_ingredient_idx on public.shopping_list_items (ingredient_id);

-- =====================================================================
-- Permisos explícitos para la Data API (la exposición automática está desactivada).
-- Solo usuarios autenticados; anon no tiene acceso a ninguna tabla.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, update                 on public.profiles            to authenticated;
grant select, insert, update, delete on public.ingredients         to authenticated;
grant select, insert, update, delete on public.inventory           to authenticated;
grant select, insert, update, delete on public.recipes             to authenticated;
grant select, insert, update, delete on public.recipe_ingredients  to authenticated;
grant select, insert, update, delete on public.meal_plans          to authenticated;
grant select, insert, update, delete on public.meal_plan_items     to authenticated;
grant select, insert, update, delete on public.shopping_lists      to authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;

-- Las funciones internas no deben poder llamarse desde la API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at()  from public, anon, authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.ingredients         enable row level security;
alter table public.inventory           enable row level security;
alter table public.recipes             enable row level security;
alter table public.recipe_ingredients  enable row level security;
alter table public.meal_plans          enable row level security;
alter table public.meal_plan_items     enable row level security;
alter table public.shopping_lists      enable row level security;
alter table public.shopping_list_items enable row level security;

-- Perfil: solo el dueño
create policy "profile_select_own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profile_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Ingredientes y recetas: leer catálogo general + propios; escribir solo propios
create policy "ingredients_select" on public.ingredients for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "ingredients_insert_own" on public.ingredients for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "ingredients_update_own" on public.ingredients for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "ingredients_delete_own" on public.ingredients for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "recipes_select" on public.recipes for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "recipes_insert_own" on public.recipes for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "recipes_update_own" on public.recipes for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "recipes_delete_own" on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "recipe_ingredients_select" on public.recipe_ingredients for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id
                 and (r.owner_id is null or r.owner_id = (select auth.uid()))));
create policy "recipe_ingredients_insert_own" on public.recipe_ingredients for insert to authenticated
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));
create policy "recipe_ingredients_update_own" on public.recipe_ingredients for update to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));
create policy "recipe_ingredients_delete_own" on public.recipe_ingredients for delete to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));

-- Tablas con user_id directo
create policy "inventory_own" on public.inventory for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meal_plans_own" on public.meal_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shopping_lists_own" on public.shopping_lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tablas hijas: acceso a través del padre
create policy "meal_plan_items_own" on public.meal_plan_items for all to authenticated
  using (exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.user_id = (select auth.uid())));
create policy "shopping_list_items_own" on public.shopping_list_items for all to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));
