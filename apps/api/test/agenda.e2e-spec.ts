/**
 * Pruebas e2e de agenda y disponibilidad: horarios, feriados, cumpleaños y ausencias (base produccion_test).
 */
import { diaEnLima, sumarDias, type AgendaPersona, type AusenciaItem, type CandidatosTarea, type ProspectoDetalle } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { proximoDiaHabil } from './dias.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'aux' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', admin: 'ADMIN' };

describe('Agenda y disponibilidad (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  // Días hábiles distintos para cada caso.
  let diaVacaciones: string;
  let diaCumple: string;
  let diaPermiso: string;
  let diaLibre: string;
  let enfoqueId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const agendaDe = async (q: Quien, desde: string, hasta = desde) =>
    (await http().get(`/api/agenda/mia?desde=${desde}&hasta=${hasta}`).set(como(q)).expect(200)).body as AgendaPersona;

  /** Prospecto con un enfoque por asignar ese día y a esa hora. */
  async function enfoque(n: number, fecha: string, hora: string) {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
          primeraActividad: { actividadId: actividades.find((a: { nombre: string }) => a.nombre === 'Enfoque').id, fecha, hora, modalidad: 'virtual' },
        })
        .expect(201)
    ).body as ProspectoDetalle;
    return p.tareas[0].id;
  }

  const candidatos = async (tareaId: string) => (await http().get(`/api/tareas/${tareaId}/candidatos`).set(como('prod')).expect(200)).body as CandidatosTarea;
  const asignarAux = (tareaId: string, participacionId: string, motivoForzado?: string) =>
    http().post(`/api/tareas/${tareaId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId, usuarioId: ids.aux }], motivoForzado });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.a.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Agenda', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    diaVacaciones = await proximoDiaHabil(prisma, sumarDias(hoy, 7));
    diaCumple = await proximoDiaHabil(prisma, diaVacaciones);
    diaPermiso = await proximoDiaHabil(prisma, diaCumple);
    diaLibre = await proximoDiaHabil(prisma, diaPermiso);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.ausencia.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.horarioUsuario.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('sin horario propio se usa el horario estándar: 9 horas de lunes a viernes', async () => {
    const [dia] = (await agendaDe('aux', diaLibre)).dias;
    expect(dia.estado).toBe('libre');
    expect(dia.capacidad).toBe(9 * 60);
    expect(dia.tramos).toEqual([
      { inicio: 480, fin: 780 },
      { inicio: 900, fin: 1140 },
    ]);
  });

  it('los feriados los ve y edita solo quien tiene permiso', async () => {
    await http().get('/api/calendario/feriados?anio=2026').set(como('aux')).expect(403);
    const feriados = (await http().get('/api/calendario/feriados?anio=2026').set(como('admin')).expect(200)).body;
    expect(feriados.some((f: { nombre: string }) => f.nombre === 'Fiestas Patrias')).toBe(true);
    await http().post('/api/calendario/feriados').set(como('admin')).send({ fecha: '2026-07-28', nombre: 'Repetido' }).expect(409);
  });

  it('vacaciones: se solicitan, se aprueban y bloquean la agenda', async () => {
    const solicitud = (
      await http().post('/api/ausencias/solicitar').set(como('aux')).send({ tipo: 'vacaciones', fechaDesde: diaVacaciones, fechaHasta: diaVacaciones }).expect(201)
    ).body as AusenciaItem;
    expect(solicitud.estado).toBe('solicitada');
    // Por aprobar todavía no bloquea.
    expect((await agendaDe('aux', diaVacaciones)).dias[0].estado).toBe('libre');

    // No se cruzan dos ausencias vigentes.
    await http().post('/api/ausencias/solicitar').set(como('aux')).send({ tipo: 'otro', fechaDesde: diaVacaciones, fechaHasta: diaVacaciones }).expect(409);
    // Solo el administrador aprueba.
    await http().post(`/api/ausencias/${solicitud.id}/aprobar`).set(como('prod')).send({}).expect(403);
    const aprobada = (await http().post(`/api/ausencias/${solicitud.id}/aprobar`).set(como('admin')).send({}).expect(201)).body as AusenciaItem;
    expect(aprobada.estado).toBe('aprobada');

    const [dia] = (await agendaDe('aux', diaVacaciones)).dias;
    expect(dia.estado).toBe('no_laborable');
    expect(dia.bloqueos[0]).toMatchObject({ tipo: 'vacaciones', intervalo: null });

    // La persona solo ve sus ausencias.
    const propias = (await http().get('/api/ausencias').set(como('aux')).expect(200)).body as AusenciaItem[];
    expect(propias.every((a) => a.usuario.id === ids.aux)).toBe(true);
  });

  it('no se asigna a nadie en un día no laborable (y el candidato aparece al final)', async () => {
    const tareaId = await enfoque(1, diaVacaciones, '10:00');
    const cand = await candidatos(tareaId);
    const quienDa = cand.participaciones.find((p) => p.obligatoria)!;
    const aux = quienDa.candidatos.find((c) => c.usuario.id === ids.aux)!;
    expect(aux.disponibilidad).toMatchObject({ estado: 'no_laborable', bloqueo: 'Vacaciones' });
    expect(quienDa.candidatos.at(-1)!.disponibilidad.estado).toBe('no_laborable');

    const res = await asignarAux(tareaId, quienDa.id, 'Igual').expect(400);
    expect(res.body.errores[0].mensaje).toContain('no trabaja ese día (Vacaciones)');
  });

  it('producción registra descansos médicos, pero no vacaciones', async () => {
    await http()
      .post('/api/ausencias')
      .set(como('prod'))
      .send({ usuarioId: ids.aux, tipo: 'vacaciones', fechaDesde: diaLibre, fechaHasta: diaLibre })
      .expect(403);
    const descanso = (
      await http()
        .post('/api/ausencias')
        .set(como('prod'))
        .send({ usuarioId: ids.aux, tipo: 'descanso_medico', fechaDesde: hoy, fechaHasta: hoy, motivo: 'Gripe' })
        .expect(201)
    ).body as AusenciaItem;
    expect(descanso.estado).toBe('aprobada');
    // Quien lo registró también lo puede anular.
    expect((await http().post(`/api/ausencias/${descanso.id}/anular`).set(como('prod')).send({}).expect(201)).body.estado).toBe('anulada');
  });

  it('el cumpleaños es día libre', async () => {
    await http().patch(`/api/calendario/personal/${ids.aux}`).set(como('prod')).send({ fechaNacimiento: `1995${diaCumple.slice(4)}` }).expect(403);
    await http().patch(`/api/calendario/personal/${ids.aux}`).set(como('admin')).send({ fechaNacimiento: `1995${diaCumple.slice(4)}` }).expect(200);
    const [dia] = (await agendaDe('aux', diaCumple)).dias;
    expect(dia.estado).toBe('no_laborable');
    expect(dia.bloqueos[0].tipo).toBe('cumpleanos');
  });

  it('fuera de horario es un aviso: se puede forzar con motivo', async () => {
    enfoqueId = await enfoque(2, diaLibre, '19:30');
    const cand = await candidatos(enfoqueId);
    const quienDa = cand.participaciones.find((p) => p.obligatoria)!;
    expect(quienDa.candidatos.find((c) => c.usuario.id === ids.aux)!.disponibilidad.estado).toBe('fuera_horario');

    const sinMotivo = await asignarAux(enfoqueId, quienDa.id).expect(409);
    expect(sinMotivo.body.choques[0].avisos).toContain('Fuera de su horario');
    const forzada = await asignarAux(enfoqueId, quienDa.id, 'El cliente solo puede de noche').expect(201);
    expect(forzada.body.responsables[0].forzado).toBe(true);
  });

  it('un permiso por horas bloquea solo esas horas y avisa las tareas afectadas', async () => {
    const tareaId = await enfoque(3, diaPermiso, '16:00');
    const quienDa = (await candidatos(tareaId)).participaciones.find((p) => p.obligatoria)!;
    await asignarAux(tareaId, quienDa.id).expect(201);

    const permiso = (
      await http()
        .post('/api/ausencias/solicitar')
        .set(como('aux'))
        .send({ tipo: 'permiso', fechaDesde: diaPermiso, fechaHasta: diaPermiso, horaDesde: '15:00', horaHasta: '17:00', motivo: 'Trámite' })
        .expect(201)
    ).body as AusenciaItem;
    expect(permiso.tareasAfectadas.map((t) => t.id)).toEqual([tareaId]);
    await http().post(`/api/ausencias/${permiso.id}/aprobar`).set(como('admin')).send({}).expect(201);

    const [dia] = (await agendaDe('aux', diaPermiso)).dias;
    expect(dia.capacidad).toBe(7 * 60);
    expect(dia.estado).toBe('libre');
    // Reprogramarla dentro del permiso no se permite; en la mañana, sí.
    await http().post(`/api/tareas/${tareaId}/reprogramar`).set(como('prod')).send({ fecha: diaPermiso, hora: '15:30' }).expect(400);
    await http().post(`/api/tareas/${tareaId}/reprogramar`).set(como('prod')).send({ fecha: diaPermiso, hora: '09:00' }).expect(201);
  });

  it('un horario nuevo rige desde su fecha y no cambia el pasado', async () => {
    await http()
      .put(`/api/calendario/personal/${ids.aux}/horario`)
      .set(como('admin'))
      .send({ vigenteDesde: diaLibre, tramos: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: '08:00', fin: '13:00' })) })
      .expect(200);
    const agenda = await agendaDe('aux', diaPermiso, diaLibre);
    expect(agenda.dias[0].tramos).toHaveLength(2);
    expect(agenda.dias.at(-1)!.capacidad).toBe(5 * 60);
    // Las tareas ya programadas siguen en su agenda.
    expect(agenda.dias.at(-1)!.tareas.map((t) => t.id)).toContain(enfoqueId);

    // Un segundo cambio no puede regir en el pasado.
    await http()
      .put(`/api/calendario/personal/${ids.aux}/horario`)
      .set(como('admin'))
      .send({ vigenteDesde: sumarDias(hoy, -1), tramos: [{ diaSemana: 1, inicio: '08:00', fin: '12:00' }] })
      .expect(400);
  });

  it('la agenda del equipo es para producción', async () => {
    await http().get(`/api/agenda/equipo?desde=${diaLibre}&hasta=${diaLibre}`).set(como('aux')).expect(403);
    const equipo = (await http().get(`/api/agenda/equipo?desde=${diaLibre}&hasta=${sumarDias(diaLibre, 6)}&rol=AUXILIAR`).set(como('prod')).expect(200)).body;
    const aux = equipo.personas.find((p: AgendaPersona) => p.usuario.id === ids.aux) as AgendaPersona;
    expect(aux.dias).toHaveLength(7);
    await http().get(`/api/agenda/equipo?desde=${diaLibre}&hasta=${sumarDias(diaLibre, 90)}`).set(como('prod')).expect(400);
  });
});
