# Plan del Sistema de Producción — GRUPO ES

Sistema interno de **GRUPO ES**, empresa que elabora trabajos académicos (tesis, artículos, etc.). Cubre el ciclo completo: registro del prospecto con su primera actividad (como el enfoque), contrato y pagos, producción del trabajo con entregables parciales, revisión interna y entrega al cliente. Todo el trabajo del personal se organiza en **tareas** basadas en un catálogo de **actividades**, con una agenda que muestra la disponibilidad de cada persona.

---

## 1. Roles

| Rol | Responsabilidades |
|---|---|
| **Administrador** | Gestiona usuarios, roles, horarios y catálogos (tipos de trabajo, actividades, universidades, etc.). Ve todo. |
| **Asistente administrativo** | Registra prospectos con sus contactos y su primera actividad, registra contratos y pagos, comunica al cliente (WhatsApp). |
| **Auxiliar de producción** | Da enfoques y elabora los trabajos y entregables que se le asignan. |
| **Asistente de producción** | Arma el equipo de cada trabajo, **programa** las actividades de los auxiliares y las reuniones según su disponibilidad, reasigna ante ausencias, ejecuta la inserción de trabajos urgentes autorizados y propone horas extras o bonos. |
| **Jefe de producción** | Es responsable de los trabajos que se le asignan: revisa cada entregable antes de enviarlo al cliente (lo aprueba o lo devuelve con observaciones). Cubre tareas cuando no hay auxiliares disponibles y aprueba horas extras y bonos. |

> Un usuario puede tener más de un rol (por ejemplo, jefe de producción que también es administrador). Estos son los **roles base**: el administrador puede crear más roles y configurar los permisos de cada uno y de cada usuario (ver sección 6).

---

## 2. Flujo general

```
[Asistente adm.] registra PROSPECTO
  ├─ contactos (mínimo 1, con celular)
  ├─ datos del trabajo (título, universidad, carrera, nivel, prioridad...)
  └─ primera ACTIVIDAD (p. ej., Enfoque)
        │
        ├─ si es tipo REUNIÓN: día y hora que pidió el cliente (obligatorio)
        ▼
Tarea "por asignar" ──► bandeja del [Asistente de producción]
  ──► asigna responsables según el rol, la prioridad y la disponibilidad
  ──► el responsable da el enfoque y registra observaciones y tiempo real
        │
        ▼
¿Acepta contrato? ── No ──► Prospecto DESCARTADO / EN SEGUIMIENTO
        │ Sí                  (tareas de seguimiento: llamada, mensaje...)
        ▼
Prospecto pasa a CLIENTE (se completan los datos de los integrantes)
Se crea el TRABAJO con los datos del prospecto + CONTRATO (monto, cuotas)
        │
        ▼
[Asistente de producción] arma el EQUIPO: 1+ auxiliares + 1 jefe de producción
(se sugiere el que dio el enfoque) y PROGRAMA las tareas en la cola de cada auxiliar
(sin feriados, cumpleaños, vacaciones, permisos ni descansos médicos)
        │
        ▼
Por cada ENTREGABLE (parcial o final):
  Tareas de producción del auxiliar ──► envía a revisión
        │
        ▼
  [Jefe de producción] tarea de revisión ── Observado ──► tarea de corrección
        │ Aprobado
        ▼
  [Asistente adm.] lo entrega a todos los integrantes por WhatsApp y lo registra
        │
        ▼
  ¿El cliente tiene observaciones? ── Sí ──► tarea de corrección (auxiliar)
        │ No
        ▼
  Entregable CERRADO
        │
        ▼
Cuando se cierra el entregable final, el trabajo queda FINALIZADO
```

---

## 3. Registro del prospecto

Un **prospecto** representa una oportunidad de trabajo (no una persona). Tiene uno o más **contactos** y, al convertirse, genera un **trabajo**.

### 3.1 Contactos del prospecto (uno o más)
| Campo | Obligatorio |
|---|---|
| Celular (WhatsApp) | **Sí** |
| Nombres | No |
| Apellidos | No |
| Tipo de documento (DNI, CE, pasaporte) | No |
| Número de documento | No (si se llena el tipo, se pide el número, y viceversa) |
| Email | No |
| Contacto principal | Uno de los contactos se marca como principal |

- El celular identifica a la persona. Si ya existe, se reutiliza su registro y el sistema avisa si tiene otros prospectos o trabajos.

### 3.2 Datos del trabajo
| Campo | Obligatorio | Nota |
|---|---|---|
| Tipo de trabajo | Sí | Catálogo (Tesis, Artículo...) |
| Título del trabajo | No | |
| Prioridad del trabajo | Sí | Catálogo: Urgente / Alta / Media / Baja (por defecto: Media) |
| Universidad | No | Catálogo con autocompletado; se puede agregar una nueva al vuelo |
| Carrera | No | Catálogo con autocompletado; se puede agregar una nueva al vuelo |
| Nivel académico | No | Catálogo: Pregrado (bachiller/licenciatura), Maestría, Doctorado, Segunda especialidad... |
| Fecha de entrega tentativa | No | Pasa a ser la fecha límite propuesta del trabajo |
| Origen del contacto | Sí | Catálogo: Facebook, Instagram, TikTok, WhatsApp, Referido, Página web, Otro... |
| Link del Drive | No | URL válida; se abre en una pestaña nueva |
| Observaciones | No | Notas breves internas |
| Detalles | No | Descripción amplia del requerimiento o del avance del cliente |

### 3.3 Primera actividad (opcional)
- El prospecto se puede registrar **sin actividad**. En ese caso entra a la bandeja de seguimiento del asistente administrativo (ver 3.5).
- Si se agrega, se elige una actividad del catálogo que **aplique a prospectos** (p. ej., Enfoque).
- **Si la actividad es tipo Reunión**, son obligatorios el **día y la hora** que pidió el cliente, y la modalidad (presencial/virtual).
- A quién llega la tarea depende del **modo de asignación** de la actividad (ver 4.2). Por ejemplo, el Enfoque va en estado **`por_asignar`** a la bandeja del **asistente de producción**, que asigna al responsable según el rol, la prioridad y la disponibilidad. Si no hay nadie disponible a esa hora, puede **reprogramarla** y coordinar el nuevo horario con el cliente.

### 3.4 Conversión a cliente
- Los datos del prospecto (título, tipo, prioridad, universidad, carrera, nivel, link del Drive, fecha tentativa, observaciones y detalles) se **copian al trabajo**, y se pueden editar.
- Los contactos pasan a ser **integrantes** del trabajo (se eligen cuáles, hasta el máximo del tipo de trabajo).
- El trabajo queda **sin asignar** hasta que el asistente de producción arma su equipo (ver 5.1).
- Las tareas del prospecto quedan en el historial del trabajo.

### 3.5 Seguimiento del prospecto (asistente administrativo)
Cada prospecto tiene un **responsable de seguimiento**: por defecto, el asistente administrativo que lo registró (se puede reasignar). Su trabajo es llevar al prospecto hasta el contrato o hasta descartarlo.

**a) Embudo por etapas (vista kanban y lista)**
| Etapa | Significado |
|---|---|
| **Nuevo** | Recién registrado, aún sin contacto real |
| **Contactado** | Ya se habló con él, se está recopilando información |
| **Enfoque agendado** | Tiene una reunión de enfoque programada |
| **Enfoque realizado** | Ya se dio el enfoque; falta la propuesta |
| **Cotizado** | Se le envió el precio y las condiciones |
| **Negociación** | Está evaluando, pide descuento, espera el pago inicial... |
| **Convertido** | Firmó el contrato: se creó el trabajo |
| **Perdido** | No se concretó (se registra el motivo) |

