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
| `pnpm --filter @grupoes/api admin:restablecer <correo>` | Recuperación de acceso desde la consola: muestra una contraseña temporal, desbloquea la cuenta, cierra sus sesiones y obliga a cambiarla al entrar. El `SEED_ADMIN_PASSWORD` del `.env` solo se usa al crear el administrador por primera vez |
| `pnpm typecheck` / `pnpm lint` | Revisión de tipos y linter de API y frontend |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:e2e` | Pruebas e2e contra la base `produccion_test` (se crea, migra y carga sola; nunca toca la de desarrollo) |
| `pnpm dev:shared` | Recompila `packages/shared` al guardar |

## Despliegue

Para publicarlo en un VPS con Ubuntu (Nginx, HTTPS, systemd, respaldos y actualizaciones) sigue [docs/despliegue.md](docs/despliegue.md); los archivos de configuración están en [`deploy/`](deploy).

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
| POST | `/api/trabajos/:id/reuniones` | Programa una reunión a un cliente (un trabajo; botón «Programar reunión» en su ficha, permiso `tareas.crear`): solo actividades de reunión que apliquen a clientes; la asignación sigue lo configurado en la actividad (coordinada → por asignar y avisa a producción). No en trabajos finalizados o cancelados. Queda en la línea de tiempo del trabajo y en la agenda de reuniones como «Cliente» |
| GET/PUT | `/api/entregas?desde&hasta&auxiliarId&jefeId&asistenteId&seguimiento`, `/api/trabajos/:id/nota-entrega` | Tablero de entregas por semana y día de entrega (pantalla `/entregas`, permisos `entregas.ver` y `entregas.exportar`), como la hoja de control del equipo: un trabajo por fila con la actividad que toca ahora, horas, cliente, enlace de Drive, entrega por el cliente, jefe, auxiliar(es), inicio planificado, entrega interna (la del entregable), asistente y nota editable. El color es el seguimiento del trabajo; feriados y cumpleaños salen como filas aparte; «Revisar tiempos» si ya se trabajó más de lo estimado. Exporta la semana a CSV (Excel). Desde la tabla se cambia el auxiliar o se busca apoyo (diálogo de «Buscar apoyo», permiso `programacion.reasignar`) y el inicio de la actividad (`PUT /api/produccion/tareas/:id/inicio`, permiso `programacion.programar`): día y hora que pueden ser pasados; la cola se reacomoda y, si el auxiliar ya tiene actividades, esta empieza cuando terminan. No en trabajos con fechas fijas |
| GET/PUT | `/api/reuniones?desde&hasta&estado&responsableId&actividadId`, `/api/tareas/:id/enlace-reunion` | Agenda de reuniones por días (pantalla `/reuniones/agenda`, permiso `agenda_reuniones.ver` con alcance propios/todos): fecha, hora, reunión, cliente, celular, nivel, carrera, universidad, enlace de la videollamada, jefe de producción, auxiliar, asistente administrativa, potencial cliente o cliente y motivo si se canceló. Desde la tabla se cambia la hora (reprogramar), se cancela con motivo y se guarda el enlace (solo http/https) |
| GET/POST | `/api/produccion/carga/:usuarioId`, `…/simular`, `…/aplicar` | Reasignar la carga de un auxiliar que pasa a otras actividades (Programación → Colas → «Reasignar carga», permiso `programacion.reasignar`). Muestra sus trabajos por entregable con lo que falta y lo ya trabajado, sugiere a quién pasar cada trabajo completo (a una sola persona; se puede dividir por entregable), simula la cola de quien recibe y, al aplicar, traslada las tareas al final de su cola. El tramo de cronómetro abierto se cierra a nombre de quien lo hizo y quien recibe solo programa lo que falta |
| — | Pantalla `/reuniones` (permiso `reuniones.ver`) | Reuniones por programar: las tareas con hora fija que esperan responsable. «Confirmar esa hora y asignar» o «Proponer otra hora» (avisa a quien la pidió). La notificación llega solo si la actividad está en modo «queda por asignar al coordinador» (Catálogos → Actividades) |
| GET/POST | `/api/tareas/:id/candidatos`, `/api/tareas/:id/asignar` | Candidatos por prioridad y disponibilidad; asignación (con motivo si hay choque) |
| POST | `/api/tareas/:id/completar`, `…/reprogramar`, `…/cancelar` | Cierre con resultado y siguiente paso; reprogramación; cancelación |
| POST | `/api/prospectos/:id/convertir` | Convierte en cliente: trabajo, integrantes, contrato con cuotas y pago inicial opcional. Exige de cada integrante documento, nombres y apellidos; de todos, al menos un correo; y del trabajo nivel académico, universidad, carrera, fecha límite y enlace de Drive (se copian del prospecto y también lo actualizan) |
| GET | `/api/trabajos`, `/api/trabajos/:id` | Listado y detalle (según el alcance: propios, equipo o todos; montos solo con permiso) |
| GET | `/api/trabajos?responsableId=…`, `/api/trabajos/asistentes-administrativas` | Filtro del listado por la asistente administrativa que sigue al cliente (por defecto, todas) y la lista para elegirla |
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
| POST | `/api/entregables/:id/turnitin/enviar`, `…/resultado`, `…/omitir` | Turnitin entre la aprobación interna y la entrega al cliente: enviar (`entregables.turnitin`), registrar el resultado (si pasa de `turnitin.similitud_max` / `turnitin.ia_max` vuelve a corrección) y omitirlo con motivo (`entregables.omitir_turnitin`). Con `turnitin.obligatorio` no se entrega sin pasar por aquí |
| GET | `/api/entregables?vista=` | Bandeja: en revisión, por entregar, con el cliente o todos los abiertos |
| GET/PUT/POST | `/api/produccion/colas`, `…/mia`, `…/:usuarioId/orden`, `…/:usuarioId/orden-sugerido` | Colas de trabajo planificadas (inicio, fin, holgura) y su orden |
| POST | `/api/tareas/:id/iniciar` | Quien la realiza marca que empezó |
| GET/POST | `/api/ausencias/:id/reasignacion` | Propuesta de reasignación por ausencia (simula la cola de cada candidato) y su aplicación |
| POST/GET | `/api/trabajos/:id/urgente`, `/api/trabajos/:id/urgentes`, `/api/urgentes` | Autorizar una urgencia (asistente administrativa) y bandeja de producción |
| GET | `/api/urgentes/:id/propuesta` | Los entregables pendientes de la urgencia, quién puede tomar cada uno y el reparto sugerido (el que termina antes) |
| POST | `/api/urgentes/:id/simular` | Cómo queda la cola de cada persona con un reparto por entregable (consulta; no cambia nada) |
| GET/POST | `/api/urgentes/:id/impacto?usuarioId=`, `…/ejecutar`, `…/rechazar` | Simulación con un solo auxiliar; ejecutar con `reparto` (entregable → persona, hasta 4 personas) o con `usuarioId` para todo a una persona |
| GET/POST/PUT | `/api/horas-extra`, `…/:id/responder`, `…/aprobar`, `…/realizar`, `…/anular`, `…/topes` | Horas extra y bonos: propuesta → aceptación → aprobación → realizado; topes y resumen por persona |
| GET/POST | `/api/notificaciones`, `…/:id/leer`, `…/leer-todas` | Campanita: últimos 50 avisos y no leídas (cada usuario, los suyos) |
| POST | `/api/auth/cambiar-clave` | Cambiar la contraseña propia (obligatorio en el primer ingreso o tras un restablecimiento) |
| GET/POST/PUT | `/api/usuarios`, `/api/usuarios/:id` | Usuarios: listado, alta (contraseña temporal) y edición |
| GET | `/api/usuarios/:id/pendientes` | Lo que la persona deja a su nombre (tareas activas, trabajos activos en su equipo y prospectos abiertos): el aviso antes de desactivarla (exige `usuarios.desactivar`) |
| POST/PUT/DELETE | `/api/usuarios/:id/activar`, `…/desactivar`, `…/roles`, `…/excepciones`, `…/restablecer-clave`, `…/desbloquear`, `…/topes-horas-extra` | Acceso, roles, permisos por persona y tope de horas extra propio |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/roles/:id`, `/api/roles/:id/permisos` | Roles y su matriz de permisos (el administrador tiene siempre todos) |
| GET/PUT | `/api/parametros` | Parámetros configurables (definidos en `packages/shared/src/administracion.ts`) |
| GET | `/api/auditoria` | Registro de cambios con filtros |
| GET | `/api/tiempo/activo` | El cronómetro que la persona tiene corriendo (`{ activo }`) |
| POST | `/api/tareas/:id/cronometro/iniciar`, `…/pausar` | Cronómetro por tarea (uno a la vez: iniciar otra pausa la anterior) |
| GET/POST/DELETE | `/api/tareas/:id/tiempo`, `…/tiempo/:registroId` | Tramos registrados y registro manual (con motivo) |
| GET | `/api/reportes/tablero`, `…/puntualidad`, `…/retrabajo`, `…/ocupacion`, `…/cobranza` | Indicadores del periodo (`?desde&hasta`; por defecto, el mes en curso) |
| GET | `/api/reportes/conversion` | Conversión del embudo: prospectos registrados en el periodo y en qué terminaron (convertidos, perdidos, abiertos), embudo por etapa, por origen, por asistente, por tipo, por mes y motivos de pérdida |
| GET | `/api/reportes/rentabilidad` | Margen por trabajo y agrupado (confidencial: exige `usuarios.ver_costo_hora`). Las horas extra cuestan su costo por hora más el parámetro `horas_extra.recargo` (25 % por defecto) |
| GET/POST/DELETE | `/api/usuarios/:id/costos-hora` | Costo por hora con vigencia (confidencial; para guardarlo, además `usuarios.editar`) |
| GET | `/api/reportes/tiempos?desde&hasta` | Estimado frente a real por actividad, por persona y mayores diferencias |
| GET | `/api/consultas/dni/:dni` | Busca un DNI (8 dígitos) en el servicio externo (`DNI_API_URL`, sin token) para rellenar nombres, apellidos y fecha de nacimiento. Siempre responde 200 con `encontrado`, `no_encontrado` o `no_disponible`; espera 8 s como máximo, limita a 30 consultas cada 10 min por persona y audita sin guardar el número |
| GET | `/api/prospectos/posibles-responsables` | Personas activas que pueden recibir un prospecto (exige `prospectos.reasignar`) |
| POST | `/api/prospectos/:id/reasignar` | Cambia el responsable de un prospecto abierto: queda en su línea de tiempo y se avisa a ambos. Con alcance "propios" solo mueve los suyos |
| POST | `/api/prospectos/reasignar-lote` | Pasa todos los prospectos abiertos de una persona a otra (exige ver todos los prospectos). Las tareas pendientes no se mueven solas |
| GET/POST | `/api/prospectos/:id/cotizaciones` | Cotizaciones del prospecto; emitir una (ítems, validez, forma de pago) guarda el monto cotizado y lo pasa a la etapa marcada "al cotizar" |
| GET/POST | `/api/cotizaciones`, `/api/cotizaciones/:id/anular` | Listado (búsqueda y estado: vigente, vencida, anulada) y anulación con motivo |
| GET | `/api/documentos/cotizacion/:id`, `…/contrato/:trabajoId`, `…/recibo/:pagoId` | Datos para imprimir, con el texto de la plantilla ya rellenado y el monto en letras |
| GET/PUT | `/api/documentos/configuracion` | Membrete de la empresa y plantillas de texto (con variables `{cliente}`, `{monto}`…) |
| POST | `/api/trabajos/cliente-directo` | Registra a un cliente que ya trabaja con nosotros sin pasar por el seguimiento comercial (exige `trabajos.registrar_cliente_directo`, configurable por rol): integrantes (celular, documento, nombres, apellidos; al menos un correo), responsable, trabajo (tipo, prioridad, nivel, universidad, carrera, fechas, Drive), contrato con la firma en el pasado y los pagos ya recibidos. Opcionalmente programa la primera actividad (`programacion`: actividad, tiempo estimado editable, hora de inicio, auxiliar principal y jefe): arma el equipo y crea la entrega final con su tarea, que la cola no coloca antes de la fecha de inicio a esa hora. Opcionalmente indica que el trabajo lo entrega un proveedor (`proveedorId`): sigue siendo del cliente, pero el proveedor entrega y paga (cobro y recibos a su nombre). Por debajo crea un prospecto ya convertido marcado `cliente_directo` (origen "Cliente directo"), que no cuenta en los reportes de conversión. `GET …/cliente-directo/responsables` lista a quienes pueden figurar como responsables |
| GET | `/api/personas?q=…&clientes=1`, `/api/personas/:id` | Búsqueda de personas (con `clientes=1`, solo quienes tienen algún trabajo) y ficha de un cliente; `GET /api/trabajos?personaId=` lista sus trabajos, propios y de proveedor |
| GET/POST/PUT | `/api/proveedores`, `…/:id`, `…/:id/desactivar`, `…/activar` | Proveedores (nombres y apellidos; celular, correo y notas opcionales). Permisos `proveedores.ver/crear/editar/desactivar`; no se repiten (sin distinguir tildes ni mayúsculas) |
| POST | `/api/trabajos/de-proveedor` | Registra el trabajo que entrega un proveedor (exige `trabajos.registrar_de_proveedor`): título, tipo, prioridad, nivel, universidad, carrera, fecha de entrega, enlace de Drive, actividad y tiempo estimado; cobro opcional. Código `PR-AAAA-NNNN`, sin prospecto ni contrato. Al armar el equipo y generar el plan se crea una entrega final con una sola tarea |
| POST | `/api/trabajos/:id/cobro` | Registra el cobro de un trabajo de proveedor, o el contrato de un cliente registrado directo sin monto (exige `contratos.crear`); se guarda como el contrato del trabajo, con sus pagos y recibos, sin documento de contrato ni garantía |
| GET | `/api/inicio` | Panel de inicio de quien entra, en una sola llamada: indicadores de riesgo, "requiere tu acción", mi cola, ausentes de hoy, gráficos (ocupación, embudo, cobranza por antigüedad, puntualidad) y actividad reciente. Sin permiso propio: cada bloque se calcula solo si el usuario tiene el permiso correspondiente y respeta su alcance |
| GET | `/api/modulos` | Módulos del sistema con sus acciones, los roles que las tienen (y su alcance) y cuántas excepciones individuales hay (exige `modulos.ver`, Configuración → Módulos y permisos). Solo consulta: el catálogo vive en el código y se sincroniza al iniciar; quién tiene cada acción se edita en Roles |
| GET/POST/PUT | `/api/catalogos/actividades`, `…/:id` | Catálogo de actividades (Configuración → Catálogos): tiempo estimado, cómo se asigna, participaciones y los roles que pueden hacerlas con su prioridad. Crear/editar exigen `catalogos.crear`/`catalogos.editar`; `POST …/:id/desactivar` y `…/activar`, `catalogos.desactivar`. Las que el sistema busca por nombre (Elaboración, Corrección de observaciones, Revisión interna) no se renombran ni desactivan; una participación con tareas asignadas no se quita |
| POST | `/api/trabajos/:id/valoracion` | Valorar el trabajo en una reunión (exige `trabajos.valorar`): fecha, días hábiles estimados y nota. El trabajo sin equipo figura como "Valorado"; la ficha avisa (sin impedirlo) si la estimación no cabe antes de la fecha límite. La última valoración es la vigente |
| GET | `/api/produccion/tareas/:id/apoyo` | Cuando una tarea de la cola no llega a su fecha: quién puede tomarla (equipo → otros auxiliares → jefes, solo con un rol permitido para la actividad), cómo quedaría en su cola en horario normal y, si no llega, cuántas horas extra faltarían con una ventana sugerida (día, desde, hasta) y sus avisos de topes. Exige `programacion.reasignar` |
| POST | `/api/produccion/tareas/:id/reasignar` | La tarea pasa de inmediato a otra persona en horario normal (`programacion.reasignar`); queda en el historial del trabajo y se avisa |
| POST | `/api/produccion/tareas/:id/apoyo` | Propone horas extra o un bono a quien tomaría la tarea (`programacion.proponer_extra`): la persona acepta, se aprueba y **en ese momento** la tarea pasa a su cola. Una sola propuesta abierta por tarea; si la tarea ya no está pendiente, no se aprueba |
| POST | `/api/trabajos/:id/reprogramar` | Mueve la fecha de entrega del trabajo con su motivo (exige `trabajos.reprogramar`): la entrega final sigue a la fecha del trabajo, los entregables que quedarían después se ajustan, queda en el historial y se avisa al equipo. No se puede con las fechas inamovibles ni en un trabajo cerrado |
| PUT | `/api/trabajos/:id/datos` | Corrige título, nivel, universidad, carrera, Drive, observaciones y detalles (exige `trabajos.editar`); registra en el historial qué cambió. Las fechas, la prioridad y el tipo no se tocan aquí |
| POST/DELETE | `/api/trabajos/:id/fechas-fijas` | Fijar (con su motivo) o liberar las fechas de un trabajo que deben cumplirse por su prioridad (exige `trabajos.fijar_fechas`). Mientras estén fijas no se editan las fechas de sus entregables, no se reprograman sus tareas, no se dejan detrás de otras en la cola y una urgencia no puede atrasarlas sin que quien puede fijar fechas lo acepte de forma expresa (`forzarFechasFijas`) |
| POST | `/api/trabajos/:id/pausar`, `…/reanudar` | Trabajo en espera del cliente (exige `trabajos.pausar`: el asistente de producción y el administrador): pide qué información falta, suspende el trabajo y saca sus tareas en cola de la planificación; reanudar las devuelve. Cada `pausas.dias_recordatorio` días (3 por defecto) se recuerda que sigue detenido |
| POST | `/api/contratos/:id/adicionales` | Proponer un adicional (descripción, monto y cuotas que lo suman) |
| POST | `/api/adicionales/:id/aceptar`, `…/rechazar`, `…/anular` | El cliente acepta (sus cuotas entran a la cuenta y se avisa a producción y al jefe), rechaza (con motivo); anular quita sus cuotas si aún no tienen pagos (`contratos.anular`) |
| GET/POST | `/api/comentarios?entidad&entidadId`, `/api/comentarios` | Hilo de comentarios de un prospecto, trabajo, entregable o tarea; las menciones van como `@[Nombre](id)` y avisan a la persona |
| GET | `/api/comentarios/mencionables?entidad&entidadId` | Personas que se pueden mencionar: activas y con acceso al registro |
| PATCH/DELETE | `/api/comentarios/:id` | Editar (avisa solo a los nuevos mencionados) o eliminar; solo el autor |
| WS | `/api/socket.io` | Avisos en vivo (Socket.IO). La web se conecta con su access token en `auth.token`; cada usuario tiene su sala |

