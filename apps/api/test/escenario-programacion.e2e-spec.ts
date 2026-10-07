/**
 * Escenario completo de programación (base produccion_test): clientes registrados, un prospecto con su reunión, reprogramaciones,
 * traspaso de un bloque con lo ya avanzado, recomendaciones y una urgencia que entra a un auxiliar con actividades.
 * Todas las comprobaciones miran los horarios reales que arma el calendario: sin cruces, respetando reuniones y fechas.
 */
import {
  diaEnLima,
  sumarDias,
  type AgendaPersona,
  type ApoyoTarea,
  type CargaPersona,
  type CatalogoActividades,
  type CatalogosProspecto,
  type ColaPersona,
  type ImpactoCarga,
  type ImpactoUrgente,
  type ProspectoDetalle,
  type SolicitudUrgenteItem,
  type TrabajoDetalle,
} from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { datosAcademicos } from './datos-academicos.js';
import { proximoDiaHabil } from './dias.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'admin' | 'ana' | 'prod' | 'jefe' | 'aux1' | 'aux2' | 'aux3' | 'aux4';
const ROL: Record<Quien, string> = { admin: 'ADMIN', ana: 'ASIST_ADM', prod: 'ASIST_PROD', jefe: 'JEFE_PROD', aux1: 'AUXILIAR', aux2: 'AUXILIAR', aux3: 'AUXILIAR', aux4: 'AUXILIAR' };

interface Tramo {
  id: string;
  fecha: string;
  inicio: number;
  fin: number;
}