**El embudo es configurable** (catálogo de etapas que maneja el administrador). Las etapas de arriba son solo la **base inicial**:
- Se pueden agregar, renombrar, reordenar, cambiar el color o desactivar etapas.
- Cada etapa tiene una **clase**: `abierta`, `ganada` (convertido) o `perdida`. Solo puede existir una etapa ganada y una perdida, porque el sistema las usa para la conversión y el motivo de pérdida.
- **Movimiento automático (opcional):** una etapa se puede vincular a un evento, para que el prospecto pase a ella solo. Por ejemplo:
  - "Enfoque agendado" ← al programar una tarea de la actividad Enfoque
  - "Enfoque realizado" ← al completar esa tarea
- Las demás etapas las mueve el asistente a mano (arrastrando en el kanban).
- Si se desactiva una etapa que tiene prospectos, el sistema pide a qué etapa moverlos.

**Visibilidad:** cada asistente administrativo ve **solo sus prospectos** (de los que es responsable de seguimiento). El administrador ve todos y puede reasignarlos.

**b) Próximo seguimiento obligatorio**
- Todo prospecto activo (no convertido ni perdido) debe tener un **próximo seguimiento**: una tarea con fecha (llamada, mensaje, reunión...).
- Al completar una tarea de seguimiento, el sistema pide el **resultado** y **agendar el siguiente** (o marcar al prospecto como perdido).
- Los prospectos **sin próximo seguimiento** o con el seguimiento **vencido** aparecen resaltados y generan una alerta.

**c) Registro de cada contacto (bitácora)**
- **Resultado del contacto** (catálogo): Contestó / No contestó / Interesado / Pidió cotización / Lo pensará / No interesado / Número equivocado.
- Nota libre.
- **Intentos sin respuesta:** después de **3** intentos seguidos sin respuesta (valor configurable), el sistema sugiere marcarlo como perdido ("no responde").
- Todo se ve en una **línea de tiempo** del prospecto: registro, cambios de etapa, tareas, contactos y notas.

**d) Datos comerciales**
- **Temperatura:** Caliente / Tibio / Frío (qué tan probable es que cierre).
- **Monto cotizado** y fecha de la cotización.
- **Motivo de pérdida** (catálogo): Precio, Eligió a otro, No responde, Ya no lo necesita, Lo hará por su cuenta, Otro.
- Un prospecto perdido se puede **reactivar** si el cliente vuelve.

**e) Bandeja "Mis seguimientos"**
- **Hoy**, **Vencidos**, **Próximos días** y **Sin seguimiento**.
- Filtros por etapa, temperatura, origen, prioridad y fecha tentativa de entrega.
- Acceso directo al botón de WhatsApp de cada contacto y registro rápido del resultado.

---

## 4. Actividades y tareas

### 4.1 Actividad (catálogo configurable)
Define **qué** se puede hacer y cómo.

| Campo | Ejemplo (Enfoque) |
|---|---|
| Nombre | Enfoque |
| Tipo de actividad | Reunión |
| Tiempo estimado | 80 min |
| Aplica a | Prospecto / Cliente / **Ambos** |
| Participaciones (roles) | ver 4.2 |
| Requiere fecha y hora fija | Sí (reunión) / No (producción: basta un día planificado) |
| Modo de asignación | Coordinada (ver 4.2.1) |
| Es de seguimiento | No (Sí para llamadas o mensajes de seguimiento: piden resultado y próximo seguimiento) |
| Activa | Sí |

### 4.2 Roles por actividad: participaciones y prioridad
Una actividad define una o más **participaciones**. Cada una indica:
- qué **roles** pueden cubrirla (cualquiera de ellos), cada rol con su **prioridad**
- cuántas personas se necesitan
- si es **obligatoria** u **opcional**

Así se cubren los dos casos: "puede hacerlo cualquiera de estos roles" y "se necesitan varias personas a la vez".

**Prioridad del rol en la actividad** (catálogo configurable, ordenado por nivel):
| Nivel | Prioridad | Significado |
|---|---|---|
| 1 | **Principal** | Rol natural de la actividad; se le asigna primero |
| 2 | **Secundaria** | Cubre la actividad si no hay nadie disponible con prioridad principal |
| 3 | **Respaldo** *(opcional)* | Solo en casos excepcionales |

> No confundir con la **prioridad del trabajo** (Alta/Media/Baja), que indica la importancia o urgencia del trabajo del cliente.

**Ejemplo, Enfoque de tesis:**
| Participación | Rol | Prioridad | Cantidad | Obligatoria |
|---|---|---|---|---|
| Quien da el enfoque | Jefe de producción | Principal | 1 | Sí |
| | Auxiliar de producción | Principal | | |
| | Asistente de producción | Secundaria | | |
| Acompañante | Asistente administrativo | Principal | 1 | No |

Al asignar la tarea, el sistema:
- solo deja elegir usuarios con alguno de los roles permitidos
- los ordena por **prioridad del rol** y luego por **disponibilidad** (primero los de prioridad principal que estén libres)
- si se asigna a alguien de prioridad secundaria habiendo alguien de prioridad principal libre, lo advierte (se puede continuar)
- guarda con qué rol y prioridad se asignó a cada responsable (útil si el usuario tiene varios roles, y para reportes).

#### 4.2.1 Modo de asignación (configurable por actividad)
Define **quién decide** el responsable cuando se crea la tarea.

| Modo | Cómo funciona | Cuándo usarlo | Ejemplos |
|---|---|---|---|
| **Al creador** | La tarea se asigna a quien la crea (si tiene un rol permitido) | Tareas propias del día a día | Llamada o mensaje de seguimiento, recordatorio de pago, registro de pago |
| **Directa** | Quien crea la tarea elige al responsable entre los usuarios permitidos, con su disponibilidad a la vista | Tareas simples entre áreas | Elaboración del contrato, pedir un dato al auxiliar |
| **Coordinada** | Queda `por_asignar` en la bandeja del **coordinador** de la actividad, que elige al responsable | Tareas que requieren conocimiento del tema o que ocupan la agenda de producción | Enfoque, reunión de avance, producción, corrección |
| **Al responsable del trabajo** | Se asigna sola al auxiliar ya asignado al trabajo (solo para clientes) | Continuidad del trabajo | Corrección de observaciones, reunión de avance |

- El **coordinador** es un rol configurable por actividad (por defecto, el asistente de producción).
- Regla práctica: si la tarea la hacen **roles de producción**, es **coordinada**; si la hace el **mismo rol que la crea**, es **al creador**.
- En cualquier modo, quien tenga permiso puede **reasignar** la tarea después.

### 4.3 Tipos de actividad (catálogo configurable, con esta base)
| Tipo | Para qué | Ejemplos | Comportamiento |
|---|---|---|---|
| **Reunión** | Encuentros con el cliente | Enfoque, reunión de avance, asesoría, preparación para la sustentación | Día y hora obligatorios, modalidad (presencial/virtual), contactos que asisten |
| **Contacto / Seguimiento** | Comunicación breve | Llamada, mensaje de seguimiento, recordatorio de pago | Resultado del contacto |
| **Producción** | Elaboración del trabajo | Redacción de capítulo, búsqueda bibliográfica, procesamiento estadístico | Se liga a un entregable |
| **Corrección** | Atender observaciones | Levantar observaciones del jefe, del cliente o del asesor | Se liga a un entregable y a la observación |
| **Revisión / Calidad** | Control interno | Revisión del jefe, antiplagio (Turnitin), formato APA | Resultado: aprobado u observado |
| **Administrativa** | Gestión interna | Elaboración del contrato, registro de pago, cobranza | — |
| **Entrega** | Envío al cliente | Entrega de avance, entrega final | Registro de destinatarios (WhatsApp) |

