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
| POST | `/api/trabajos/:id/plan`, `/api/trabajos/:id/entregables` | Plan de producción desde la plantilla del tipo de trabajo; entregable nuevo |
| PUT/DELETE | `/api/entregables/:id` | Editar o eliminar (si aún no empieza) un entregable |
| POST | `/api/entregables/:id/tareas` | Tarea nueva del entregable (entra a la cola del responsable) |
| POST | `/api/entregables/:id/enviar-revision`, `…/revisar`, `…/entregar`, `…/respuesta-cliente` | Flujo: revisión interna (aprobar u observar), entrega al cliente y su conformidad |
| GET | `/api/entregables?vista=` | Bandeja: en revisión, por entregar, con el cliente o todos los abiertos |
| GET/PUT/POST | `/api/produccion/colas`, `…/mia`, `…/:usuarioId/orden`, `…/:usuarioId/orden-sugerido` | Colas de trabajo planificadas (inicio, fin, holgura) y su orden |
| POST | `/api/tareas/:id/iniciar` | Quien la realiza marca que empezó |
| GET/POST | `/api/ausencias/:id/reasignacion` | Propuesta de reasignación por ausencia (simula la cola de cada candidato) y su aplicación |
| POST/GET | `/api/trabajos/:id/urgente`, `/api/trabajos/:id/urgentes`, `/api/urgentes` | Autorizar una urgencia (asistente administrativa) y bandeja de producción |
| GET/POST | `/api/urgentes/:id/impacto?usuarioId=`, `…/ejecutar`, `…/rechazar` | Simulación en cascada e inserción en la cola de un auxiliar |
| GET/POST/PUT | `/api/horas-extra`, `…/:id/responder`, `…/aprobar`, `…/realizar`, `…/anular`, `…/topes` | Horas extra y bonos: propuesta → aceptación → aprobación → realizado; topes y resumen por persona |
| GET/POST | `/api/notificaciones`, `…/:id/leer`, `…/leer-todas` | Campanita: últimos 50 avisos y no leídas (cada usuario, los suyos) |
| POST | `/api/auth/cambiar-clave` | Cambiar la contraseña propia (obligatorio en el primer ingreso o tras un restablecimiento) |
| GET/POST/PUT | `/api/usuarios`, `/api/usuarios/:id` | Usuarios: listado, alta (contraseña temporal) y edición |
| POST/PUT/DELETE | `/api/usuarios/:id/activar`, `…/desactivar`, `…/roles`, `…/excepciones`, `…/restablecer-clave`, `…/desbloquear`, `…/topes-horas-extra` | Acceso, roles, permisos por persona y tope de horas extra propio |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/roles/:id`, `/api/roles/:id/permisos` | Roles y su matriz de permisos (el administrador tiene siempre todos) |
| GET/PUT | `/api/parametros` | Parámetros configurables (definidos en `packages/shared/src/administracion.ts`) |
| GET | `/api/auditoria` | Registro de cambios con filtros |
| GET | `/api/tiempo/activo` | El cronómetro que la persona tiene corriendo (`{ activo }`) |
| POST | `/api/tareas/:id/cronometro/iniciar`, `…/pausar` | Cronómetro por tarea (uno a la vez: iniciar otra pausa la anterior) |
| GET/POST/DELETE | `/api/tareas/:id/tiempo`, `…/tiempo/:registroId` | Tramos registrados y registro manual (con motivo) |
| GET | `/api/reportes/tiempos?desde&hasta` | Estimado frente a real por actividad, por persona y mayores diferencias |
| WS | `/api/socket.io` | Avisos en vivo (Socket.IO). La web se conecta con su access token en `auth.token`; cada usuario tiene su sala |

### Avisos automáticos

`RecordatoriosService` (con `@nestjs/schedule`, hora de Lima) avisa sin repetir (clave única por usuario):

- **Cada minuto:** reuniones que empiezan en los próximos 15 minutos.
- **Cada noche a las 22:00:** detiene los cronómetros que quedaron corriendo y avisa a la persona.
- **Cada día a las 7:30:** tareas vencidas, tareas por asignar para hoy o mañana, entregables y cuotas que vencen en 3 días o ya vencieron, y tareas de la cola que ya no llegan a su fecha.

En las pruebas (`NODE_ENV=test`) no corren solos: las pruebas los llaman a mano.
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
