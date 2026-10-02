/**
 * Pruebas e2e del cronómetro: iniciar, pausar, registro manual, cierre al completar, cola y reporte (base produccion_test).
 */
import { diaEnLima, sumarDias, type ColaPersona, type ProspectoDetalle, type ReporteTiempos, type TiempoActivo, type TiemposDeTarea, type TrabajoDetalle } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { datosAcademicos } from './datos-academicos.js';
import { RecordatoriosService } from '../src/recordatorios/recordatorios.service.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Cronómetro y tiempo real (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let primera: string;
  let segunda: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const activo = async (q: Quien) => (await http().get('/api/tiempo/activo').set(como(q)).expect(200)).body.activo as TiempoActivo | null;
  const tiempos = async (tareaId: string) => (await http().get(`/api/tareas/${tareaId}/tiempo`).set(como('prod')).expect(200)).body as TiemposDeTarea;
  /** Mueve los tramos de una tarea hacia atrás, para simular que pasó el tiempo. */
  const retroceder = (tareaId: string, minutos: number) =>
    prisma.$executeRaw`UPDATE registro_tiempo SET inicio = inicio - make_interval(mins => ${minutos}::int) WHERE tarea_id = ${tareaId}::uuid AND fin IS NULL`;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.ti.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Tiempo', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }

    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t: { nombre: string }) => t.nombre === 'Artículo científico').id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Tiempo', email: `t.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `5${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 60) },
          contrato: { fechaFirma: hoy, montoTotal: 900, formaPago: 'contado', cuotas: [{ monto: 900, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;
    [primera, segunda] = trabajo.entregables[0].tareas.map((t) => t.id);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('solo el responsable inicia el cronómetro; la tarea pasa a "en proceso"', async () => {
    await http().post(`/api/tareas/${primera}/cronometro/iniciar`).set(como('jefe')).expect(403);
    const a = (await http().post(`/api/tareas/${primera}/cronometro/iniciar`).set(como('aux')).expect(201)).body as TiempoActivo;
    expect(a).toMatchObject({ tarea: { id: primera }, minutosPrevios: 0 });
    expect((await activo('aux'))?.tarea.id).toBe(primera);
    const t = (await http().get(`/api/tareas/${primera}`).set(como('aux')).expect(200)).body;
    expect(t.estado).toBe('en_proceso');
    expect(t.enCurso).toEqual([{ usuarioId: ids.aux, inicio: a.inicio }]);
  });

  it('una tarea a la vez: iniciar otra pausa la anterior; la cola planifica solo lo que falta', async () => {
    await retroceder(primera, 90);
    await http().post(`/api/tareas/${segunda}/cronometro/iniciar`).set(como('aux')).expect(201);
    expect((await activo('aux'))?.tarea.id).toBe(segunda);
    const t1 = await tiempos(primera);
    expect(t1.minutosReales).toBe(90);
    expect(t1.registros[0]).toMatchObject({ minutos: 90, manual: false });

    const cola = (await http().get('/api/produccion/colas/mia').set(como('aux')).expect(200)).body as ColaPersona;
    const item = cola.items.find((i) => i.tareaId === primera)!;
    expect(item.minutosReales).toBe(90);
    expect(cola.items.find((i) => i.tareaId === segunda)!.enCursoDesde).not.toBeNull();
    // 6 h estimadas − 1,5 h trabajadas: la cola reserva 4,5 h para terminarla.
    const plan = item.plan!;
    expect((Date.parse(plan.fin) - Date.parse(plan.inicio)) / 60_000).toBeGreaterThanOrEqual(270);
  });

  it('registro manual: sin cruces, no a futuro, solo con permiso', async () => {
    const ayer = sumarDias(hoy, -1);
    await http().post(`/api/tareas/${primera}/tiempo`).set(como('ana')).send({ fecha: ayer, horaInicio: '08:00', horaFin: '09:00', motivo: 'Olvidé marcar' }).expect(403);
    await http().post(`/api/tareas/${primera}/tiempo`).set(como('aux')).send({ fecha: sumarDias(hoy, 1), horaInicio: '08:00', horaFin: '09:00', motivo: 'Futuro' }).expect(400);
    await http().post(`/api/tareas/${primera}/tiempo`).set(como('aux')).send({ fecha: ayer, horaInicio: '08:00', horaFin: '09:30', motivo: 'Olvidé marcar' }).expect(201);
    await http().post(`/api/tareas/${segunda}/tiempo`).set(como('aux')).send({ fecha: ayer, horaInicio: '09:00', horaFin: '10:00', motivo: 'Se cruza' }).expect(409);
    const t = await tiempos(primera);
    expect(t.minutosReales).toBe(180);
    const manual = t.registros.find((r) => r.manual)!;
    expect(manual.motivo).toBe('Olvidé marcar');
    // Solo se quitan registros manuales propios.
    const automatico = t.registros.find((r) => !r.manual)!;
    await http().delete(`/api/tareas/${primera}/tiempo/${automatico.id}`).set(como('aux')).expect(403);
    await http().delete(`/api/tareas/${primera}/tiempo/${manual.id}`).set(como('aux')).expect(200);
    expect((await tiempos(primera)).minutosReales).toBe(90);
  });

  it('completar detiene el cronómetro; el reporte compara estimado y real', async () => {
    await retroceder(segunda, 45);
    await http().post(`/api/tareas/${segunda}/completar`).set(como('aux')).send({ resultado: 'Listo' }).expect(201);
    expect(await activo('aux')).toBeNull();
    expect((await tiempos(segunda)).minutosReales).toBe(45);

    await http().get('/api/reportes/tiempos').set(como('aux')).expect(403);
    const r = (await http().get(`/api/reportes/tiempos?desde=${hoy}&hasta=${hoy}`).set(como('prod')).expect(200)).body as ReporteTiempos;
    const desvio = r.mayoresDesvios.find((d) => d.id === segunda)!;
    expect(desvio).toMatchObject({ minutosReales: 45, responsables: ['E2E aux Tiempo'] });
    expect(desvio.desviacion).toBeLessThan(0);
    const fila = r.porActividad.find((a) => a.actividad.nombre === 'Elaboración')!;
    expect(fila.medianaReal).toBeGreaterThan(0);
    expect(r.porPersona.find((p) => p.usuario.id === ids.aux)).toBeTruthy();
  });

  it('un cronómetro olvidado se cierra solo y se avisa', async () => {
    await http().post(`/api/tareas/${primera}/cronometro/iniciar`).set(como('aux')).expect(201);
    await retroceder(primera, 30);
    await app.get(RecordatoriosService).cerrarCronometros();
    expect(await activo('aux')).toBeNull();
    const t = await tiempos(primera);
    expect(t.registros.find((x) => x.autoCerrado)?.minutos).toBe(30);
    const avisos = (await http().get('/api/notificaciones').set(como('aux')).expect(200)).body;
    expect(avisos.items.some((n: { tipo: string }) => n.tipo === 'recordatorio.cronometro')).toBe(true);
  });
});