### 4.4 Tarea (instancia de una actividad)
- Actividad, y el tiempo estimado que viene de ella (se puede ajustar)
- Referencia: **prospecto** o **trabajo**, y un **entregable** si aplica
- Contactos o integrantes del cliente involucrados (por ejemplo, los dos en una reunión)
- Responsables asignados, cada uno con su participación, rol y prioridad
- Programación: fecha y hora de inicio (obligatorias en reuniones) o día planificado
- Estado: `por_asignar` → `pendiente` → `en_proceso` → `completada` | `reprogramada` | `cancelada` | `no_asistio`
- Resultado u observaciones

### 4.5 Tiempo real
- Cada responsable registra su tiempo con los botones **Iniciar / Pausar / Finalizar** (cronómetro), o lo ingresa a mano si olvidó marcar (queda indicado como manual).
- Se compara el **estimado con el real** por tarea, por persona y por actividad. Esto sirve para ajustar los tiempos estimados del catálogo con datos reales.

### 4.6 Agenda y disponibilidad
- **Horario laboral configurable por usuario**, con **uno o más tramos por día** (turno partido). Se define al crear el usuario y se puede cambiar después.
  - **Plantillas de horario:** el administrador crea plantillas y, al crear un usuario, elige una y la ajusta si hace falta. Plantilla base, "Horario estándar":
    | Día | Tramo 1 | Tramo 2 |
    |---|---|---|
    | Lunes a viernes | 8:00 – 13:00 | 15:00 – 19:00 |
    | Sábado | 8:00 – 13:00 | — |
    | Domingo | — | — |
  - El espacio entre tramos (13:00–15:00) **no cuenta** como tiempo disponible: la cola de trabajo "salta" ese intervalo.
  - **Vigencia:** cada horario tiene fecha de inicio. Así, un cambio de horario no altera el pasado y se aplica desde una fecha (la cola se recalcula desde ese día).
- **Días no laborables** (feriados, cumpleaños, vacaciones, permisos, descanso médico): **bloquean** la agenda por completo (ver 5.2).
- **Capacidad diaria** = horas del horario − días no laborables − ausencias parciales.
- **Ocupación**:
  - las tareas con hora fija (reuniones) ocupan un bloque exacto en el calendario
  - las tareas sin hora fija (producción, corrección) se ordenan en la **cola de trabajo** de cada persona y el sistema calcula cuándo empiezan y terminan (ver 5.3).
- **Al asignar una tarea**, el sistema:
  - muestra solo usuarios con un rol permitido
  - indica su disponibilidad (libre / ocupado / sobrecargado / no laborable)
  - **no permite** asignar en días no laborables
  - **advierte** si hay un choque de horario o si se supera la capacidad del día (se puede forzar con motivo)
  - sugiere a la persona según este orden: prioridad del rol → equipo del trabajo → mayor disponibilidad.
- **Vistas**: calendario personal (día/semana), vista de equipo y línea de tiempo (Gantt) por persona para el asistente de producción.

---

## 5. Producción: equipo, programación y contingencias

### 5.1 Equipo del trabajo
Cuando el prospecto se convierte en cliente (el **trabajo**, que puede tener 1 o más integrantes), el asistente de producción arma el **equipo**:
| Función en el trabajo | Cantidad | Qué hace |
|---|---|---|
| **Auxiliar principal** | 1 | Responsable del trabajo; por defecto recibe las tareas "al responsable del trabajo" |
| **Auxiliar de apoyo** | 0 o más | Realiza parte de las tareas (p. ej., un capítulo o el procesamiento estadístico) |
| **Jefe de producción responsable** | 1 | Revisa los entregables de ese trabajo y cubre como respaldo |

- El equipo puede cambiar durante el trabajo. Cada alta, baja o cambio queda en el **historial** (quién, cuándo y por qué).
- Si se asigna una tarea a alguien de fuera del equipo, el sistema lo agrega como **apoyo**.

### 5.2 Días no laborables (bloqueo total)
| Tipo | Cómo se registra | Alcance |
|---|---|---|
| **Feriado** | Calendario anual que carga el administrador (nacionales y de la empresa; día completo o medio día) | Todos los usuarios |
| **Cumpleaños** | Automático, a partir de la **fecha de nacimiento** del usuario | Día libre del usuario. Si cae en un día que no trabaja (domingo o feriado), **no se compensa** |
| **Vacaciones** | El usuario las solicita y las **aprueba el administrador** | Rango de días |
| **Permiso** | El usuario lo solicita y lo **aprueba el administrador**; **día completo o por horas** | Rango de días u horas |
| **Descanso médico / enfermedad** | Lo registra el asistente de producción o el administrador (suele ser imprevisto) | Rango de días |

- En esos días u horas el sistema **no permite** programar tareas a esa persona. No es solo una advertencia.
- Si se registra un día no laborable **encima de tareas ya programadas**, se activa el proceso de reasignación (5.4).

### 5.3 Programación secuencial (cola de trabajo por persona)
El asistente de producción programa las actividades de los auxiliares y las reuniones:
- **Reuniones (hora fija):** ocupan un bloque exacto y **no se mueven** solas. Son "anclas" en la agenda.
- **Tareas flexibles (producción, corrección...):** entran en la **cola de trabajo** de la persona, en un orden. El sistema las acomoda **una tras otra** en el tiempo libre (horario − días no laborables − reuniones) y calcula su **inicio y fin planificados**. Una tarea larga puede ocupar varios días.
- **Holgura** de cada tarea = fecha límite del entregable − fin planificado.
  - verde: holgura cómoda · ámbar: holgura justa · rojo: **no llega** a la fecha límite
- El orden de la cola se cambia arrastrando, y el sistema sugiere un orden por **prioridad del trabajo** y **fecha de entrega**.
- La programación se **recalcula** sola cuando algo cambia (nueva tarea, ausencia, inserción urgente, una tarea que termina antes o después). Si cambian sus fechas, se notifica al auxiliar.

**Orden de búsqueda de responsable** cuando se programa una tarea:
1. Auxiliares del equipo del trabajo con disponibilidad
2. Otros auxiliares con disponibilidad (y afinidad con el tema, si la hay)
3. **Jefes de producción** (prioridad secundaria)
4. **Horas extras o bono** (5.6)

### 5.4 Reasignación por ausencia imprevista (p. ej., enfermedad)
Cuando se registra una ausencia sobre días que ya tienen tareas programadas:
1. El sistema lista las **tareas afectadas**, ordenadas por **prioridad del trabajo** y **fecha de entrega** (primero las de menor holgura).
2. Para cada una, sugiere una acción:
   - **Posponer:** si la holgura alcanza para esperar a que vuelva, la tarea se queda con él y se reprograma después de su regreso.
   - **Reasignar:** si no alcanza, propone a otra persona según el orden de búsqueda de 5.3 y muestra cómo queda su cola.
   - **Reunión con el cliente:** reasignar a otra persona o reprogramarla coordinando con el cliente.
3. El asistente de producción confirma tarea por tarea o todas de una vez, después de ver el **impacto**.
4. Todo queda en el historial con su motivo y se notifica a los involucrados.

### 5.5 Trabajo urgente (entrada prioritaria a producción)
Un trabajo con prioridad **Urgente** puede **pasar adelante** en la cola de uno o más auxiliares.

**Quién decide:** el **asistente administrativo** autoriza la urgencia, porque es quien tiene el contacto con el cliente y negocia el plazo. Al marcar el trabajo como urgente, se genera una **solicitud de inserción urgente** que llega al asistente de producción, quien la ejecuta:
1. Se elige al auxiliar (o a varios, para repartir el trabajo) y la posición en la cola (normalmente, la primera).
2. La tarea que el auxiliar está haciendo se **pausa** (su tiempo registrado se conserva) y vuelve a la cola.
3. **Simulación de impacto antes de confirmar:** el sistema muestra cómo se corren **en cascada** todas las tareas siguientes, sus nuevas fechas y cuáles pasarían a **rojo** (no llegan a su entrega).
4. Para cada tarea en rojo se puede: aceptar el retraso (y avisar al cliente), pasarla a otro auxiliar o cubrirla con horas extras o bono.
5. Al confirmar, se reprograma todo y se notifica a los auxiliares afectados (y al asistente administrativo si cambia alguna entrega al cliente).

