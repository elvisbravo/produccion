/**
 * Pruebas e2e de un trabajo en espera del cliente (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type ColaPersona, type Paginado, type ProspectoDetalle, type TrabajoDetalle, type TrabajoListadoItem } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RecordatoriosService } from '../src/recordatorios/recordatorios.service.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Trabajo en espera del cliente (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const ficha = async () => (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;
  const avisos = (q: Quien, tipo: string) => prisma.notificacion.count({ where: { usuarioId: ids[q], tipo } });
  let tareasDelPlan = 0;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.pa.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Pausa', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
    }
    // La asistente de producción pausa (la base de pruebas puede ser anterior a este permiso: se concede directo).
    const accion = await prisma.accion.findFirstOrThrow({ where: { codigo: 'pausar', modulo: { codigo: 'trabajos' } } });
    await prisma.usuarioPermiso.upsert({
      where: { usuarioId_accionId: { usuarioId: ids.prod, accionId: accion.id } },
      create: { usuarioId: ids.prod, accionId: accion.id, tipo: 'conceder', otorgadoPor: ids.prod },
      update: {},
    });
    for (const q of Object.keys(ROL) as Quien[]) {
      tokens[q] = (await http().post('/api/auth/login').send({ email: `e2e.pa.${q}.${sufijo}@grupoes.local`, password: PASSWORD }).expect(200)).body.accessToken;
    }

    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
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
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Pausa', email: `pa.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `1${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;
    tareasDelPlan = trabajo.entregables.flatMap((e) => e.tareas).length;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('pausar pide qué falta, saca las tareas de la cola y avisa a quienes siguen el trabajo', async () => {
    expect((await colaDe('aux')).items).toHaveLength(tareasDelPlan);
    await http().post(`/api/trabajos/${trabajo.id}/pausar`).set(como('aux')).send({ motivo: 'Falta la matriz de consistencia' }).expect(403);
    await http().post(`/api/trabajos/${trabajo.id}/pausar`).set(como('prod')).send({ motivo: '' }).expect(400);

    const t = (await http().post(`/api/trabajos/${trabajo.id}/pausar`).set(como('prod')).send({ motivo: 'la matriz de consistencia' }).expect(200)).body as TrabajoDetalle;
    expect(t.estado).toBe('suspendido');
    expect(t.pausa).toMatchObject({ motivo: 'la matriz de consistencia', dias: 0, tareasPausadas: tareasDelPlan });
    expect(t.pausa!.por.id).toBe(ids.prod);
    expect(t.seguimiento.principal).toBe('suspendido');
    expect(t.eventos[0]).toMatchObject({ tipo: 'pausa' });

    // Nadie queda en rojo por algo que no puede avanzar: la cola del auxiliar queda sin esas tareas.
    expect((await colaDe('aux')).items).toHaveLength(0);
    expect(await prisma.tarea.count({ where: { trabajoId: trabajo.id, estado: 'en_pausa' } })).toBe(tareasDelPlan);
    // Se avisa a la asistente que sigue al cliente y al equipo, no a quien pausó.
    for (const q of ['ana', 'aux', 'jefe'] as const) expect(await avisos(q, 'trabajo.pausa')).toBe(1);
    expect(await avisos('prod', 'trabajo.pausa')).toBe(0);
  });

  it('mientras espera no se programa ni empieza nada, y se filtra como "en espera del cliente"', async () => {
    await http().post(`/api/trabajos/${trabajo.id}/pausar`).set(como('prod')).send({ motivo: 'otra vez' }).expect(400);
    const tareaId = await prisma.tarea.findFirstOrThrow({ where: { trabajoId: trabajo.id }, select: { id: true } });
    await http().post(`/api/tareas/${tareaId.id}/iniciar`).set(como('aux')).expect(400);
    const entregable = (await ficha()).entregables[0];
    // Con un cuerpo válido: lo que lo rechaza es la espera, no la validación.
    const nueva = await http().post(`/api/entregables/${entregable.id}/tareas`).set(como('prod')).send({ actividadId: (await prisma.actividad.findFirstOrThrow({ where: { nombre: 'Elaboración' } })).id, titulo: 'Extra', minutosEstimados: 60 }).expect(400);
    expect(nueva.body.message).toContain('en espera del cliente');

    const lista = (await http().get(`/api/trabajos?q=${trabajo.codigo}&seguimiento=suspendido`).set(como('prod')).expect(200)).body as Paginado<TrabajoListadoItem>;
    expect(lista.datos.map((x) => x.id)).toEqual([trabajo.id]);
  });

  it('reanudar devuelve el trabajo y sus tareas a la cola', async () => {
    await http().post(`/api/trabajos/${trabajo.id}/reanudar`).set(como('aux')).send({}).expect(403);
    const t = (await http().post(`/api/trabajos/${trabajo.id}/reanudar`).set(como('prod')).send({ nota: 'Mandaron la matriz' }).expect(200)).body as TrabajoDetalle;
    expect(t.estado).toBe('asignado');
    expect(t.pausa).toBeNull();
    expect(t.seguimiento.principal).toBe('programado');
    expect(t.eventos[0].detalle).toContain('Mandaron la matriz');
    expect((await colaDe('aux')).items).toHaveLength(tareasDelPlan);
    await http().post(`/api/trabajos/${trabajo.id}/reanudar`).set(como('prod')).send({}).expect(400);
  });

  it('si sigue detenido, se recuerda cada cierto número de días sin repetir el mismo día', async () => {
    await http().post(`/api/trabajos/${trabajo.id}/pausar`).set(como('prod')).send({ motivo: 'el carné del cliente' }).expect(200);
    const recordatorios = app.get(RecordatoriosService);
    await recordatorios.pausasSinRespuesta();
    expect(await avisos('ana', 'recordatorio.pausa')).toBe(0);

    await prisma.pausaTrabajo.updateMany({ where: { trabajoId: trabajo.id, reanudadaEn: null }, data: { creadaEn: new Date(Date.now() - 4 * 86_400_000) } });
    await recordatorios.pausasSinRespuesta();
    await recordatorios.pausasSinRespuesta();
    expect(await avisos('ana', 'recordatorio.pausa')).toBe(1);
    expect(await avisos('prod', 'recordatorio.pausa')).toBe(1);
    const aviso = await prisma.notificacion.findFirstOrThrow({ where: { usuarioId: ids.ana, tipo: 'recordatorio.pausa' } });
    expect(aviso.titulo).toContain('días en espera del cliente');
  });
});
