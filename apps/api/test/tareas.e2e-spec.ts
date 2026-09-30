/**
 * Pruebas e2e de actividades, tareas y seguimiento (base produccion_test).
 */
import { diaEnLima, sumarDias, type ActividadCatalogo, type CatalogosProspecto, type ProspectoDetalle } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const manana = sumarDias(diaEnLima(), 1);

type Quien = 'ana' | 'prod' | 'aux' | 'jefe';

describe('Tareas y seguimiento (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let catalogos: CatalogosProspecto;
  let actividades: ActividadCatalogo[];
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const actividad = (nombre: string) => actividades.find((a) => a.nombre === nombre)!;
  const etapa = (nombre: string) => catalogos.etapas.find((e) => e.nombre === nombre)!;

  async function crearUsuario(q: Quien, rol: string) {
    const email = `e2e.t.${q}.${sufijo}@grupoes.local`;
    const rolDb = await prisma.rol.findUniqueOrThrow({ where: { codigo: rol } });
    const u = await prisma.usuario.create({
      data: { nombres: `E2E ${q}`, apellidos: 'Tareas', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rolDb.id } } },
    });
    ids[q] = u.id;
    tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
  }

  const nuevoProspecto = async (n: number, extra: Record<string, unknown> = {}) =>
    (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades.find((p) => p.porDefecto)!.id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), nombres: `Contacto ${n}`, esPrincipal: true }],
          ...extra,
        })
        .expect(201)
    ).body as ProspectoDetalle;

  const enfoque = (hora = '10:00') => ({ actividadId: actividad('Enfoque').id, fecha: manana, hora, modalidad: 'virtual' });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await crearUsuario('ana', 'ASIST_ADM');
    await crearUsuario('prod', 'ASIST_PROD');
    await crearUsuario('aux', 'AUXILIAR');
    await crearUsuario('jefe', 'JEFE_PROD');
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('entrega el catálogo de actividades con participaciones y prioridades', () => {
    const e = actividad('Enfoque');
    expect(e.modoAsignacion).toBe('coordinada');
    expect(e.requiereHoraFija).toBe(true);
    const principal = e.participaciones.find((p) => p.obligatoria)!;
    expect(principal.roles.map((r) => `${r.codigo}:${r.prioridad.nombre}`)).toEqual(
      expect.arrayContaining(['JEFE_PROD:Principal', 'AUXILIAR:Principal', 'ASIST_PROD:Secundaria']),
    );
  });

  it('el enfoque exige hora y modalidad', async () => {
    const res = await http()
      .post('/api/prospectos')
      .set(como('ana'))
      .send({
        tipoTrabajoId: catalogos.tiposTrabajo[0].id,
        prioridadId: catalogos.prioridades[0].id,
        origenId: catalogos.origenes[0].id,
        contactos: [{ celular: celular(1), esPrincipal: true }],
        primeraActividad: { actividadId: actividad('Enfoque').id, fecha: manana },
      })
      .expect(400);
    expect(res.body.errores.map((e: { campo: string }) => e.campo)).toContain('primeraActividad.hora');
    // La transacción se revierte: no queda el prospecto a medias.
    expect(await prisma.persona.count({ where: { celular: `+51${celular(1)}` } })).toBe(0);
  });

  it('flujo del enfoque: por asignar → candidatos → asignar → completar, y el embudo avanza solo', async () => {
    const p = await nuevoProspecto(2, { primeraActividad: enfoque('10:00') });
    expect(p.etapa.nombre).toBe('Enfoque agendado');
    expect(p.tareas[0].estado).toBe('por_asignar');
    const tareaId = p.tareas[0].id;

    // La bandeja es del coordinador (asistente de producción); la asistente administrativa no tiene permiso.
    await http().get('/api/tareas/por-asignar').set(como('ana')).expect(403);
    const bandeja = await http().get('/api/tareas/por-asignar').set(como('prod')).expect(200);
    expect(bandeja.body.map((t: { id: string }) => t.id)).toContain(tareaId);

    const cand = (await http().get(`/api/tareas/${tareaId}/candidatos`).set(como('prod')).expect(200)).body;
    const quienDa = cand.participaciones.find((x: { obligatoria: boolean }) => x.obligatoria);
    const niveles = quienDa.candidatos.map((c: { prioridad: { nivel: number } }) => c.prioridad.nivel);
    expect(niveles).toEqual([...niveles].sort((a, b) => a - b));
    expect(quienDa.candidatos.some((c: { usuario: { id: string } }) => c.usuario.id === ids.aux)).toBe(true);

    // Un rol no permitido para esa participación se rechaza.
    await http()
      .post(`/api/tareas/${tareaId}/asignar`)
      .set(como('prod'))
      .send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.ana }] })
      .expect(400);

    const asignada = await http()
      .post(`/api/tareas/${tareaId}/asignar`)
      .set(como('prod'))
      .send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.aux }] })
      .expect(201);
    expect(asignada.body.estado).toBe('pendiente');

    const mias = await http().get('/api/tareas/mias').set(como('aux')).expect(200);
    expect(mias.body.map((t: { id: string }) => t.id)).toContain(tareaId);

    // La dueña del prospecto no completa el enfoque: lo hace quien lo da.
    await http().post(`/api/tareas/${tareaId}/completar`).set(como('ana')).send({ resultado: 'x' }).expect(403);
    // Quien da el enfoque no lo cancela (sí el coordinador o la dueña del prospecto).
    await http().post(`/api/tareas/${tareaId}/cancelar`).set(como('aux')).send({ motivo: 'No puedo' }).expect(403);
    await http().post(`/api/tareas/${tareaId}/completar`).set(como('aux')).send({ resultado: 'Tiene el capítulo I avanzado' }).expect(201);
    const despues = (await http().get(`/api/prospectos/${p.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
    expect(despues.etapa.nombre).toBe('Enfoque realizado');
    expect(despues.eventos.some((e) => e.detalle.includes('automáticamente'))).toBe(true);
  });

  it('detecta choques de horario y permite forzar con motivo', async () => {
    const a = await nuevoProspecto(3, { primeraActividad: enfoque('15:00') });
    const b = await nuevoProspecto(4, { primeraActividad: enfoque('15:30') });
    const participacion = actividad('Enfoque').participaciones.find((x) => x.obligatoria)!.id;
    const asignar = (tareaId: string, motivoForzado?: string) =>
      http().post(`/api/tareas/${tareaId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId: participacion, usuarioId: ids.jefe }], motivoForzado });

    await asignar(a.tareas[0].id).expect(201);
    const choque = await asignar(b.tareas[0].id).expect(409);
    expect(choque.body.choques[0].usuarioId).toBe(ids.jefe);

    const cand = (await http().get(`/api/tareas/${b.tareas[0].id}/candidatos`).set(como('prod')).expect(200)).body;
    const jefe = cand.participaciones[0].candidatos.find((c: { usuario: { id: string } }) => c.usuario.id === ids.jefe);
    expect(jefe.conflictos).toHaveLength(1);

    const forzada = await asignar(b.tareas[0].id, 'El cliente solo puede a esa hora').expect(201);
    expect(forzada.body.responsables[0].forzado).toBe(true);
  });

  it('seguimiento: pide resultado y siguiente paso, cuenta intentos y sugiere perdido', async () => {
    const p = await nuevoProspecto(5, { primeraActividad: { actividadId: actividad('Llamada de seguimiento').id, fecha: diaEnLima() } });
    let tarea = p.tareas[0];
    expect(tarea.estado).toBe('pendiente');
    expect(tarea.responsables[0].usuario.id).toBe(ids.ana);

    const noContesto = catalogos.resultadosContacto.find((r) => r.cuentaSinRespuesta)!.id;
    const llamada = { actividadId: actividad('Llamada de seguimiento').id, fecha: diaEnLima() };

    await http().post(`/api/tareas/${tarea.id}/completar`).set(como('ana')).send({}).expect(400);
    const sinSiguiente = await http().post(`/api/tareas/${tarea.id}/completar`).set(como('ana')).send({ resultadoContactoId: noContesto }).expect(400);
    expect(sinSiguiente.body.errores[0].campo).toBe('siguiente');

    let ultimo: { sugerirPerdido: boolean; intentosSinRespuesta: number } = { sugerirPerdido: false, intentosSinRespuesta: 0 };
    for (let i = 0; i < 3; i++) {
      const res = await http()
        .post(`/api/tareas/${tarea.id}/completar`)
        .set(como('ana'))
        .send({ resultadoContactoId: noContesto, siguiente: llamada })
        .expect(201);
      ultimo = res.body;
      const detalle = (await http().get(`/api/prospectos/${p.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
      tarea = detalle.tareas.find((t) => t.estado === 'pendiente')!;
    }
    expect(ultimo.intentosSinRespuesta).toBe(3);
    expect(ultimo.sugerirPerdido).toBe(true);

    // Marcar perdido desde el mismo cierre del seguimiento cancela lo pendiente.
    const motivo = catalogos.motivosPerdida.find((m) => m.nombre === 'No responde')!.id;
    await http()
      .post(`/api/tareas/${tarea.id}/completar`)
      .set(como('ana'))
      .send({ resultadoContactoId: noContesto, marcarPerdido: { motivoPerdidaId: motivo } })
      .expect(201);
    const perdido = (await http().get(`/api/prospectos/${p.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
    expect(perdido.etapa.clase).toBe('perdida');
    expect(perdido.tareas.filter((t) => ['pendiente', 'por_asignar'].includes(t.estado))).toHaveLength(0);

    // Cerrado: no se programan actividades hasta reactivarlo.
    await http().post(`/api/prospectos/${p.id}/tareas`).set(como('ana')).send(llamada).expect(400);
    await http().patch(`/api/prospectos/${p.id}/etapa`).set(como('ana')).send({ etapaId: etapa('Contactado').id }).expect(200);
    await http().post(`/api/prospectos/${p.id}/tareas`).set(como('ana')).send(llamada).expect(201);
  });

  it('cambios de etapa manuales: perdido pide motivo y convertido no se hace a mano', async () => {
    const p = await nuevoProspecto(6);
    await http().patch(`/api/prospectos/${p.id}/etapa`).set(como('ana')).send({ etapaId: etapa('Cotizado').id }).expect(200);
    await http().patch(`/api/prospectos/${p.id}/etapa`).set(como('ana')).send({ etapaId: etapa('Perdido').id }).expect(400);
    await http().patch(`/api/prospectos/${p.id}/etapa`).set(como('ana')).send({ etapaId: etapa('Convertido').id }).expect(400);
  });

  it('el tablero muestra los prospectos abiertos con su próximo paso', async () => {
    const res = await http().get('/api/seguimiento/tablero').set(como('ana')).expect(200);
    const conEnfoque = res.body.prospectos.find((x: { contactoPrincipal: { celular: string } }) => x.contactoPrincipal.celular === `+51${celular(3)}`);
    expect(conEnfoque.proxima.actividad).toBe('Enfoque');
    expect(conEnfoque.proxima.responsables).toHaveLength(1);
    const sinPaso = res.body.prospectos.find((x: { contactoPrincipal: { celular: string } }) => x.contactoPrincipal.celular === `+51${celular(6)}`);
    expect(sinPaso.proxima).toBeNull();
    expect(res.body.etapas.length).toBeGreaterThan(0);
  });

  it('reprograma y cancela respetando el alcance', async () => {
    const p = await nuevoProspecto(7, { primeraActividad: { actividadId: actividad('Mensaje de seguimiento').id, fecha: diaEnLima() } });
    const tareaId = p.tareas[0].id;
    // Otra persona sin relación con la tarea no la ve.
    await http().post(`/api/tareas/${tareaId}/cancelar`).set(como('aux')).send({ motivo: 'Prueba' }).expect(404);
    const rep = await http().post(`/api/tareas/${tareaId}/reprogramar`).set(como('ana')).send({ fecha: manana, motivo: 'Pidió que lo llamen mañana' }).expect(201);
    expect(rep.body.fecha).toBe(manana);
    expect(rep.body.vecesReprogramada).toBe(1);
    const can = await http().post(`/api/tareas/${tareaId}/cancelar`).set(como('ana')).send({ motivo: 'Ya respondió por WhatsApp' }).expect(201);
    expect(can.body.estado).toBe('cancelada');
  });
});