### 5.6 Horas extras y bonos
Si no hay nadie con capacidad para cumplir una fecha:
| Modalidad | Cómo funciona |
|---|---|
| **Horas extras** | La tarea se programa **fuera del horario normal** (después de hora o en fin de semana). Esto abre capacidad extra para ese día. Se registran las horas planificadas y las reales (con el cronómetro). |
| **Bono** | Se ofrece un **monto libre** (lo define quien lo propone) por una tarea, un entregable o un trabajo completo, que la persona realiza fuera de su capacidad normal. Se paga cuando el entregable es aprobado. |

- **Flujo:** el asistente de producción lo propone → la persona **acepta o rechaza** → lo aprueba el jefe de producción o el administrador → se realiza → queda en el reporte.
- Se pueden programar en **feriados y cumpleaños** solo si la persona acepta. **Nunca** en vacaciones, permisos ni descanso médico.
- **Tope de horas extras (configurable):** máximo por semana y por mes, global con posibilidad de excepción por usuario. Si se deja vacío, no hay tope. Al superarlo, el sistema lo advierte.
- **Reporte** de horas extras y bonos por persona y por periodo, para planillas. El pago en sí queda fuera del sistema.

---

## 6. Seguridad: módulos, acciones y permisos

Los permisos **no están fijos en el código**: el administrador los configura desde el sistema.

### 6.1 Conceptos
| Concepto | Qué es | Ejemplo |
|---|---|---|
| **Módulo** | Una sección del sistema. Puede tener submódulos y forma el **menú** | Prospectos, Tareas, Producción, Contratos y pagos, Usuarios, Catálogos, Reportes |
| **Acción** | Lo que se puede hacer dentro de un módulo. **Cada módulo tiene sus propias acciones** | Ver, Crear, Editar, Eliminar, Imprimir, Exportar + acciones propias del módulo |
| **Permiso** | Módulo + acción (+ alcance) | `prospectos.editar`, `produccion.insertar_urgente` |
| **Rol** | Conjunto de permisos. Los roles también son **configurables** | Asistente administrativo, Auxiliar de producción... |
| **Usuario** | Recibe los permisos de sus roles **más o menos** sus excepciones personales | |

### 6.2 Acciones por módulo (ejemplos)
| Módulo | Acciones comunes | Acciones propias |
|---|---|---|
| Prospectos | ver, crear, editar, eliminar, imprimir, exportar | convertir a cliente, reasignar responsable, marcar perdido, reactivar |
| Tareas | ver, crear, editar, eliminar | asignar, reprogramar, forzar agenda, registrar tiempo manual |
| Producción | ver, editar | armar equipo, programar cola, reasignar por ausencia, insertar urgente, proponer horas extras o bono |
| Entregables | ver, crear, editar | enviar a revisión, aprobar, observar, registrar entrega al cliente |
| Contratos y pagos | ver, crear, editar, anular, imprimir | registrar pago, ver montos |
| Ausencias | ver, crear | solicitar, aprobar, rechazar |
| Horas extras y bonos | ver | aprobar, liquidar |
| Usuarios, Roles y permisos | ver, crear, editar, desactivar | asignar roles, asignar permisos, restablecer contraseña |
| Catálogos y parámetros | ver, crear, editar, desactivar | — |
| Reportes | ver, exportar, imprimir | — |

### 6.3 Permisos por rol y por usuario
- **Por rol:** una matriz de módulos × acciones con casillas. Todos los usuarios con ese rol las heredan.
- **Por usuario:** excepciones sobre lo que heredó de sus roles:
  - **Conceder:** le da un permiso que su rol no tiene (p. ej., una asistente que también puede aprobar ausencias).
  - **Denegar:** le quita un permiso que su rol sí tiene. La denegación **gana** sobre lo concedido.
- **Permiso efectivo** = (unión de los permisos de sus roles + concedidos) − denegados.
- La pantalla del usuario muestra el **permiso efectivo** y de dónde viene cada uno (rol o excepción).

### 6.4 Alcance de los datos
Algunas acciones necesitan además indicar **sobre qué registros** aplican:
| Alcance | Significado | Ejemplo |
|---|---|---|
| **Propios** | Solo los registros de los que es responsable | Asistente administrativo: sus prospectos |
| **Equipo** | Los de los trabajos donde participa | Auxiliar: tareas y entregables de sus trabajos |
| **Todos** | Todo el sistema | Administrador, asistente de producción |

Con esto, la regla "cada asistente administrativo ve solo sus prospectos" es un permiso `prospectos.ver` con alcance **Propios**, y se puede cambiar sin tocar el código.

### 6.5 ¿Se pueden agregar módulos y acciones?
- **Desde el sistema (sin programar):** crear y editar **roles**, asignar permisos por rol y por usuario, **reordenar el menú**, cambiar nombres e íconos, y activar o desactivar módulos.
- **Módulos y acciones nuevos:** cuando se programa una funcionalidad nueva, esta **se registra sola** en el catálogo de módulos y acciones al desplegarse. Luego el administrador solo marca qué roles o usuarios la usan. Una acción sin código detrás (p. ej., un "imprimir" que no existe) no haría nada, por eso el catálogo lo alimenta el propio sistema.
- **Roles del sistema** (Administrador y los 5 roles base) no se pueden eliminar. El Administrador siempre tiene todos los permisos, para evitar quedarse sin acceso.

### 6.6 Cómo se aplica
- **Backend:** cada endpoint declara el permiso que exige (`@RequierePermiso('prospectos.editar')`) y filtra los datos según el alcance. Es la **validación real**.
- **Frontend:** oculta los menús y botones para los que no hay permiso (solo es comodidad visual).
- Si se cambian los permisos de un usuario conectado, se le actualizan **al instante** por WebSocket.
- Cada cambio de permisos queda en la **auditoría** (quién cambió qué y cuándo).

---

## 7. Funcionalidades complementarias

> Cada punto indica si entra en el **MVP** o **después** (ver fases en la sección 12).

### 7.1 Comercial
| Funcionalidad | Descripción | Alcance |
|---|---|---|
| **Tarifario** | Precio base por tipo de trabajo y nivel académico (con vigencia). Sirve de referencia al cotizar | MVP |
| **Cotizador** | Genera la cotización (ítems, total, forma de pago sugerida, validez) en **PDF** desde una plantilla, la registra en el prospecto y lo mueve a la etapa "Cotizado". Se puede enviar por WhatsApp | MVP |
| **Referidos** | Campo "referido por" (cliente existente) en el prospecto. Permite descuentos o comisiones y medir cuánto vende el boca a boca | MVP |
| **Importación masiva** | Carga de prospectos desde Excel, con validación y detección de duplicados | Después |
| **Campañas** | Ligar prospectos a una campaña (origen, inversión, fechas) para medir el costo por prospecto y por venta | Después |