### Documentos imprimibles

La web arma la cotización, el contrato y el recibo como hojas A4 en `/imprimir/…` (sin el menú) y se imprimen o guardan en PDF desde el navegador. Los textos son plantillas editables en **Configuración → Documentos**; mientras no se carguen los formatos de la empresa se usan textos provisionales (`PLANTILLAS_POR_DEFECTO` en `packages/shared/src/documentos.ts`). Un dato que falta se imprime como una línea para completarlo a mano.

### Seguimiento de los trabajos (colores)

Cada trabajo muestra su situación con los colores que usa el equipo: **entregado** (amarillo), **urgente** (rojo), **pendiente de pago** (gris), **se está abordando** (celeste) y **programado** (verde); sin equipo aparece "sin asignar". Se calcula con lo que ya existe (estado, prioridad urgente y cuotas vencidas): `seguimientoDe` en `packages/shared/src/trabajos.ts`. Un trabajo puede cumplir varias a la vez: el color grande es el más importante (entregado, urgente, suspendido, pendiente de pago y luego su avance) y las demás van como etiquetas. El pago pendiente solo lo ve quien puede ver montos. El listado se filtra con `/api/trabajos?seguimiento=` (trabajos que están en esa situación) y tiene una leyenda de colores.

### Administradores ocultos

