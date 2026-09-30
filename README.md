# Sistema de Producción — GRUPO ES

Sistema interno para gestionar prospectos, trabajos académicos, producción, entregables y pagos.

- Alcance y decisiones: [PLAN.md](PLAN.md)
- Modelo de datos: [docs/modelo-datos.md](docs/modelo-datos.md) (versión visual: `docs/modelo-datos.html`)

## Estructura

```
apps/
  api/          API (NestJS 12 + Prisma 7 + PostgreSQL 16)
  web/          Frontend (React 19 + Vite 8 + Tailwind v4 + shadcn/ui + TanStack Router/Query)
packages/
  shared/       Catálogo de módulos y permisos, esquemas Zod y tipos compartidos
docker-compose.yml   PostgreSQL para desarrollo (puerto 5433)
```

## Requisitos

- Node.js 22 o superior
- pnpm 10
- Docker Desktop

## Primera vez

```bash
pnpm install                      # instala dependencias, compila shared y genera el cliente de Prisma
cp apps/api/.env.example apps/api/.env   # y completar los secretos
pnpm db:up                        # levanta PostgreSQL en Docker
pnpm db:deploy                    # aplica las migraciones
pnpm db:seed                      # roles base, permisos, administrador y parámetros
pnpm dev:api                      # API en http://localhost:3000/api
pnpm dev:web                      # Frontend en http://localhost:5173 (en otra terminal)
```

En desarrollo, Vite reenvía `/api` a la API (mismo origen), así la cookie de sesión funciona sin configurar CORS.

El usuario administrador inicial es el de `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` en `apps/api/.env`.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm db:migrate` | Crea y aplica una migración nueva a partir de `schema.prisma` (desarrollo) |
| `pnpm db:deploy` | Aplica las migraciones pendientes (producción) |
| `pnpm db:seed` | Carga los datos iniciales (se puede repetir sin duplicar) |
| `pnpm db:demo` | Crea un usuario de demostración por rol (solo desarrollo; contraseña en `SEED_DEMO_PASSWORD`) |
| `pnpm db:studio` | Abre Prisma Studio para ver los datos |
| `pnpm typecheck` / `pnpm lint` | Revisión de tipos y linter de API y frontend |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:e2e` | Pruebas e2e contra la base `produccion_test` (se crea, migra y carga sola; nunca toca la de desarrollo) |
| `pnpm dev:shared` | Recompila `packages/shared` al guardar |

## Endpoints disponibles

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/salud` | Estado de la API y de la base de datos |
| POST | `/api/auth/login` | Inicia sesión; devuelve el access token y deja el refresh token en una cookie httpOnly |
| POST | `/api/auth/refresh` | Renueva el access token (rota el refresh token) |
| POST | `/api/auth/logout` | Cierra la sesión |
| GET | `/api/auth/me` | Usuario actual con sus roles, permisos efectivos y menú |
| GET/POST/PATCH | `/api/prospectos`, `/api/prospectos/:id` | Listado, alta (con primera actividad opcional), detalle y edición |
| PATCH | `/api/prospectos/:id/etapa` | Cambio manual de etapa (perdido pide motivo; reactivar) |
| POST | `/api/prospectos/:id/tareas` | Programar una actividad para el prospecto |
| GET | `/api/actividades` | Catálogo de actividades con participaciones, roles y prioridades |
| GET | `/api/tareas/mias`, `/api/tareas/por-asignar` | Mis tareas y bandeja del coordinador |
| GET/POST | `/api/tareas/:id/candidatos`, `/api/tareas/:id/asignar` | Candidatos por prioridad y disponibilidad; asignación (con motivo si hay choque) |
| POST | `/api/tareas/:id/completar`, `…/reprogramar`, `…/cancelar` | Cierre con resultado y siguiente paso; reprogramación; cancelación |
| POST | `/api/prospectos/:id/convertir` | Convierte en cliente: trabajo, integrantes, contrato con cuotas y pago inicial opcional |
| GET | `/api/trabajos`, `/api/trabajos/:id` | Listado y detalle (según el alcance: propios, equipo o todos; montos solo con permiso) |
| GET/PUT | `/api/trabajos/candidatos-equipo`, `/api/trabajos/:id/equipo` | Candidatos y armado/cambio del equipo (queda el historial) |
| POST | `/api/contratos/:id/pagos`, `/api/pagos/:id/anular` | Registrar un pago (se reparte a las cuotas más antiguas, emite recibo R-) y anularlo con motivo |
| GET | `/api/contratos/cobranza` | Cuotas con saldo, de la más atrasada a la más lejana, con totales |
| GET | `/api/agenda/mia`, `/api/agenda/equipo`, `/api/agenda/usuarios/:id` | Agenda día por día (`?desde&hasta`, máx. 2 meses): horario, días no laborables, carga y tareas |
| GET/POST/PUT/DELETE | `/api/calendario/feriados`, `/api/calendario/plantillas` | Feriados por año y plantillas de horario |
| GET/PUT/PATCH | `/api/calendario/personal`, `…/:id/horario`, `…/:id` | Horario de cada persona (con fecha de vigencia) y fecha de nacimiento |
| GET/POST | `/api/ausencias`, `/api/ausencias/solicitar` | Ausencias (según alcance) y solicitud propia de vacaciones o permisos |
| POST | `/api/ausencias`, `/api/ausencias/:id/aprobar`, `…/rechazar`, `…/anular` | Registro directo (descanso médico) y resolución de solicitudes |
| GET | `/api/seguimiento/tablero` | Prospectos abiertos con su próximo paso (kanban) |
| GET | `/api/catalogos/…`, `/api/personas/…` | Catálogos del formulario y búsqueda de personas |

## Permisos

Los módulos y acciones se definen en `packages/shared/src/permisos.ts` y se sincronizan con la base de datos al iniciar la API. Para proteger un endpoint:

```ts
@RequierePermiso('prospectos.editar')
@Patch(':id')
editar(@Req() req: SolicitudAutenticada) {
  // req.alcance → 'propios' | 'equipo' | 'todos' para filtrar los datos
}
```

En el frontend, el menú lateral se arma con los módulos permitidos y para ocultar acciones se usa:

```tsx
<Can permiso="prospectos.crear">
  <Button>Nuevo prospecto</Button>
</Can>
// o usePermiso('prospectos.crear') / useAlcance('prospectos.ver')
```

## Frontend

| Carpeta | Contenido |
|---|---|
| `src/routes/` | Páginas (TanStack Router por archivos). `_app.tsx` es el layout con sesión; `_app/$.tsx` muestra "en construcción" para los módulos aún no hechos |
| `src/components/ui/` | Componentes de shadcn/ui. Agregarlos con `pnpm --filter @grupoes/web ui:add <componente>`, que además corrige un defecto de la CLI actual (escribe `import { cn } from "cn"` e instala un paquete ajeno `cn`) |
| `src/components/layout/` | Sidebar, encabezado, búsqueda global (Ctrl+K) y menú de usuario |
| `src/lib/api.ts` | Cliente de la API: token en memoria, refresh automático ante 401 y errores normalizados |
| `src/stores/sesion.ts` | Estado de la sesión (Zustand) |

La sesión se cierra sola tras los minutos de inactividad del parámetro `seguridad.inactividad_minutos`.