### 7.2 Contratos y pagos
| Funcionalidad | Descripción | Alcance |
|---|---|---|
| **Contrato en PDF** | Se genera desde una plantilla con los datos del trabajo, los integrantes, el monto y las cuotas. Luego se **sube el contrato firmado** (escaneado o foto) | MVP |
| **Voucher y recibo** | Cada pago admite el **voucher adjunto** (Yape, Plin, transferencia) y genera un **recibo interno en PDF** numerado | MVP |
| **Estado de cuenta** | Por trabajo y por cliente: total, pagado, pendiente, vencido y días de mora. Imprimible | MVP |
| **Candado de entrega por deuda** | Regla configurable: si hay una cuota **vencida sin pagar**, al registrar la entrega de un avance el sistema **advierte** o **bloquea** (según el parámetro). Se puede liberar con un permiso especial y un motivo | MVP |
| **Adicionales** | Trabajos fuera de lo acordado (otro capítulo, cambio de tema o de asesor, encuestas extra...). Se registran con descripción y monto, el cliente los acepta y generan sus propias cuotas | MVP |
| **Garantía post-entrega** | Cada contrato tiene un periodo de garantía (días, configurable por tipo de trabajo). Las correcciones del asesor o del jurado dentro de ese periodo **no se cobran**; fuera de él, se cotizan como adicional | MVP |
| **Descuentos, reembolsos y anulaciones** | Con motivo y aprobación, y reflejados en el estado de cuenta | Después |

### 7.3 Producción y calidad
| Funcionalidad | Descripción | Alcance |
|---|---|---|
| **Plantillas por tipo de trabajo** | Cada tipo (y opcionalmente cada nivel) tiene una plantilla de **entregables** (p. ej., Tesis: Plan, Cap. I, II, III, IV, V, Final) y de **tareas** por entregable (actividad, tiempo estimado, orden). Al crear el trabajo, se generan solas y el asistente de producción las ajusta y las programa | MVP |
| **Especialidades del auxiliar** | Área (salud, derecho, ingeniería, educación...), enfoque (cuantitativo, cualitativo, mixto), software (SPSS, R, Atlas.ti...) con nivel de dominio. El sistema sugiere a los auxiliares con **afinidad** al trabajo | MVP |
| **Checklist de revisión** | Lista de verificación por tipo de trabajo que el jefe completa en cada revisión (formato de la universidad, normas APA o Vancouver, coherencia, citas, redacción). Los ítems no cumplidos se vuelven observaciones | MVP |
| **Similitud e IA** | En cada entregable se registra el **% de similitud** (Turnitin) y el **% de detección de IA**, con la fecha y el reporte adjunto. El máximo permitido se configura por universidad (o un valor general). Si se supera, **no se puede aprobar** | MVP |
| **Versiones del entregable** | V1, V2, V3..., con qué cambió, por qué (observación interna o del cliente) y el archivo de cada versión | Después |
| **Sustentación** | Seguimiento después de la entrega final: fecha de sustentación, tareas de preparación y resultado | Después |
| **Biblioteca de formatos** | Reglamentos, esquemas y formatos por universidad y carrera, reutilizables por todo el equipo | Después |

### 7.4 Comunicación interna
| Funcionalidad | Descripción | Alcance |
|---|---|---|
| **Comentarios con @menciones** | Hilo de comentarios internos en cada prospecto, trabajo, entregable y tarea. Mencionar a alguien le envía una notificación | MVP |
| **Plantillas de WhatsApp** | Mensajes estándar con variables (`{nombre}`, `{fecha}`, `{entregable}`, `{monto}`): confirmación de reunión, entrega, recordatorio de pago, cotización | MVP |
| **Google Calendar y Meet** | Al programar una reunión virtual, se crea el enlace de Meet y aparece en el calendario del responsable | Después |

### 7.5 Indicadores para la gerencia
| Indicador | Cómo se calcula |
|---|---|
| **Rentabilidad por trabajo** | Monto del contrato (+ adicionales) − (horas reales × **costo por hora** de cada persona) − horas extras y bonos. Se agrupa por tipo de trabajo, nivel y universidad |
| **Puntualidad** | % de entregables entregados a tiempo, por auxiliar, tipo de trabajo y periodo |
| **Retrabajo** | N.º de observaciones (internas y del cliente) por entregable, por auxiliar |
| **Conversión** | Prospectos → clientes, por origen, por asistente administrativo y por etapa del embudo |
| **Tiempos** | Estimado frente al real por actividad y por plantilla, para ajustar el tarifario y las plantillas |
| **Ocupación** | % de capacidad usada por persona, horas extras y bonos por periodo |
| **Cobranza** | Monto por cobrar, vencido y morosidad por antigüedad |

> El **costo por hora** de cada persona es un dato **confidencial** (permiso especial). Tiene vigencia, para que los cambios no alteren los cálculos pasados.

### 7.6 Técnico y seguridad
| Funcionalidad | Descripción | Alcance |
|---|---|---|
| **Responsive / uso en celular** | Todas las pantallas se adaptan al celular. Es clave para que los auxiliares marquen el tiempo y vean sus tareas | MVP |
| **Búsqueda global** | Una barra que busca por celular, nombre, documento, título del trabajo o código | MVP |
| **Exportar e imprimir** | Todos los listados se exportan a **Excel** y **PDF**, según el permiso | MVP |
| **Adjuntos** | Almacenamiento de archivos (vouchers, contratos firmados, reportes de similitud) con control de acceso | MVP |
| **Auditoría completa** | Quién creó, cambió o eliminó qué y cuándo, con los valores de antes y después. Consultable por el administrador | MVP |
| **Copias de seguridad** | Respaldo automático diario de la base de datos y los archivos, con retención (p. ej., 30 días) y prueba de restauración | MVP |
| **Seguridad de acceso** | Política de contraseñas, bloqueo tras N intentos fallidos, cierre de sesión por inactividad, historial de accesos | MVP |
| **Protección de datos personales** | Registro del consentimiento del cliente, acceso restringido a documentos y celulares según el permiso, **confidencialidad** de los trabajos (solo el equipo los ve) y opción de anonimizar datos a pedido | MVP |
| **Eliminación lógica** | Nada se borra físicamente: se marca como eliminado (recuperable por el administrador) | MVP |
| **Verificación en dos pasos (2FA)** | Código adicional al iniciar sesión | Después |
| **Varias sedes o empresas** | Separar los datos por sede | Después |

---

## 8. Estados

**Prospecto (etapas del embudo, configurables):** base inicial `nuevo` → `contactado` → `enfoque_agendado` → `enfoque_realizado` → `cotizado` → `negociacion` → `convertido` (ganada) | `perdido` (perdida) *(un prospecto perdido se puede reactivar)*

**Tarea:** `por_asignar` → `pendiente` → `en_proceso` → `completada` | `reprogramada` | `cancelada` | `no_asistio`

**Trabajo:** `sin_asignar` → `asignado` → `en_proceso` → `finalizado` | `suspendido` | `cancelado`

**Entregable:**
`pendiente` → `en_proceso` → `en_revision` → (`observado_interno` → `en_proceso`) → `aprobado` → `entregado_cliente` → (`observado_cliente` → `en_proceso`) → `cerrado`

**Cuota:** `pendiente` → `pagada` | `parcial` | `vencida`

---

## 9. Modelo de datos (borrador)

### Usuarios y agenda
| Entidad | Campos principales |
|---|---|
| **Usuario** | nombre, email, teléfono, **fecha de nacimiento** (cumpleaños = día libre), contraseña (hash), activo, especialidades/temas |
| **Rol** | código, nombre, descripción, es_sistema (no se puede eliminar), activo. Base: `ADMIN`, `ASIST_ADM`, `AUXILIAR`, `ASIST_PROD`, `JEFE_PROD` |
| **UsuarioRol** | usuario, rol |

