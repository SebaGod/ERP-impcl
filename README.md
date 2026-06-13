# ERP Producción

ERP simple y visual para pymes que producen cosas físicas. Core genérico
(etapas, productos y vocabulario configurables) + plantillas verticales;
la primera plantilla es **imprentas / rubro gráfico**.

## Stack

- [Next.js](https://nextjs.org) (App Router, TypeScript) + Tailwind CSS
- [Supabase](https://supabase.com): Postgres, Auth, RLS, Storage, Realtime
- Deploy: Netlify

## Desarrollo

```bash
cp .env.example .env.local   # completar con las llaves del proyecto Supabase
npm install
npm run dev
```

### Migraciones

Las migraciones viven en `supabase/migrations/`. Para aplicarlas:

```bash
npx supabase link --project-ref <ref>
npm run db:push
```

### Tests

```bash
npm run test:unit   # unitarios (formato CLP, fechas, RUT)
npm run test:rls    # aislamiento multi-tenant (requiere .env.local)
```

Los tests RLS crean dos organizaciones reales y verifican tabla por tabla
que ningún usuario puede ver ni escribir datos de otra organización, y que
el rol `operario` no accede a finanzas ni precios.

## Estructura

- `src/config/brand.ts` — branding reemplazable (nombre, logo, colores)
- `src/templates/` — plantillas verticales (precargan etapas, catálogo,
  categorías financieras e insumos al crear una organización)
- `src/app/(auth)` — login, registro, invitaciones
- `src/app/(app)` — la aplicación (tablero, cotizaciones, clientes,
  finanzas, insumos, reportes, configuración)
- `supabase/migrations/` — schema completo de los 6 módulos con RLS

## Roles

- **admin**: dueño, ve todo
- **operario**: solo producción — tablero y actualización de etapas,
  sin acceso a finanzas ni precios (enforcement en base de datos)