Quien no tiene el permiso **Usuarios → Gestionar administradores** (el administrador lo tiene siempre) no ve ni toca las cuentas con el rol Administrador: no salen en el listado ni en la búsqueda, su ficha y cualquier acción sobre ellas (editar, desactivar, restablecer contraseña, roles, permisos, costo por hora, pasar su cartera) responden "no encontrado", el rol Administrador no aparece en Roles ni en el selector, no se ofrecen como responsables de prospectos y no se ven en la auditoría los cambios hechos a sus cuentas. Además, sin ese permiso no se puede dar el rol Administrador, ni roles o permisos que uno mismo no tiene, ni cambiar los propios roles y permisos. Los nombres de administradores en el historial de trabajo (quién registró un pago, comentarios, líneas de tiempo) sí se ven.

### Personas con varios roles

Una persona puede tener más de un rol (sus permisos se suman). Para que siempre revise alguien distinto de quien elabora:

- **Por trabajo:** el jefe responsable no puede ser también auxiliar (principal o de apoyo) del mismo trabajo. Alguien que es auxiliar y jefe puede ser jefe en un trabajo y auxiliar en otro. Se valida al armar el equipo (`armarEquipoSchema`) y el diálogo deshabilita esas opciones.
- **Por entregable:** no se puede revisar (aprobar u observar) un entregable en cuya elaboración o corrección participó quien revisa, ni siquiera el administrador; lo revisa otro jefe o el administrador. Aplica a quien tiene una tarea de producción o corrección de ese entregable, o registró tiempo en ella.
- **Inserción urgente:** al repartirla entre varias personas, cada entregable va completo a una sola persona y el jefe responsable del trabajo no puede tomar su elaboración.
- **Reasignación por ausencia:** el jefe responsable de un trabajo no se sugiere para elaborar o corregir tareas de ese mismo trabajo.

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