### Seguridad y permisos
| Entidad | Campos principales |
|---|---|
| **Modulo** | código, nombre, módulo padre (submódulos), ruta, ícono, orden en el menú, activo |
| **Accion** | módulo, código (ver, crear, editar, eliminar, imprimir, exportar, convertir...), nombre, usa alcance (sí/no) |
| **RolPermiso** | rol, acción, alcance (propios / equipo / todos) |
| **UsuarioPermiso** | usuario, acción, tipo (conceder / denegar), alcance, motivo, otorgado_por, fecha |
| **PlantillaHorario** | nombre (p. ej., "Horario estándar"), activa |
| **PlantillaHorarioTramo** | plantilla, día de la semana, hora de inicio, hora de fin (varios tramos por día) |
| **HorarioUsuario** | usuario, plantilla de origen (opcional), vigente desde, vigente hasta |
| **HorarioUsuarioTramo** | horario, día de la semana, hora de inicio, hora de fin (varios tramos por día) |
| **Ausencia** | usuario, tipo (vacaciones, permiso, descanso médico, otro), desde, hasta (fecha y hora, para permisos por horas), motivo, estado (solicitada/aprobada/rechazada), solicitada_por, aprobada_por, sustento (opcional) |
| **Feriado** | fecha, nombre, alcance (nacional/empresa), día completo o medio día |

### Catálogos (configurables)
| Entidad | Campos principales |
|---|---|
| **TipoTrabajo** | nombre (Tesis, Artículo, Monografía, Plan de tesis...), máx. integrantes, activo |
| **PrioridadTrabajo** | nombre (Urgente, Alta, Media, Baja), nivel, color, permite inserción urgente (sí/no), activo |
| **Universidad** | nombre, siglas, activo |
| **Carrera** | nombre, activo |
| **NivelAcademico** | nombre (Pregrado, Maestría, Doctorado, Segunda especialidad...), activo |
| **OrigenContacto** | nombre (Facebook, Instagram, TikTok, WhatsApp, Referido, Web, Otro...), activo |
| **EtapaProspecto** | nombre, orden, color, clase (abierta/ganada/perdida), evento automático (opcional: actividad + momento: al programar / al completar), activa |
| **Parametro** | clave, valor (p. ej., intentos sin respuesta = 3, días de alerta, minutos de recordatorio, tope de horas extras por semana/mes) |
| **TopeHorasExtraUsuario** | usuario, tope semanal, tope mensual (excepción al tope global; vacío = sin tope) |
| **ResultadoContacto** | nombre (Contestó, No contestó, Interesado, Pidió cotización...), cuenta como "sin respuesta" (sí/no), activo |
| **MotivoPerdida** | nombre (Precio, Eligió a otro, No responde...), activo |
| **TipoActividad** | nombre (Reunión, Producción...), comportamiento base, color (para el calendario), activo |
| **Actividad** | nombre, tipo de actividad, tiempo estimado (min), aplica a (prospecto/cliente/ambos), requiere hora fija, modo de asignación, rol coordinador, es de seguimiento, activa |
| **PrioridadRol** | nombre (Principal, Secundaria, Respaldo), nivel (1, 2, 3), color, activo |
| **ActividadParticipacion** | actividad, nombre (p. ej., "Quien da el enfoque"), cantidad, obligatoria |
| **ActividadParticipacionRol** | participación, rol permitido, prioridad del rol |

### Prospectos, clientes y trabajos
| Entidad | Campos principales |
|---|---|
| **Persona** | **celular/WhatsApp (único, obligatorio)**, nombres, apellidos, email, tipo de documento, n.º de documento (único por tipo) |
| **Prospecto** | tipo de trabajo, título, prioridad del trabajo, universidad, carrera, nivel académico, fecha de entrega tentativa, origen del contacto, link del Drive, observaciones, detalles, etapa (EtapaProspecto), temperatura, monto cotizado, fecha de cotización, motivo de pérdida, intentos sin respuesta, captado_por (usuario), responsable de seguimiento (usuario), fecha de registro, trabajo generado (al convertir) |
| **ProspectoEvento** | prospecto, tipo (cambio de etapa, nota, contacto, reasignación...), detalle, usuario, fecha. Alimenta la línea de tiempo |
| **ProspectoContacto** | prospecto, persona, es_principal |
| **Trabajo** | prospecto de origen, tipo de trabajo, título, prioridad del trabajo, universidad, carrera, nivel académico, link del Drive, observaciones, detalles, fecha de inicio, fecha límite final, estado |
| **TrabajoEquipo** | trabajo, usuario, función (auxiliar principal / auxiliar de apoyo / jefe responsable), desde, hasta, activo |
| **TrabajoIntegrante** | trabajo, persona, es_titular (contacto principal y firmante del contrato) |
| **HistorialAsignacion** | trabajo o tarea, usuario anterior, usuario nuevo, función, tipo (asignación, reasignación por ausencia, inserción urgente, cambio de equipo), asignado_por, fecha, motivo |
| **Contrato** | trabajo, fecha de firma, monto total, moneda, forma de pago (contado/cuotas), observaciones |
| **Cuota** | contrato, número, monto, fecha de vencimiento, estado |
| **Pago** | contrato, cuota (opcional), monto, fecha, método (efectivo, transferencia, Yape/Plin...), registrado_por, n.º de operación |
| **Entregable** | trabajo, nombre (Capítulo I, Avance 1, Final...), orden, es_final, fecha límite, estado |
| **Revision** | entregable, tarea, revisor (jefe), resultado (aprobado/observado), comentarios, fecha |
| **EntregaCliente** | entregable, tarea, fecha de envío, enviado_por, canal (WhatsApp), respuesta del cliente/observaciones |
| **EntregaDestinatario** | entrega, persona (integrante), enviado (sí/no), fecha |

### Tareas y tiempos
| Entidad | Campos principales |
|---|---|
| **Tarea** | actividad, prospecto o trabajo, entregable (opcional), fecha/hora de inicio o día planificado, duración estimada (min), modalidad, estado, resultado del contacto (si es de seguimiento), resultado/observaciones, creada_por |
| **TareaResponsable** | tarea, usuario, participación, rol con el que participa, prioridad del rol (copiada al asignar), **orden en la cola**, inicio y fin planificados (calculados), holgura, modalidad (normal / horas extras / bono), asignado_por, forzado (sí/no) + motivo si se ignoró un choque de agenda o la prioridad |
| **HoraExtraBono** | tarea o entregable o trabajo, usuario, modalidad (horas extras / bono), horas planificadas, horas reales, monto del bono, estado (propuesta → aceptada/rechazada → aprobada → realizada → liquidada), propuesta_por, aprobada_por, fechas |
| **ReprogramacionLote** | tipo (ausencia, inserción urgente, manual), motivo, realizada_por, fecha, detalle del impacto (tareas movidas, fechas antes/después) |
| **TareaPersona** | tarea, persona (contactos o integrantes que asisten) |
| **RegistroTiempo** | tarea, usuario, inicio, fin, minutos, es_manual, nota |

### Transversales
| Entidad | Campos principales |
|---|---|
| **Notificacion** | usuario destino, tipo, mensaje, referencia (entidad + id), leída, fecha |
| **Auditoria** | usuario, acción, entidad, id, fecha, IP, valores antes, valores después |
| **Archivo** | entidad + id (a qué pertenece), categoría (voucher, contrato firmado, reporte de similitud...), nombre, tipo MIME, tamaño, ruta de almacenamiento, subido_por, fecha |
| **Comentario** | entidad + id (prospecto, trabajo, entregable, tarea), autor, texto, menciones (usuarios), editado, fecha |
| **AccesoLog** | usuario, fecha, IP, dispositivo, resultado (éxito / fallo / bloqueado) |

