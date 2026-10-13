# Planificador Alimenticio

App personal (PWA para iPhone) de planificación alimenticia: perfil nutricional, despensa, menú semanal, lista de compras y comparador de precios.

**App:** https://matthzr17.github.io/planificador-alimenticio/

## Módulos

| Módulo | Qué hace |
|---|---|
| **Perfil** | Calcula calorías y macros (Mifflin-St Jeor o Katch-McArdle, factor de actividad, ajuste por objetivo con topes y piso de seguridad). Tipos de dieta con beneficios y riesgos. Días ocupados y tiempo máximo para cocinar. |
| **Despensa** | Ingredientes en casa con cantidad exacta o aproximada y caducidad. Lo que caduca en ≤3 días se prioriza en el menú. Se descuenta sola al marcar platillos como hechos. |
| **Menú** | Genera la semana (desayuno, comida, cena y colación; sin desayuno en ayuno 16:8) priorizando la despensa, respetando dieta y tiempo por día, y ajustando porciones a las calorías. Cambiar platillo, marcar hecho, recetario con filtros. |
| **Compras** | Lista = lo que pide el menú − la despensa, en cantidades comprables. Comparador con precios capturados por tienda: costo para tu cantidad, precio por kilo, costo por 10 g de proteína, total por tienda y combinación más barata. Lo comprado pasa a la despensa. |

## Stack

- Vite + React + TypeScript, Tailwind CSS v4, componentes estilo shadcn/ui
- Supabase: Auth y PostgreSQL con Row Level Security
- vite-plugin-pwa (instalable y con el cascarón disponible sin conexión)
- GitHub Actions → GitHub Pages en cada push a `main`

## Estructura

```
src/
  lib/          Lógica pura y probada: nutrition.ts, planner.ts, shopping.ts, units.ts
  hooks/        Acceso a datos (perfil, catálogo, despensa, plan, compras, precios)
  pages/        Inicio, Perfil, Despensa, Menú, Compras, Login
  components/   AppShell, gráfica del plato, hojas, buscador de ingredientes, ui/
supabase/
  schema_etapa1.sql       Esquema base y RLS
  seed/catalogo.mjs       Ingredientes y recetas base (fuente de verdad)
  seed/generar-sql.mjs    Genera seed_etapa3.sql desde el catálogo
```

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas (vitest)
npm run build    # compila
```

Las variables públicas de Supabase están en `.env`. La seguridad depende de las políticas RLS. **Nunca** se debe agregar la `service_role` key ni la contraseña de la base de datos al repositorio.

## Precios de supermercados

Walmart, Soriana y Chedraui no ofrecen API pública y extraer precios de sus sitios va contra sus términos, así que los precios se capturan en la app (desde el ticket o consultando la tienda con los botones de cada artículo). Cada precio queda guardado y se reutiliza en las siguientes listas.

## Instalar en el iPhone

1. Abrir la URL en **Safari**.
2. Compartir → **Agregar a inicio**.
