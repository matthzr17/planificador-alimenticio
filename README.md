# Planificador Alimenticio

App personal (PWA para iPhone) de planificación alimenticia: perfil nutricional, despensa, menú semanal y lista de compras.

**App:** https://matthzr17.github.io/planificador-alimenticio/

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 + componentes estilo shadcn/ui (`src/components/ui`)
- Supabase: autenticación y PostgreSQL con Row Level Security
- vite-plugin-pwa: instalable en el iPhone y funciona sin conexión (el "cascarón" de la app)
- GitHub Actions → GitHub Pages en cada push a `main`

## Estructura

```
src/
  auth/            Sesión de Supabase (AuthProvider, useAuth)
  components/      AppShell (barra de pestañas) y componentes ui/
  lib/             Cliente de Supabase, tipos de la base de datos, utilidades
  pages/           Pantallas (Login, Home y módulos por etapa)
supabase/
  schema_etapa1.sql  Esquema de la base de datos aplicado en Supabase
```

## Desarrollo local (opcional)

```bash
npm install
npm run dev
```

Las variables públicas de Supabase están en `.env`. La seguridad de los datos depende de las políticas RLS, no de ocultar esa llave. **Nunca** se debe agregar la `service_role` key ni la contraseña de la base de datos al repositorio.

## Instalar en el iPhone

1. Abrir la URL de la app en **Safari**.
2. Compartir → **Agregar a inicio**.

## Etapas

1. ✅ Setup, arquitectura base, Supabase y GitHub
2. Módulo nutricional y cálculo de macros
3. Despensa, recetario y menú semanal
4. Lista de compras y comparador de supermercados
5. Pulido de UI/UX y pruebas