### Complementarios (sección 7)
| Entidad | Campos principales |
|---|---|
| **Tarifa** | tipo de trabajo, nivel académico, precio base, moneda, vigente desde / hasta |
| **Cotizacion** | prospecto, número, fecha, validez (días), total, forma de pago sugerida, observaciones, estado (borrador / enviada / aceptada / rechazada / vencida), PDF generado |
| **CotizacionItem** | cotización, descripción, cantidad, precio, subtotal |
| **PlantillaTrabajo** | tipo de trabajo, nivel académico (opcional), nombre, activa |
| **PlantillaEntregable** | plantilla, nombre, orden, es_final, % del plazo total (para calcular su fecha límite) |
| **PlantillaTarea** | plantilla de entregable, actividad, tiempo estimado (min), orden |
| **Especialidad** | tipo (área / enfoque / software), nombre, activa |
| **UsuarioEspecialidad** | usuario, especialidad, nivel de dominio (básico / intermedio / avanzado) |
| **TrabajoEspecialidad** | trabajo, especialidad requerida (para sugerir auxiliares con afinidad) |
| **ChecklistItem** | tipo de trabajo, descripción, orden, obligatorio, activo |
| **RevisionChecklist** | revisión, ítem, cumple (sí / no / no aplica), comentario |
| **PlantillaDocumento** | tipo (cotización, contrato, recibo, estado de cuenta), nombre, contenido con variables, activa |
| **PlantillaMensaje** | uso (confirmación de reunión, entrega, recordatorio de pago, cotización...), texto con variables, activa |
| **Adicional** | trabajo, descripción, monto, estado (propuesto / aceptado / rechazado), registrado_por, fecha, cuotas generadas |
| **UsuarioCostoHora** | usuario, costo por hora, vigente desde / hasta *(confidencial)* |
| **Consentimiento** | persona, tipo (tratamiento de datos), fecha, medio, evidencia (archivo) |

**Campos que se agregan a entidades existentes**
- **Prospecto:** referido_por (persona / trabajo).
- **Universidad:** % máximo de similitud, % máximo de IA (si están vacíos, se usa el valor general de Parámetros).
- **TipoTrabajo:** días de garantía post-entrega.
- **Contrato:** fecha de fin de garantía, contrato firmado (archivo).
- **Pago:** voucher (archivo), número de recibo.
- **Entregable:** % de similitud, % de IA, fecha de medición, reporte (archivo), es corrección en garantía (sí/no).
- **Todas las entidades principales:** creado_por, actualizado_por, fechas, eliminado (eliminación lógica).
- **Parámetros nuevos:** candado de entrega por deuda (desactivado / advertir / bloquear), % máximo general de similitud e IA, intentos fallidos antes del bloqueo, minutos de inactividad para cerrar sesión.

**Relaciones clave**
- Un **Prospecto** tiene uno o más **contactos** (Personas) y muchas **Tareas**. Al convertirse, genera un **Trabajo**.
- Una **Persona** puede estar en varios prospectos y trabajos.
- Un **Trabajo** tiene 1 o más integrantes (por ejemplo, una tesis en pareja), además de un **Contrato**, muchos **Entregables**, muchas **Tareas**, su **equipo** (1+ auxiliares y 1 jefe responsable) y su **HistorialAsignacion**.
- Cada **Contrato** tiene muchas **Cuotas** y **Pagos**.
- Una **Tarea** es una instancia de una **Actividad**, con uno o más **responsables** y sus **registros de tiempo**.

**Datos exigidos según la etapa**
| Etapa | Obligatorio |
|---|---|
| Registrar un prospecto | Al menos **1 contacto con celular**; tipo de trabajo, prioridad, origen del contacto. La primera actividad es **opcional** (si se agrega y es reunión: **día, hora** y modalidad). |
| Tareas con el prospecto (enfoque, seguimiento) | Se pueden completar datos durante o después. |
| Convertir en cliente (crear el trabajo) | Cada integrante: **celular**, **nombres y apellidos** y **email**. Al menos **un integrante** con **documento de identidad** (DNI, CE o pasaporte). |

**Reglas de integrantes**
- La validación completa se hace al convertir. Si faltan datos, el sistema indica cuáles y no permite crear el trabajo.
- Exactamente un integrante es **titular** (contacto principal y firmante del contrato).
- Máximo de integrantes por trabajo: configurable por tipo de trabajo (p. ej., Tesis = 2, Artículo = N).
- Al registrar a una persona, se busca primero por celular (y por documento o email si los hay) para no duplicarla. Si ya existe, se reutiliza.

---

## 10. Notificaciones (internas, en tiempo real)

Las notificaciones se guardan en la base de datos (campanita con "no leídas") y además se envían en vivo por WebSocket si el usuario está conectado.

| Evento | Destinatario |
|---|---|
| Nuevo prospecto con una tarea por asignar (p. ej., solicitud de enfoque) | Coordinador de la actividad (asistente de producción) |
| Seguimientos del día / seguimiento vencido / prospecto sin próximo seguimiento | Responsable de seguimiento (asistente administrativo) |
| Se completó el enfoque de su prospecto | Responsable de seguimiento |
| Se le asigna o reasigna un prospecto | Nuevo responsable de seguimiento |
| Se le asigna, reprograma o cancela una tarea | Responsables de la tarea (y quien registró el prospecto) |
| Una tarea con hora fija empieza en X minutos | Responsables de la tarea |
| Una tarea venció sin completarse | Responsables, asistente de producción |
| Una tarea sigue sin asignar cerca de su hora | Asistente de producción |
| Nuevo cliente con trabajo sin asignar | Asistente de producción |
| Se le agrega o quita de un equipo de trabajo | Usuario afectado |
| Sus tareas cambian de fecha por una reprogramación | Auxiliar afectado |
| Se registra una ausencia que afecta tareas programadas | Asistente de producción |
| Una tarea pasa a rojo (no llega a la fecha de entrega) | Asistente de producción, jefe responsable |
| Solicitud de inserción urgente (del asistente administrativo) | Asistente de producción |
| Se inserta un trabajo urgente en su cola | Auxiliar afectado, jefe responsable |
| Propuesta de horas extras o bono | Usuario propuesto (acepta/rechaza); luego el aprobador |
| Solicitud de vacaciones o permiso | Aprobador (administrador / asistente de producción) |
| Un entregable pasa a revisión | Jefe de producción |
| Un entregable es observado o aprobado | Auxiliar, asistente de producción |
| Un entregable aprobado está listo para enviar | Asistente administrativo |
| El cliente dejó observaciones | Auxiliar, asistente de producción |
| El entregable vence en ≤ N días o ya venció | Auxiliar, asistente de producción |
| La cuota vence en ≤ N días o ya venció | Asistente administrativo |
| Un usuario queda sobrecargado en un día | Asistente de producción |
| Lo mencionan en un comentario (@) | Usuario mencionado |
| Una cotización está por vencer sin respuesta | Responsable de seguimiento |
| Se intentó entregar con deuda vencida (candado) | Asistente administrativo, administrador |
| Un entregable supera el límite de similitud o IA | Auxiliar, jefe responsable |
| El cliente aceptó un adicional | Asistente de producción, jefe responsable |
| Termina el periodo de garantía de un trabajo | Asistente administrativo, jefe responsable |

**WhatsApp al cliente:** lo envía manualmente el personal desde su celular. El sistema **no** envía mensajes automáticos. Los mensajes van a **todos los integrantes** del trabajo. El sistema:
- muestra un botón "Abrir WhatsApp" por cada integrante (`wa.me/<número>?text=<plantilla>`), con el mensaje ya escrito *(opcional)*
- registra a qué integrantes se envió (fecha, quién lo envió y qué entregable) y avisa si falta alguno.

---

