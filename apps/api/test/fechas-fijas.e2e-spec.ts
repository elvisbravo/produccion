/**
 * Pruebas e2e de los trabajos con fechas inamovibles (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CatalogosProspecto,
  type ColaPersona,
  type ImpactoReparto,
  type Paginado,
  type ProspectoDetalle,
  type PropuestaUrgente,
  type TrabajoDetalle,
  type TrabajoListadoItem,
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

type Quien = 'ana' | 'prod' | 'prod2' | 'aux' | 'aux2' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', prod2: 'ASIST_PROD', aux: 'AUXILIAR', aux2: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Fechas inamovibles (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let fijo: TrabajoDetalle;
  let libre: TrabajoDetalle;
  let urgente: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const ficha = async (t: TrabajoDetalle) => (await http().get(`/api/trabajos/${t.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;

  async function nuevoTrabajo(n: number, auxiliar: Quien): Promise<TrabajoDetalle> {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    const t = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: `Fijas ${n}`, email: `ff${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `${n}${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 40) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await http().put(`/api/trabajos/${t.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids[auxiliar], auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    return (await http().post(`/api/trabajos/${t.id}/plan`).set(como('prod')).expect(201)).body as TrabajoDetalle;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.ff.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Fijas', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
    }
    // "prod" puede fijar fechas; "prod2" no (aunque su rol lo ofrezca, aquí se le niega) para probar los límites.
    const accion = await prisma.accion.findFirstOrThrow({ where: { codigo: 'fijar_fechas', modulo: { codigo: 'trabajos' } } });
    const pausar = await prisma.accion.findFirstOrThrow({ where: { codigo: 'pausar', modulo: { codigo: 'trabajos' } } });
    await prisma.usuarioPermiso.create({ data: { usuarioId: ids.prod, accionId: accion.id, tipo: 'conceder', otorgadoPor: ids.prod } });
    await prisma.usuarioPermiso.create({ data: { usuarioId: ids.prod2, accionId: accion.id, tipo: 'denegar', otorgadoPor: ids.prod } });
    await prisma.usuarioPermiso.create({ data: { usuarioId: ids.prod, accionId: pausar.id, tipo: 'conceder', otorgadoPor: ids.prod } });
    for (const q of Object.keys(ROL) as Quien[]) {
      tokens[q] = (await http().post('/api/auth/login').send({ email: `e2e.ff.${q}.${sufijo}@grupoes.local`, password: PASSWORD }).expect(200)).body.accessToken;
    }

    fijo = await nuevoTrabajo(1, 'aux');
    libre = await nuevoTrabajo(2, 'aux');
    urgente = await nuevoTrabajo(3, 'aux2');
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('fijar y liberar exigen permiso y motivo; se avisa al equipo y queda en el historial', async () => {
    await http().post(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('aux')).send({ motivo: 'Sustenta el 15' }).expect(403);
    await http().post(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod2')).send({ motivo: 'Sustenta el 15' }).expect(403);
    await http().post(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod')).send({ motivo: '' }).expect(400);

    const t = (await http().post(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod')).send({ motivo: 'La universidad fijó la sustentación' }).expect(200)).body as TrabajoDetalle;
    expect(t.fechasFijas).toMatchObject({ motivo: 'La universidad fijó la sustentación' });
    expect(t.fechasFijas!.por!.id).toBe(ids.prod);
    expect(t.eventos[0].detalle).toContain('Fechas inamovibles');
    const lista = (await http().get(`/api/trabajos?q=${fijo.codigo}`).set(como('prod')).expect(200)).body as Paginado<TrabajoListadoItem>;
    expect(lista.datos[0].fechasFijas).toBe(true);
    for (const q of ['ana', 'aux', 'jefe'] as const) expect(await prisma.notificacion.count({ where: { usuarioId: ids[q], tipo: 'trabajo.fechas_fijas' } })).toBe(1);
    await http().post(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod')).send({ motivo: 'otra vez' }).expect(400);
  });

  it('con fechas fijas no se cambia la fecha de un entregable ni se reprograma su tarea', async () => {
    const e = (await ficha(fijo)).entregables[1];
    const distinta = sumarDias(e.fechaLimite, -2) < hoy ? sumarDias(e.fechaLimite, 1) : sumarDias(e.fechaLimite, -2);
    const bloqueada = await http().put(`/api/entregables/${e.id}`).set(como('prod')).send({ nombre: e.nombre, fechaLimite: distinta, esFinal: e.esFinal }).expect(403);
    expect(bloqueada.body.message).toContain('están fijadas');
    expect(bloqueada.body.message).toContain('La universidad fijó la sustentación');
    // Cambiar solo el nombre sí se puede (la fecha queda igual).
    await http().put(`/api/entregables/${e.id}`).set(como('prod')).send({ nombre: `${e.nombre} (revisado)`, fechaLimite: e.fechaLimite, esFinal: e.esFinal }).expect(200);

    const tarea = (await ficha(fijo)).entregables[0].tareas[0];
    const r = await http().post(`/api/tareas/${tarea.id}/reprogramar`).set(como('prod')).send({ fecha: sumarDias(hoy, 20), motivo: 'prueba' });
    expect(r.status).toBe(403);
    expect(r.body.message).toContain('están fijadas');
  });

  it('en la cola, sus tareas no se dejan detrás de las de otro trabajo', async () => {
    const cola = await colaDe('aux');
    const delFijo = cola.items.filter((i) => i.trabajo.id === fijo.id);
    const delLibre = cola.items.filter((i) => i.trabajo.id === libre.id);
    expect(delFijo.every((i) => i.trabajo.fechasFijas)).toBe(true);
    expect(delLibre.every((i) => !i.trabajo.fechasFijas)).toBe(true);

    // Poner una tarea del trabajo libre antes de las del fijo las atrasa: no se puede.
    const orden = cola.items.map((i) => i.tareaId);
    const primeraDelFijo = orden.indexOf(delFijo[0].tareaId);
    const delante = delLibre.find((i) => orden.indexOf(i.tareaId) > primeraDelFijo);
    if (delante) {
      const nuevo = orden.filter((id) => id !== delante.tareaId);
      nuevo.splice(primeraDelFijo, 0, delante.tareaId);
      const r = await http().put(`/api/produccion/colas/${ids.aux}/orden`).set(como('prod')).send({ tareaIds: nuevo });
      expect(r.status).toBe(403);
      expect(r.body.message).toContain('están fijadas');
    }
    // El orden sugerido pone primero lo de fechas fijas (después de lo que está en proceso).
    await http().post(`/api/produccion/colas/${ids.aux}/orden-sugerido`).set(como('prod')).expect(204);
    const sugerida = (await colaDe('aux')).items;
    const ultimaDelFijo = Math.max(...sugerida.map((i, n) => (i.trabajo.id === fijo.id ? n : -1)));
    const primeraDelLibre = sugerida.findIndex((i) => i.trabajo.id === libre.id);
    expect(ultimaDelFijo).toBeLessThan(primeraDelLibre);
  });

  it('una urgencia no puede atrasar un trabajo con fechas fijas salvo que quien puede fijarlas lo acepte', async () => {
    // El trabajo fijo tiene que entregarse en 30 días y le caben justo; la urgencia son tres tareas enormes.
    await prisma.entregable.updateMany({ where: { trabajoId: fijo.id }, data: { fechaLimite: new Date(`${sumarDias(hoy, 30)}T00:00:00Z`) } });
    await prisma.trabajo.update({ where: { id: fijo.id }, data: { fechaLimite: new Date(`${sumarDias(hoy, 30)}T00:00:00Z`) } });
    await prisma.tarea.updateMany({ where: { trabajoId: fijo.id }, data: { minutosEstimados: 300 } });
    await prisma.tarea.updateMany({ where: { trabajoId: libre.id }, data: { minutosEstimados: 15 } });
    await prisma.tarea.updateMany({ where: { trabajoId: urgente.id }, data: { minutosEstimados: 3000 } });
    const solicitud = (await http().post(`/api/trabajos/${urgente.id}/urgente`).set(como('ana')).send({ motivo: 'El cliente adelantó la entrega' }).expect(201)).body;
    const propuesta = (await http().get(`/api/urgentes/${solicitud.id}/propuesta`).set(como('prod')).expect(200)).body as PropuestaUrgente;
    const todoAAux = propuesta.bloques.map((b) => ({ entregableId: b.entregableId, usuarioId: ids.aux }));

    const impacto = (await http().post(`/api/urgentes/${solicitud.id}/simular`).set(como('prod')).send({ reparto: todoAAux }).expect(200)).body as ImpactoReparto;
    expect(impacto.pasanFijasARojo).toBeGreaterThan(0);
    expect(impacto.trabajosFijosAfectados).toEqual([fijo.codigo]);
    expect(impacto.personas[0].items.some((i) => i.fija)).toBe(true);

    // Sin aceptarlo, no se ejecuta; quien no puede fijar fechas tampoco puede forzarlo.
    const rechazada = await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('prod')).send({ reparto: todoAAux }).expect(400);
    expect(rechazada.body.message).toContain(fijo.codigo);
    await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('prod2')).send({ reparto: todoAAux, forzarFechasFijas: true }).expect(403);

    // Repartir hacia otra persona deja de afectarlo: el aviso desaparece.
    const aOtra = propuesta.bloques.map((b) => ({ entregableId: b.entregableId, usuarioId: ids.aux2 }));
    expect(((await http().post(`/api/urgentes/${solicitud.id}/simular`).set(como('prod')).send({ reparto: aOtra }).expect(200)).body as ImpactoReparto).pasanFijasARojo).toBe(0);

    // Quien puede fijar fechas lo acepta de forma expresa y queda constancia.
    await http().post(`/api/urgentes/${solicitud.id}/ejecutar`).set(como('prod')).send({ reparto: todoAAux, forzarFechasFijas: true, observacion: 'Lo autorizó gerencia' }).expect(201);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'ejecutar_urgente', entidadId: solicitud.id } });
    expect(JSON.stringify(auditoria.despues)).toContain(fijo.codigo);
  });

  it('al liberar las fechas, ya se pueden mover', async () => {
    await http().delete(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('aux')).expect(403);
    const t = (await http().delete(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(t.fechasFijas).toBeNull();
    await http().delete(`/api/trabajos/${fijo.id}/fechas-fijas`).set(como('prod')).expect(400);
    const e = (await ficha(fijo)).entregables[1];
    await http().put(`/api/entregables/${e.id}`).set(como('prod')).send({ nombre: e.nombre, fechaLimite: sumarDias(hoy, 25), esFinal: e.esFinal }).expect(200);
  });
});