describe('Escenario completo de programación (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let D: string; // primer día hábil del escenario
  let cuerpo: Record<string, unknown>;
  let elaboracion: string;
  let enfoque: string;
  const trabajos: Record<string, TrabajoDetalle> = {};
  const creados: string[] = [];
  let reunionId: string;
  let unaSemana: Tramo[]; // el calendario de aux1 antes de la reunión

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });

  /** Registra un cliente que ya trabaja con nosotros y programa su primera actividad al auxiliar. */
  const registrar = (clave: string, n: number, opciones: { aux: Quien; minutos: number; hora?: string; modo?: 'secuencial' | 'fijo'; fecha?: string; limite?: string; faltante?: Record<string, unknown> }) => {
    const integrantes = [{ celular: celular(n), nombres: 'Cli', apellidos: `Esc${n}`, email: `esc.${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `${n}${sufijo}1`, esTitular: true }];
    const programacion = {
      actividadId: elaboracion,
      minutosEstimados: opciones.minutos,
      hora: opciones.hora ?? '08:00',
      auxiliarPrincipalId: ids[opciones.aux],
      jefeResponsableId: ids.jefe,
      modoInicio: opciones.modo ?? 'secuencial',
      ...(opciones.faltante && { faltante: opciones.faltante }),
    };
    return http()
      .post('/api/trabajos/cliente-directo')
      .set(como('prod'))
      .send({ ...cuerpo, integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: `Trabajo ${clave}`, fechaInicio: opciones.fecha ?? D, fechaLimite: opciones.limite ?? sumarDias(D, 30) }, programacion })
      .expect(201)
      .then((r) => {
        trabajos[clave] = r.body as TrabajoDetalle;
        creados.push(trabajos[clave].id);
        return trabajos[clave];
      });
  };
  const tareaDe = (clave: string) => trabajos[clave].entregables[0].tareas[0].id;

  /** El calendario real de una persona entre dos días: tramos de su cola y reuniones con hora. */
  const calendario = async (q: Quien, desde = D, hasta = sumarDias(D, 14)) => {
    const a = (await http().get(`/api/agenda/mia?desde=${desde}&hasta=${hasta}`).set(como(q)).expect(200)).body as AgendaPersona;
    const tareas = a.dias.flatMap((d) => d.tareas.map((t) => ({ ...t, fecha: d.fecha })));
    const tramos: Tramo[] = tareas.filter((t) => t.enCola).map((t) => ({ id: t.id, fecha: t.fecha, inicio: t.inicio!, fin: t.fin! })).sort((x, y) => x.fecha.localeCompare(y.fecha) || x.inicio - y.inicio);
    const reuniones: Tramo[] = tareas.filter((t) => !t.enCola && t.comportamiento === 'reunion').map((t) => ({ id: t.id, fecha: t.fecha, inicio: t.inicio!, fin: t.fin! }));
    return { tramos, reuniones, minutos: (de: string) => tramos.filter((t) => t.id === de).reduce((s, t) => s + (t.fin - t.inicio), 0) };
  };
  /** Nada se cruza con nada: ni dos tramos de la cola ni un tramo con una reunión. */
  const sinCruces = (c: { tramos: Tramo[]; reuniones: Tramo[] }) => {
    const todos = [...c.tramos, ...c.reuniones].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.inicio - y.inicio);
    for (let i = 1; i < todos.length; i++) {
      if (todos[i].fecha === todos[i - 1].fecha) expect(todos[i].inicio).toBeGreaterThanOrEqual(todos[i - 1].fin);
    }
  };
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    // Restos de una corrida anterior interrumpida
    await limpiar((await prisma.usuario.findMany({ where: { email: { startsWith: 'e2e.esc.' } }, select: { id: true } })).map((u) => u.id));
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.esc.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Escenario', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    D = await proximoDiaHabil(prisma, sumarDias(hoy, 2));
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body as CatalogoActividades;
    elaboracion = actividades.actividades.find((a) => a.nombre === 'Elaboración')!.id;
    enfoque = actividades.actividades.find((a) => a.nombre === 'Enfoque')!.id;
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    cuerpo = {
      tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
      prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
      responsableId: ids.ana,
      trabajo: { ...(await datosAcademicos(prisma)) },
    };
  });

  /** Borra todo lo de esas personas (también restos de corridas anteriores que no terminaron): si quedaran auxiliares sueltos, alterarían a las demás pruebas. */
  const limpiar = async (usuarios: string[]) => {
    if (usuarios.length === 0) return;
    await prisma.notificacion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.ausencia.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios } }, { solicitadaPorId: { in: usuarios } }] } });
    await prisma.horaExtraBono.deleteMany({ where: { OR: [{ usuarioId: { in: usuarios } }, { propuestaPorId: { in: usuarios } }] } });
    await prisma.trabajo.deleteMany({ where: { OR: [{ creadoPor: { in: usuarios } }, { prospecto: { responsableId: { in: usuarios } } }] } });
    await prisma.prospecto.deleteMany({ where: { OR: [{ responsableId: { in: usuarios } }, { creadoPor: { in: usuarios } }] } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  };

  afterAll(async () => {
    await limpiar(Object.values(ids));
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await app.close();
  });

  // ─── 1. Clientes registrados: la cola es secuencial y sin cruces ──────────────

  it('1. dos clientes para el mismo auxiliar: el segundo sigue a continuación del primero', async () => {
    await registrar('C1', 1, { aux: 'aux1', minutos: 300 });
    await registrar('C2', 2, { aux: 'aux1', minutos: 300 });
    const c = await calendario('aux1');
    expect(c.minutos(tareaDe('C1'))).toBe(300);
    expect(c.minutos(tareaDe('C2'))).toBe(300);
    // El primero empieza el día y hora pedidos; el segundo, cuando termina el primero
    expect(c.tramos[0]).toMatchObject({ id: tareaDe('C1'), fecha: D, inicio: 8 * 60 });
    const fin1 = c.tramos.filter((t) => t.id === tareaDe('C1')).at(-1)!;
    const ini2 = c.tramos.find((t) => t.id === tareaDe('C2'))!;
    expect(ini2.fecha > fin1.fecha || (ini2.fecha === fin1.fecha && ini2.inicio >= fin1.fin)).toBe(true);
    sinCruces(c);
    unaSemana = c.tramos;
  });

  it('1b. la hora fija de inicio se respeta si está libre y se rechaza si se cruza', async () => {
    const previa = async (hora: string, fijo: boolean) =>
      (await http().get(`/api/trabajos/cliente-directo/vista-previa-inicio?auxiliarId=${ids.aux1}&fecha=${D}&hora=${hora}&minutos=60&fijo=${fijo}`).set(como('prod')).expect(200)).body as { cabe: boolean; mensaje: string | null; tieneActividades: boolean };
    expect((await previa('09:00', true)).cabe).toBe(false); // se cruza con C1
    expect((await previa('09:00', true)).mensaje).toContain('Se cruza con');
    expect((await previa('09:00', false)).tieneActividades).toBe(true); // a continuación: sí se puede
  });

  // ─── 2. Prospecto con su reunión ──────────────────────────────────────────────

  it('2. un prospecto con enfoque queda por asignar y no está en el calendario hasta que se asigna', async () => {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(50), nombres: 'Pros', apellidos: 'Pecto', esPrincipal: true }],
          primeraActividad: { actividadId: enfoque, fecha: D, hora: '16:00', modalidad: 'virtual' },
        })
        .expect(201)
    ).body as ProspectoDetalle;
    reunionId = p.tareas[0].id;
    expect(p.tareas[0]).toMatchObject({ estado: 'por_asignar' });
    const equipo = (await http().get(`/api/agenda/equipo?desde=${D}&hasta=${D}`).set(como('prod')).expect(200)).body as { porAsignar: { tarea: { id: string } }[] };
    expect(equipo.porAsignar.some((x) => x.tarea.id === reunionId)).toBe(false); // la de un prospecto no se ve aún
    expect((await calendario('aux1')).reuniones).toHaveLength(0);
  });

  it('3. al asignar la reunión se ve el impacto, se coloca en el calendario y la cola se acomoda alrededor', async () => {
    const impacto = (await http().get(`/api/tareas/${reunionId}/impacto-cola?usuarioIds=${ids.aux1}`).set(como('prod')).expect(200)).body as { tareas: { trabajoCodigo: string }[]; pasanARojo: number }[];
    expect(impacto[0].tareas.length).toBeGreaterThan(0); // algo de su cola se corre
    expect(impacto[0].pasanARojo).toBe(0); // y todo sigue llegando a su fecha
    await http().put(`/api/tareas/${reunionId}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux1 }).expect(200);
    const c = await calendario('aux1');
    expect(c.reuniones).toEqual([expect.objectContaining({ id: reunionId, fecha: D, inicio: 16 * 60, fin: 16 * 60 + 80 })]);
    // Nada de la cola cae dentro de la reunión, y no se pierde ni un minuto de trabajo
    expect(c.tramos.filter((t) => t.fecha === D && t.inicio < 16 * 60 + 80 && t.fin > 16 * 60)).toHaveLength(0);
    expect(c.minutos(tareaDe('C1'))).toBe(300);
    expect(c.minutos(tareaDe('C2'))).toBe(300);
    sinCruces(c);
    // El día lleno (8–13 y 15–19) con una reunión de 16:00 a 17:20: 8–13, 15–16, reunión, 17:20–19; y lo que sobra sigue al día siguiente desde las 8
    const delDia = c.tramos.filter((t) => t.fecha === D).map((t) => [t.inicio, t.fin]);
    expect(delDia).toEqual([[8 * 60, 13 * 60], [15 * 60, 16 * 60], [17 * 60 + 20, 19 * 60]]);
    const siguiente = c.tramos.find((t) => t.fecha > D)!;
    expect(siguiente.inicio).toBe(8 * 60);
  });

  it('4. si se reprograma la reunión, la cola se vuelve a acomodar (y se ve que no se cruza)', async () => {
    await http().post(`/api/tareas/${reunionId}/reprogramar`).set(como('prod')).send({ fecha: D, hora: '10:00', motivo: 'El cliente pidió la mañana' }).expect(201);
    const c = await calendario('aux1');
    expect(c.reuniones).toEqual([expect.objectContaining({ id: reunionId, fecha: D, inicio: 10 * 60 })]);
    expect(c.tramos.filter((t) => t.fecha === D && t.inicio < 10 * 60 + 80 && t.fin > 10 * 60)).toHaveLength(0);
    // El primer cliente queda partido por la reunión: antes y después
    const delPrimero = c.tramos.filter((t) => t.id === tareaDe('C1') && t.fecha === D);
    expect(delPrimero.length).toBeGreaterThanOrEqual(2);
    expect(c.minutos(tareaDe('C1')) + c.minutos(tareaDe('C2'))).toBe(600);
    sinCruces(c);
  });

  it('4b. una segunda reunión que choca pide un motivo; aun forzada, la cola respeta las dos', async () => {
    const otra = (await http().post(`/api/trabajos/${trabajos.C1.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: D, hora: '10:30', modalidad: 'virtual' }).expect(201)).body as { id: string };
    const choque = await http().put(`/api/tareas/${otra.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux1, confirmarImpacto: true }).expect(409);
    expect(JSON.stringify(choque.body)).toContain('choque');
    await http().put(`/api/tareas/${otra.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux1, confirmarImpacto: true, motivoForzado: 'El cliente solo puede a esa hora' }).expect(200);
    const c = await calendario('aux1');
    expect(c.reuniones).toHaveLength(2);
    for (const r of c.reuniones) expect(c.tramos.filter((t) => t.fecha === r.fecha && t.inicio < r.fin && t.fin > r.inicio)).toHaveLength(0);
    expect(c.minutos(tareaDe('C1')) + c.minutos(tareaDe('C2'))).toBe(600);
    await http().post(`/api/tareas/${otra.id}/cancelar`).set(como('prod')).send({ motivo: 'Se junta con la otra reunión' }).expect(201);
    expect((await calendario('aux1')).reuniones).toHaveLength(1);
  });

  it('5. al cancelar la reunión, el trabajo vuelve a su lugar original', async () => {
    await http().post(`/api/tareas/${reunionId}/cancelar`).set(como('prod')).send({ motivo: 'El cliente ya no la necesita' }).expect(201);
    const c = await calendario('aux1');
    expect(c.reuniones).toHaveLength(0);
    expect(c.tramos).toEqual(unaSemana);
  });

  // ─── 3. Reprogramar un trabajo entero o desde una hora ────────────────────────

  it('6. reprogramar la entrega de un trabajo entero cambia su fecha límite y queda en su historial', async () => {
    const nueva = sumarDias(D, 45);
    const t = (await http().post(`/api/trabajos/${trabajos.C2.id}/reprogramar`).set(como('prod')).send({ fechaLimite: nueva, motivo: 'El cliente pidió más tiempo' }).expect(200)).body as TrabajoDetalle;
    expect(t.fechaLimite).toBe(nueva);
    expect(t.eventos.some((e) => e.detalle.toLowerCase().includes('reprogram') || e.detalle.includes(nueva))).toBe(true);
  });

  it('7. cambiar desde cuándo se programa una actividad corre la cola desde ahí, sin cruces', async () => {
    const dia = await proximoDiaHabil(prisma, sumarDias(D, 4));
    await http().put(`/api/produccion/tareas/${tareaDe('C2')}/inicio`).set(como('prod')).send({ fecha: dia, hora: '09:00' }).expect(204);
    const c = await calendario('aux1');
    const primero = c.tramos.find((t) => t.id === tareaDe('C2'))!;
    expect(primero.fecha > dia || (primero.fecha === dia && primero.inicio >= 9 * 60)).toBe(true);
    expect(c.minutos(tareaDe('C2'))).toBe(300);
    sinCruces(c);
    // Y vuelve a empezar a continuación (sin hora ni día mínimos)
    await http().put(`/api/produccion/tareas/${tareaDe('C2')}/inicio`).set(como('prod')).send({ fecha: D, hora: '08:00' }).expect(204);
    expect((await calendario('aux1')).tramos).toEqual(unaSemana);
  });

  // ─── 4. Un bloque con lo ya avanzado, y a quién dárselo ───────────────────────

  it('8. con lo ya trabajado, quien recibe el trabajo solo programa lo que falta y se le recomienda a quién pasarlo', async () => {
    // El auxiliar ya trabajó 2 h en el primer cliente (ayer)
    const ayer = sumarDias(hoy, -1);
    await http().post(`/api/tareas/${tareaDe('C1')}/tiempo`).set(como('aux1')).send({ fecha: ayer, horaInicio: '09:00', horaFin: '11:00', motivo: 'Avance previo registrado a mano' }).expect(201);
    const carga = (await http().get(`/api/produccion/carga/${ids.aux1}`).set(como('prod')).expect(200)).body as CargaPersona;
    const t1 = carga.trabajos.find((t) => t.trabajo.id === trabajos.C1.id)!;
    expect(t1.bloques[0]).toMatchObject({ minutosHechos: 120, minutosFaltan: 180 });
    // Recomendación: quienes pueden (otros auxiliares, nunca el dueño ni el jefe) y una sugerencia concreta
    const elegibles = t1.elegibles.map((u) => u.id);
    expect(elegibles).toEqual(expect.arrayContaining([ids.aux2, ids.aux3]));
    expect(elegibles).not.toContain(ids.aux1);
    expect(elegibles).not.toContain(ids.jefe);
    expect(t1.sugerido).not.toBeNull();

    const reparto = [{ trabajoId: trabajos.C1.id, entregableId: t1.bloques[0].entregableId, usuarioId: ids.aux2 }];
    const sim = (await http().post(`/api/produccion/carga/${ids.aux1}/simular`).set(como('prod')).send({ reparto }).expect(201)).body as ImpactoCarga;
    expect(sim.personas[0].tareas[0].resultado.fin).not.toBeNull();
    await http().post(`/api/produccion/carga/${ids.aux1}/aplicar`).set(como('prod')).send({ reparto, motivo: 'Pasa a otras actividades' }).expect(201);

    // aux2 programa solo los 180 min que faltan; aux1 ya no la tiene; lo avanzado sigue a su nombre
    const c2 = await calendario('aux2');
    expect(c2.minutos(tareaDe('C1'))).toBe(180);
    sinCruces(c2);
    expect((await calendario('aux1')).minutos(tareaDe('C1'))).toBe(0);
    const tiempos = await prisma.registroTiempo.findMany({ where: { tareaId: tareaDe('C1') } });
    expect(tiempos.map((x) => x.usuarioId)).toEqual([ids.aux1]);
    expect(tiempos[0].minutos).toBe(120);
    // El segundo cliente de aux1 se recorre solo a donde empezaba el primero
    const c1 = await calendario('aux1');
    expect(c1.tramos[0]).toMatchObject({ id: tareaDe('C2'), fecha: D, inicio: 8 * 60 });
    sinCruces(c1);
  });

  it('9. «Buscar apoyo» ordena a quienes pueden tomar una tarea: primero quienes llegan en horario normal', async () => {
    const a = (await http().get(`/api/produccion/tareas/${tareaDe('C2')}/apoyo`).set(como('prod')).expect(200)).body as ApoyoTarea;
    expect(a.candidatos.length).toBeGreaterThanOrEqual(2);
    expect(a.candidatos.map((c) => c.usuario.id)).not.toContain(ids.aux1);
    const llegan = a.candidatos.map((c) => c.llegaEnHorario);
    expect(llegan).toEqual([...llegan].sort((x, y) => Number(y) - Number(x))); // los que llegan van antes
  });

  it('8b. si algo no llega a su fecha, «reordenar por prioridad y fecha» lo pone adelante', async () => {
    // Un trabajo de 5 h que vence el mismo día en que empieza la cola: solo, llega a las 13:00; detrás de otro de 5 h, termina al día siguiente
    await registrar('C3', 4, { aux: 'aux1', minutos: 300, limite: D });
    let cola = await colaDe('aux1');
    const posicion = (id: string) => cola.items.findIndex((i) => i.tareaId === id);
    expect(posicion(tareaDe('C3'))).toBeGreaterThan(posicion(tareaDe('C2')));
    expect(cola.items.find((i) => i.tareaId === tareaDe('C3'))!.semaforo).toBe('rojo');
    await http().post(`/api/produccion/colas/${ids.aux1}/orden-sugerido`).set(como('prod')).expect(204);
    cola = await colaDe('aux1');
    expect(posicion(tareaDe('C3'))).toBeLessThan(posicion(tareaDe('C2')));
    expect(cola.items.find((i) => i.tareaId === tareaDe('C3'))!.semaforo).not.toBe('rojo');
    sinCruces(await calendario('aux1'));
  });

  // ─── 5. Una urgencia entra a un auxiliar que ya tiene actividades y reuniones ─

  it('10. un trabajo urgente entra a un auxiliar con actividades y reuniones: va primero y todo lo demás se vuelve a acomodar', async () => {
    // aux2 ya tiene el bloque que recibió; le asignamos además una reunión de un cliente a las 10:00 de D
    await registrar('U', 3, { aux: 'aux3', minutos: 240, limite: sumarDias(D, 5) });
    const reunion = (
      await http().post(`/api/trabajos/${trabajos.U.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: D, hora: '10:00', modalidad: 'virtual' }).expect(201)
    ).body as { id: string };
    await http().put(`/api/tareas/${reunion.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux2, confirmarImpacto: true }).expect(200);
    const antes = await calendario('aux2');
    expect(antes.reuniones).toHaveLength(1);

    // La asistente administrativa pide la urgencia; producción la ejecuta en la cola de aux2
    const solicitud = (await http().post(`/api/trabajos/${trabajos.U.id}/urgente`).set(como('ana')).send({ motivo: 'El cliente adelantó la entrega' }).expect(201)).body as SolicitudUrgenteItem;
    const impacto = (await http().get(`/api/urgentes/${solicitud.id}/impacto?usuarioId=${ids.aux2}`).set(como('prod')).expect(200)).body as ImpactoUrgente;
    expect(impacto.items.find((i) => i.esUrgente)).toBeDefined();
    expect(impacto.items.some((i) => !i.esUrgente)).toBe(true); // su trabajo de siempre se ve afectado
    await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('prod')).send({ usuarioId: ids.aux2, observacion: 'Entra a la cola de aux2' }).expect(201);

    const cola = await colaDe('aux2');
    expect(cola.items[0].trabajo.id).toBe(trabajos.U.id); // la urgencia va primera
    const despues = await calendario('aux2');
    expect(despues.reuniones).toHaveLength(1); // la reunión no se movió
    expect(despues.reuniones[0]).toMatchObject({ fecha: D, inicio: 10 * 60 });
    expect(despues.tramos.filter((t) => t.fecha === D && t.inicio < despues.reuniones[0].fin && t.fin > despues.reuniones[0].inicio)).toHaveLength(0);
    sinCruces(despues);
    // Nada se perdió: lo urgente (240) y el bloque que ya tenía (180) siguen completos
    expect(despues.minutos(tareaDe('U'))).toBe(240);
    expect(despues.minutos(tareaDe('C1'))).toBe(180);
    // La urgencia empieza antes que el trabajo que ya tenía
    const iniU = despues.tramos.find((t) => t.id === tareaDe('U'))!;
    const iniC1 = despues.tramos.find((t) => t.id === tareaDe('C1'))!;
    expect(iniU.fecha < iniC1.fecha || (iniU.fecha === iniC1.fecha && iniU.inicio < iniC1.inicio)).toBe(true);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.aux2, tipo: 'urgente.en_tu_cola' } })).toBe(1);
    // La cola de aux3 (de donde salió) quedó libre de esa tarea
    expect((await calendario('aux3')).minutos(tareaDe('U'))).toBe(0);
  });
  // ─── 6. Lo que no se puede: días sin trabajo, ausencias y fechas inamovibles ──

  it('11. una reunión no se programa en un día que la persona no trabaja ni cuando está ausente', async () => {
    // Un domingo
    let domingo = sumarDias(D, 1);
    while (new Date(`${domingo}T12:00:00Z`).getUTCDay() !== 0) domingo = sumarDias(domingo, 1);
    const enDomingo = (await http().post(`/api/trabajos/${trabajos.C2.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: domingo, hora: '10:00', modalidad: 'virtual' }).expect(201)).body as { id: string };
    // Fuera de su horario es un aviso que pide motivo; solo una ausencia o feriado lo bloquea
    const r = await http().put(`/api/tareas/${enDomingo.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux3, confirmarImpacto: true }).expect(409);
    expect(JSON.stringify(r.body)).toContain('no está en su horario');
    // Una ausencia aprobada
    const dia = await proximoDiaHabil(prisma, sumarDias(D, 6));
    await prisma.ausencia.create({ data: { usuarioId: ids.aux3, tipo: 'permiso', fechaDesde: new Date(`${dia}T00:00:00Z`), fechaHasta: new Date(`${dia}T00:00:00Z`), estado: 'aprobada', solicitadaPorId: ids.admin, motivo: 'Prueba' } });
    const enAusencia = (await http().post(`/api/trabajos/${trabajos.C2.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: dia, hora: '10:00', modalidad: 'virtual' }).expect(201)).body as { id: string };
    const r2 = await http().put(`/api/tareas/${enAusencia.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux3, confirmarImpacto: true }).expect(400);
    expect(JSON.stringify(r2.body).toLowerCase()).toContain('no trabaja');
    // Reprogramar una reunión asignada a un domingo tampoco se permite
    const buena = (await http().post(`/api/trabajos/${trabajos.C2.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: D, hora: '17:30', modalidad: 'virtual' }).expect(201)).body as { id: string };
    await http().put(`/api/tareas/${buena.id}/equipo-reunion`).set(como('prod')).send({ jefeId: ids.jefe }).expect(200);
    // Pasarla a un domingo (fuera de su horario) pide un motivo, igual que al asignar
    const mover = await http().post(`/api/tareas/${buena.id}/reprogramar`).set(como('prod')).send({ fecha: domingo, hora: '10:00' });
    expect(mover.status).toBe(409);
    expect(JSON.stringify(mover.body)).toContain('no está en su horario');
    await http().post(`/api/tareas/${buena.id}/reprogramar`).set(como('prod')).send({ fecha: domingo, hora: '10:00', motivoForzado: 'El cliente solo puede el domingo' }).expect(201);
    await http().post(`/api/tareas/${buena.id}/cancelar`).set(como('prod')).send({ motivo: 'Fin de la prueba' }).expect(201);
  });

  it('12. una urgencia que atrasaría un trabajo de fechas inamovibles se rechaza hasta aceptarlo de forma expresa', async () => {
    // aux3 tiene un trabajo que llena justo el día de entrega y está fijado
    await registrar('F', 5, { aux: 'aux3', minutos: 540, limite: D });
    await prisma.trabajo.update({ where: { id: trabajos.F.id }, data: { fechasFijas: true, fechasFijasMotivo: 'Prioridad del cliente', fechasFijasEn: new Date(), fechasFijasPorId: ids.admin } });
    await registrar('U2', 6, { aux: 'aux1', minutos: 120, limite: sumarDias(D, 10) });
    const solicitud = (await http().post(`/api/trabajos/${trabajos.U2.id}/urgente`).set(como('ana')).send({ motivo: 'Entrega adelantada' }).expect(201)).body as SolicitudUrgenteItem;
    const rechazo = await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('prod')).send({ usuarioId: ids.aux3 }).expect(400);
    expect(JSON.stringify(rechazo.body)).toContain('inamovibles');
    // Nada cambió: la urgencia sigue pendiente en la cola de aux1 y el trabajo fijado conserva su horario
    expect((await colaDe('aux1')).items.some((i) => i.tareaId === tareaDe('U2'))).toBe(true);
    expect((await calendario('aux3')).minutos(tareaDe('F'))).toBe(540);
    // Aceptándolo de forma expresa (quien puede fijar fechas), sí
    await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('admin')).send({ usuarioId: ids.aux3, forzarFechasFijas: true }).expect(201);
    const c = await calendario('aux3');
    expect(c.minutos(tareaDe('U2'))).toBe(120);
    expect(c.minutos(tareaDe('F'))).toBe(540);
    sinCruces(c);
  });
  it('13. al reprogramar una reunión se ve qué se corre; si deja algo sin llegar a su fecha hay que confirmarlo', async () => {
    // aux4 tiene un trabajo de 9 h que vence hoy mismo (llena justo el día)
    await registrar('T13', 7, { aux: 'aux4', minutos: 540, limite: D });
    const reunion = (await http().post(`/api/trabajos/${trabajos.T13.id}/reuniones`).set(como('prod')).send({ actividadId: enfoque, fecha: sumarDias(D, 1), hora: '10:00', modalidad: 'virtual' }).expect(201)).body as { id: string };
    await http().put(`/api/tareas/${reunion.id}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux4 }).expect(200); // otro día: no corre nada
    const antes = await calendario('aux4');
    expect(antes.minutos(tareaDe('T13'))).toBe(540);
    expect(antes.tramos.every((t) => t.fecha === D)).toBe(true);
    // Pasarla al día de entrega, a las 17:00, empuja el trabajo al día siguiente: se ve en la vista previa
    const prev = (await http().get(`/api/tareas/${reunion.id}/impacto-cola?fecha=${D}&hora=17:00`).set(como('prod')).expect(200)).body as { tareas: { trabajoCodigo: string; pasaARojo: boolean }[]; pasanARojo: number }[];
    expect(prev[0].pasanARojo).toBe(1);
    expect(prev[0].tareas[0]).toMatchObject({ trabajoCodigo: trabajos.T13.codigo, pasaARojo: true });
    const sin = await http().post(`/api/tareas/${reunion.id}/reprogramar`).set(como('prod')).send({ fecha: D, hora: '17:00' });
    expect(sin.status).toBe(409);
    expect(sin.body.codigo).toBe('impacto_cola');
    // Nada cambió
    expect((await calendario('aux4')).reuniones[0]).toMatchObject({ fecha: sumarDias(D, 1), inicio: 10 * 60 });
    await http().post(`/api/tareas/${reunion.id}/reprogramar`).set(como('prod')).send({ fecha: D, hora: '17:00', confirmarImpacto: true }).expect(201);
    const despues = await calendario('aux4');
    expect(despues.reuniones[0]).toMatchObject({ fecha: D, inicio: 17 * 60 });
    expect(despues.minutos(tareaDe('T13'))).toBe(540);
    sinCruces(despues);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.jefe, tipo: 'cola.impacto' } })).toBeGreaterThan(0);
    // Y si se cancela, el trabajo vuelve a llenar el día
    await http().post(`/api/tareas/${reunion.id}/cancelar`).set(como('prod')).send({ motivo: 'El cliente la canceló' }).expect(201);
    const final = await calendario('aux4');
    expect(final.reuniones).toHaveLength(0);
    expect(final.tramos).toEqual(antes.tramos);
  });
});