## 11. Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + **NestJS** |
| Tiempo real | **Socket.IO** (gateway de NestJS), con salas por usuario y por rol |
| Tareas programadas | `@nestjs/schedule` (vencimientos, recordatorios de tareas) |
| Base de datos | **PostgreSQL 16** + **Prisma** (ORM y Prisma Migrate con SQL revisable; modelo en `docs/modelo-datos.md`) |
| Autenticación y permisos | JWT (access + refresh) + guard de permisos por módulo/acción y filtro por alcance (CASL o propio) |
| Frontend | **React + Vite + TypeScript** (SPA), **Tailwind CSS v4 + shadcn/ui** (Radix), lucide-react, sonner (avisos) |
| Rutas y datos | **TanStack Router** (rutas tipadas, filtros en la URL), **TanStack Query** (caché y sincronización), Zustand (sesión y estado de UI) |
| Formularios y tablas | React Hook Form + **Zod** (esquemas compartidos con el backend), **TanStack Table** (listados con filtros, orden, paginación y columnas configurables) |
| Interacción | dnd-kit (kanban del embudo y orden de la cola), cmdk (búsqueda global con Ctrl+K), Tiptap (comentarios con @menciones), shadcn Charts / Recharts (tableros) |
| Calendario y Gantt | **FullCalendar** (versión libre: calendario personal día/semana/mes) + **vista de equipo y cola de trabajo propias** (línea de tiempo por persona hecha a medida, sin licencias de pago) |
| Documentos | Generación de **PDF** desde plantillas HTML (Puppeteer o Gotenberg); exportación a **Excel** (ExcelJS) |
| Archivos | Almacenamiento compatible con S3 (**MinIO** en el propio servidor, o un servicio en la nube) |
| Búsqueda | Búsqueda de texto completo de PostgreSQL (con `unaccent` y trigramas para tolerar errores de tipeo) |
| Infraestructura | Docker / docker-compose (api, web, db, minio), respaldos automáticos programados |
| Estructura | Monorepo: `apps/api`, `apps/web`, `packages/shared` (esquemas Zod, tipos, códigos de permisos) con pnpm workspaces |

---

## 12. Fases de desarrollo

### Fase 0 — Base del proyecto
- Monorepo, Docker (PostgreSQL, MinIO), NestJS y React iniciados
- Prisma con el esquema inicial y datos semilla (roles, admin, catálogos base, actividad "Enfoque")
- Login, JWT, política de contraseñas, bloqueo por intentos, cierre por inactividad, historial de accesos
- Módulos, acciones y permisos: registro automático del catálogo, guard `@RequierePermiso`, alcance de datos, menú dinámico
- Infraestructura transversal: auditoría, eliminación lógica, adjuntos, generación de PDF, exportación a Excel
- Diseño responsive base y respaldos automáticos diarios

### Fase 1 — Usuarios, catálogos y agenda
- Gestión de usuarios (con fecha de nacimiento, especialidades y costo por hora) y horarios por tramos (plantillas y vigencia)
- Gestión de roles, matriz de permisos por rol, excepciones por usuario (conceder/denegar) y vista del permiso efectivo
- Feriados, solicitudes y aprobación de vacaciones y permisos, registro de descansos médicos
- Catálogos: tipos de trabajo (con días de garantía), prioridades, universidades (con límites de similitud e IA), carreras, niveles académicos, orígenes de contacto, etapas del embudo, especialidades, parámetros
- Catálogo de actividades: tipo, tiempo estimado, a qué aplica, participaciones, roles y su prioridad, modo de asignación
- Plantillas por tipo de trabajo (entregables y tareas), checklist de revisión, tarifario
- Plantillas de documentos (cotización, contrato, recibo) y de mensajes de WhatsApp
- Cálculo de disponibilidad y capacidad por usuario

### Fase 2 — Prospectos y tareas
- Registro de prospectos: contactos (solo el celular obligatorio), datos del trabajo, referido por y primera actividad opcional
- Búsqueda de duplicados y **búsqueda global**
- Seguimiento: embudo configurable (kanban), próximo seguimiento obligatorio, bitácora y línea de tiempo, bandeja "Mis seguimientos", motivo de pérdida y reactivación
- **Cotizador** con PDF y envío por WhatsApp
- Modos de asignación de tareas y bandeja del coordinador (asistente de producción)
- Calendario personal, registro de tiempo (cronómetro o manual) y resultado de la tarea
- Comentarios con @menciones
- Conversión a cliente con validación de integrantes y registro del consentimiento de datos

### Fase 3 — Trabajos, contratos y pagos
- Crear el trabajo desde el prospecto convertido (un cliente puede tener varios; hasta N integrantes)
- Contrato en PDF, cuotas y carga del contrato firmado
- Pagos con voucher adjunto y recibo en PDF
- Estado de cuenta por trabajo y por cliente
- Adicionales (con sus cuotas) y periodo de garantía
- Candado de entrega por deuda (advertir o bloquear, configurable)

### Fase 4 — Producción y calidad
- Equipo del trabajo (auxiliares y jefe responsable) con historial, sugerencia por especialidad y afinidad
- Generación de entregables y tareas desde la plantilla del tipo de trabajo
- Programación secuencial: cola de trabajo por persona, cálculo de inicio/fin y holgura, línea de tiempo (Gantt)
- Reasignación por ausencia imprevista con sugerencias según fecha de entrega y prioridad
- Solicitud e inserción de trabajos urgentes con simulación de impacto y reprogramación en cascada
- Horas extras y bonos (propuesta, aceptación, aprobación, tope configurable y reporte)
- Bandejas: auxiliar (mis tareas, trabajos y entregables) y jefe de producción (entregables en revisión)
- Revisión con checklist y control de similitud e IA (bloquea la aprobación si se supera el límite)
- Registro de entrega a los integrantes (respetando el candado por deuda), observaciones del cliente y correcciones en garantía

### Fase 5 — Notificaciones y alertas
- Gateway de Socket.IO, notificaciones persistidas y campanita
- Cron: vencimientos de entregables, cuotas y tareas; recordatorios de reuniones; tareas sin asignar; seguimientos
- Botón de WhatsApp con plantillas de mensajes

### Fase 6 — Tableros e indicadores
- Dashboard por rol (pendientes, vencidos, próximos a vencer)
- Indicadores: rentabilidad por trabajo, puntualidad, retrabajo, conversión, tiempos estimado frente al real, ocupación, cobranza
- Todos los reportes exportables a Excel y PDF

### Posteriores (fuera del MVP)
- **Comercial:** importación masiva de prospectos desde Excel, campañas con costo por prospecto y por venta
- **Pagos:** descuentos, reembolsos y anulaciones con aprobación
- **Producción:** versiones del entregable, seguimiento de la sustentación, biblioteca de formatos por universidad
- **Integraciones:** Google Calendar y Meet, Google Drive, API de WhatsApp Business
- **Otros:** portal del cliente, comisiones del personal, verificación en dos pasos (2FA), varias sedes o empresas

---

## 13. Pendientes por definir
- [ ] ¿La modalidad de pago y las cuotas se definen libremente o hay planes predefinidos?
- [ ] Contenido de las plantillas base: entregables y tareas de una tesis, de un artículo, etc. (con sus tiempos estimados)
- [ ] ¿Las tareas de producción siempre se ligan a un entregable o pueden ser solo del trabajo? *(propuesta: entregable opcional)*
- [ ] Choque de agenda: ¿solo advertir o bloquear? *(propuesta: advertir y permitir forzar con motivo)*
- [ ] ¿La prioridad del rol también debe ordenar las tareas en la bandeja de cada usuario (las principales primero)?
- [ ] Días de anticipación para las alertas (N) y minutos antes para el recordatorio de reuniones
- [ ] ¿Quién puede ver montos y pagos? (¿el auxiliar no?) y ¿quién ve el costo por hora? *(propuesta: solo administrador)*
- [ ] Candado de entrega por deuda: ¿advertir o bloquear por defecto?
- [ ] Días de garantía por tipo de trabajo
- [ ] Límites generales de similitud e IA (p. ej., 20 % y 10 %)
- [ ] Formato de contrato, cotización y recibo actuales (para usarlos como plantilla)
- [ ] Moneda(s)
- [ ] Hosting definitivo
