/**
 * Pruebas e2e del reparto de una urgencia entre varios auxiliares (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CatalogosProspecto,
  type ColaPersona,
  type ImpactoReparto,
  type ImpactoUrgente,
  type ProspectoDetalle,
  type PropuestaUrgente,
  type SolicitudUrgenteItem,
  type TrabajoDetalle,
} from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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

type Quien = 'ana' | 'prod' | 'aux' | 'aux2' | 'aux3' | 'jefe' | 'doble';
/** "doble" es auxiliar y jefe a la vez; aquí es el jefe responsable del trabajo. */
const ROLES: Record<Quien, string[]> = {
  ana: ['ASIST_ADM'],
  prod: ['ASIST_PROD'],
  aux: ['AUXILIAR'],
  aux2: ['AUXILIAR'],
  aux3: ['AUXILIAR'],
  jefe: ['JEFE_PROD'],
  doble: ['AUXILIAR', 'JEFE_PROD'],
};

describe('Reparto de una urgencia (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let urgenteId: string;
  let propuesta: PropuestaUrgente;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;
  const simular = (reparto: object) => http().post(`/api/urgentes/${urgenteId}/simular`).set(como('prod')).send({ reparto });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROLES) as Quien[]) {
      const email = `e2e.ur.${q}.${sufijo}@grupoes.local`;
      const roles = await prisma.rol.findMany({ where: { codigo: { in: ROLES[q] } } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Reparto', email, passwordHash: await hashPassword(PASSWORD), roles: { create: roles.map((r) => ({ rolId: r.id })) } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }

    // Una tesis con su plan: todas las tareas en la cola de "aux"; "doble" es su jefe responsable.
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
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
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Reparto', email: `u.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `5${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 150) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.doble }).expect(200);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;
    // Cada tarea de unas 20 horas: así repartir sí adelanta la entrega.
    await prisma.tarea.updateMany({ where: { trabajoId: trabajo.id }, data: { minutosEstimados: 1200 } });
    urgenteId = (await http().post(`/api/trabajos/${trabajo.id}/urgente`).set(como('ana')).send({ motivo: 'El cliente adelantó la entrega' }).expect(201)).body.id;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('propone los entregables, quién puede tomar cada uno y un reparto que no usa al jefe del trabajo', async () => {
    await http().get(`/api/urgentes/${urgenteId}/propuesta`).set(como('ana')).expect(403);
    propuesta = (await http().get(`/api/urgentes/${urgenteId}/propuesta`).set(como('prod')).expect(200)).body;
    expect(propuesta.bloques.length).toBeGreaterThanOrEqual(2);
    for (const b of propuesta.bloques) {
      const elegibles = b.elegibles.map((u) => u.id);
      expect(elegibles).toEqual(expect.arrayContaining([ids.aux, ids.aux2, ids.aux3]));
      // El jefe responsable no elabora lo que luego revisa (otros jefes sí pueden cubrir, como siempre).
      expect(elegibles).not.toContain(ids.doble);
      expect(b.responsableActual?.id).toBe(ids.aux);
    }
    const usados = new Set(propuesta.sugerencia.map((r) => r.usuarioId));
    expect(propuesta.sugerencia).toHaveLength(propuesta.bloques.length);
    expect(usados.size).toBeGreaterThanOrEqual(2);
    expect(usados.size).toBeLessThanOrEqual(4);
    expect(usados.has(ids.doble)).toBe(false);
  });

  it('repartir termina antes que dárselo todo a una persona, y la simulación muestra cada cola', async () => {
    const todoAUno = (await http().get(`/api/urgentes/${urgenteId}/impacto?usuarioId=${ids.aux2}`).set(como('prod')).expect(200)).body as ImpactoUrgente;
    const finUno = todoAUno.items.filter((i) => i.esUrgente).map((i) => i.despues.fin!).sort().at(-1)!;

    const r = (await simular(propuesta.sugerencia).expect(200)).body as ImpactoReparto;
    expect(r.personas.map((p) => p.usuario.id).sort()).toEqual([...new Set(propuesta.sugerencia.map((x) => x.usuarioId))].sort());
    for (const p of r.personas) {
      expect(p.items[0].esUrgente).toBe(true);
      expect(p.entregables.length).toBeGreaterThan(0);
    }
    expect(r.terminaEl).not.toBeNull();
    expect(r.terminaEl! < finUno).toBe(true);
  });

  it('valida el reparto: completo, con personas que pueden, sin el jefe del trabajo y con un máximo', async () => {
    const [primero, ...resto] = propuesta.bloques;
    // Falta un entregable.
    await simular(resto.map((b) => ({ entregableId: b.entregableId, usuarioId: ids.aux }))).expect(400);
    // El jefe responsable no puede elaborar lo que revisa.
    const conJefe = await simular([{ entregableId: primero.entregableId, usuarioId: ids.doble }, ...resto.map((b) => ({ entregableId: b.entregableId, usuarioId: ids.aux }))]).expect(400);
    expect(conJefe.body.message).toContain('jefe responsable');
    // Quien no es de producción no puede tomar nada.
    await simular(propuesta.bloques.map((b) => ({ entregableId: b.entregableId, usuarioId: ids.ana }))).expect(400);
    // Más de 4 personas distintas.
    const cinco = [ids.aux, ids.aux2, ids.aux3, ids.jefe, ids.doble].map((usuarioId) => ({ entregableId: randomUUID(), usuarioId }));
    expect(JSON.stringify((await simular(cinco).expect(400)).body)).toContain('4 personas');
    // Ejecutar exige uno u otro, no ambos.
    await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({ usuarioId: ids.aux, reparto: propuesta.sugerencia }).expect(400);
    await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({}).expect(400);
  });

  it('al ejecutar, cada persona recibe sus entregables primero en su cola, entra al equipo y se le avisa', async () => {
    const s = (await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({ reparto: propuesta.sugerencia, observacion: 'Repartida' }).expect(201)).body as SolicitudUrgenteItem;
    const usados = [...new Set(propuesta.sugerencia.map((r) => r.usuarioId))];
    expect(s.estado).toBe('ejecutada');
    expect(s.asignaciones.map((a) => a.usuario.id).sort()).toEqual([...usados].sort());
    expect(s.asignaciones.reduce((n, a) => n + a.tareas, 0)).toBe(propuesta.bloques.reduce((n, b) => n + b.tareas, 0));

    const quien = (uid: string) => (Object.keys(ids) as Quien[]).find((q) => ids[q] === uid)!;
    for (const uid of usados) {
      const tareasSuyas = propuesta.sugerencia.filter((r) => r.usuarioId === uid).reduce((n, r) => n + propuesta.bloques.find((b) => b.entregableId === r.entregableId)!.tareas, 0);
      const cola = await colaDe(quien(uid));
      expect(cola.items.slice(0, tareasSuyas).every((i) => i.trabajo.id === trabajo.id)).toBe(true);
      expect(cola.items.filter((i) => i.trabajo.id === trabajo.id)).toHaveLength(tareasSuyas);
      expect(await prisma.notificacion.count({ where: { usuarioId: uid, tipo: 'urgente.en_tu_cola' } })).toBe(1);
    }
    const t = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    // Los auxiliares entran al equipo como apoyo; un jefe que cubre no se suma como auxiliar.
    for (const uid of usados.filter((u) => u !== ids.jefe)) expect(t.equipo.some((m) => m.usuario.id === uid)).toBe(true);
    expect(t.equipo.some((m) => m.usuario.id === ids.jefe && m.funcion === 'auxiliar_apoyo')).toBe(false);
    expect(t.eventos[0].detalle).toContain('las colas de');
    await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({ reparto: propuesta.sugerencia }).expect(400);
  });
});
