/**
 * Pruebas e2e de reasignar la carga de un auxiliar: pasar sus trabajos a otras personas, con lo ya avanzado (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CargaPersona,
  type ImpactoCarga,
  type CatalogoActividades,
  type CatalogosProspecto,
  type ColaPersona,
  type ProspectoDetalle,
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

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'admin' | 'prod' | 'ana' | 'aux' | 'aux2' | 'aux3' | 'jefe';
const ROL: Record<Quien, string> = { admin: 'ADMIN', prod: 'ASIST_PROD', ana: 'ASIST_ADM', aux: 'AUXILIAR', aux2: 'AUXILIAR', aux3: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Reasignar la carga de un auxiliar (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let tareaId: string;
  let entregableId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const cola = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const academicos = await datosAcademicos(prisma);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.crg.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Carga', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body as CatalogoActividades;
    const elaboracion = actividades.actividades.find((a) => a.nombre === 'Elaboración')!;
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
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Carga', email: `ap.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `2${sufijo}1`, esTitular: true }],
          // Plazo muy corto para una tarea muy larga: en horario normal no llega.
          trabajo: { ...academicos, titulo: 'Trabajo apretado', fechaInicio: hoy, fechaLimite: sumarDias(hoy, 4) },
          contrato: { fechaFirma: hoy, montoTotal: 500, formaPago: 'contado', cuotas: [{ monto: 500, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    await http().post(`/api/trabajos/${trabajo.id}/entregables`).set(como('prod')).send({ nombre: 'Entrega final', fechaLimite: sumarDias(hoy, 4), esFinal: true }).expect(201);
    const detalle = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    const conTarea = (await http().post(`/api/entregables/${detalle.entregables[0].id}/tareas`).set(como('prod')).send({ actividadId: elaboracion.id, titulo: 'Capítulo largo', minutosEstimados: 3000 }).expect(201)).body as TrabajoDetalle;
    tareaId = conTarea.entregables[0].tareas[0].id;
    entregableId = detalle.entregables[0].id;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.notificacion.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.registroTiempo.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('solo quien reasigna ve la carga; muestra el trabajo con lo que falta y quién puede tomarlo', async () => {
    await http().get(`/api/produccion/carga/${ids.aux}`).set(como('aux')).expect(403);
    const c = (await http().get(`/api/produccion/carga/${ids.aux}`).set(como('prod')).expect(200)).body as CargaPersona;
    expect(c.trabajos).toHaveLength(1);
    const t = c.trabajos[0];
    expect(t.trabajo.id).toBe(trabajo.id);
    expect(t.bloques[0]).toMatchObject({ tareas: 1, minutosHechos: 0, enProceso: false });
    const elegibles = t.elegibles.map((x) => x.id);
    // Otros auxiliares sí; el dueño no, y el jefe responsable tampoco (elabora y luego revisa).
    expect(elegibles).toEqual(expect.arrayContaining([ids.aux2, ids.aux3]));
    expect(elegibles).not.toContain(ids.aux);
    expect(elegibles).not.toContain(ids.jefe);
    expect(t.sugerido).not.toBeNull();
  });

  it('simula cómo queda en la cola de quien recibe y no cambia nada', async () => {
    const r = (await http().post(`/api/produccion/carga/${ids.aux}/simular`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId: entregableId, usuarioId: ids.aux2 }] }).expect(201)).body as ImpactoCarga;
    expect(r.personas).toHaveLength(1);
    expect(r.personas[0].tareas[0].titulo).toBe('Capítulo largo');
    expect((await cola('aux')).items).toHaveLength(1);
    // A sí mismo o a quien no puede tomarlo se rechaza.
    await http().post(`/api/produccion/carga/${ids.aux}/simular`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId, usuarioId: ids.aux }] }).expect(400);
    await http().post(`/api/produccion/carga/${ids.aux}/simular`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId, usuarioId: ids.jefe }] }).expect(400);
  });

  it('pasa el trabajo con lo avanzado: el tramo abierto se cierra a nombre de quien lo hizo y el resto lo continúa el otro', async () => {
    await http().post(`/api/tareas/${tareaId}/cronometro/iniciar`).set(como('aux')).expect(201);
    await new Promise((r) => setTimeout(r, 1200));
    const r = await http().post(`/api/produccion/carga/${ids.aux}/aplicar`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId, usuarioId: ids.aux2 }], motivo: 'Pasa a otras actividades' }).expect(201);
    expect(r.body).toEqual({ tareas: 1 });
    expect((await cola('aux')).items).toHaveLength(0);
    expect((await cola('aux2')).items.map((i) => i.tareaId)).toContain(tareaId);
    const tramos = await prisma.registroTiempo.findMany({ where: { tareaId } });
    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ usuarioId: ids.aux, autoCerrado: false });
    expect(tramos[0].fin).not.toBeNull();
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: tareaId } })).estado).toBe('pendiente');
    const notificadas = await prisma.notificacion.findMany({ where: { usuarioId: ids.aux2, tipo: 'tarea.reasignada' } });
    expect(notificadas.some((n) => n.titulo.includes('Recibiste 1 tarea'))).toBe(true);
    // Ya no está en su cola: pedir lo mismo otra vez avisa que cambió.
    await http().post(`/api/produccion/carga/${ids.aux}/aplicar`).set(como('prod')).send({ reparto: [{ trabajoId: trabajo.id, entregableId, usuarioId: ids.aux3 }] }).expect(400);
  });
});
