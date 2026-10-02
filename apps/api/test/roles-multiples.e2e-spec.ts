/**
 * Pruebas e2e de personas con varios roles (auxiliar y jefe a la vez): pueden revisar el trabajo de otros,
 * pero nunca el propio (base produccion_test).
 */
import { diaEnLima, sumarDias, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'jefe' | 'doble';
/** "doble" tiene los dos roles. */
const ROLES: Record<Quien, string[]> = { ana: ['ASIST_ADM'], prod: ['ASIST_PROD'], aux: ['AUXILIAR'], jefe: ['JEFE_PROD'], doble: ['AUXILIAR', 'JEFE_PROD'] };

describe('Personas con varios roles (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const equipo = (q: Quien, trabajoId: string, datos: object) => http().put(`/api/trabajos/${trabajoId}/equipo`).set(como(q)).send(datos);

  /** Un trabajo de tesis nuevo, con su plan de entregables sin armar aún el equipo. */
  async function nuevoTrabajo(n: number): Promise<TrabajoDetalle> {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t: { nombre: string }) => t.nombre === 'Tesis').id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    return (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: `Roles ${n}`, email: `r${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `${n}${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
  }

  /** Arma el equipo, genera el plan, hace la primera tarea del primer entregable y lo envía a revisión. */
  async function hastaRevision(trabajo: TrabajoDetalle, auxiliar: Quien, jefe: Quien) {
    await equipo('prod', trabajo.id, { auxiliarPrincipalId: ids[auxiliar], auxiliaresApoyo: [], jefeResponsableId: ids[jefe] }).expect(200);
    const conPlan = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body as TrabajoDetalle;
    const entregable = conPlan.entregables[0];
    for (const t of entregable.tareas) {
      await http().post(`/api/tareas/${t.id}/iniciar`).set(como(auxiliar)).expect(201);
      await http().post(`/api/tareas/${t.id}/completar`).set(como(auxiliar)).send({ resultado: 'Hecho' }).expect(201);
    }
    await http().post(`/api/entregables/${entregable.id}/enviar-revision`).set(como(auxiliar)).expect(201);
    return entregable.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROLES) as Quien[]) {
      const email = `e2e.rm.${q}.${sufijo}@grupoes.local`;
      const roles = await prisma.rol.findMany({ where: { codigo: { in: ROLES[q] } } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Roles', email, passwordHash: await hashPassword(PASSWORD), roles: { create: roles.map((r) => ({ rolId: r.id })) } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('en un mismo trabajo, el jefe responsable no puede ser también auxiliar', async () => {
    const t = await nuevoTrabajo(1);
    const principal = await equipo('prod', t.id, { auxiliarPrincipalId: ids.doble, auxiliaresApoyo: [], jefeResponsableId: ids.doble }).expect(400);
    expect(JSON.stringify(principal.body)).toContain('jefeResponsableId');
    const apoyo = await equipo('prod', t.id, { auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [ids.doble], jefeResponsableId: ids.doble }).expect(400);
    expect(JSON.stringify(apoyo.body)).toContain('jefeResponsableId');
    // Con dos personas distintas sí se puede: quien tiene ambos roles hace una función por trabajo.
    await equipo('prod', t.id, { auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.doble }).expect(200);
    const t2 = await nuevoTrabajo(2);
    await equipo('prod', t2.id, { auxiliarPrincipalId: ids.doble, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
  });

  it('quien es auxiliar y jefe puede revisar el trabajo de otros', async () => {
    const t = await nuevoTrabajo(3);
    const entregableId = await hastaRevision(t, 'aux', 'doble');
    await http().post(`/api/entregables/${entregableId}/revisar`).set(como('doble')).send({ resultado: 'aprobado' }).expect(201);
  });

  it('pero no puede revisar un entregable que él mismo elaboró; otro jefe sí', async () => {
    const t = await nuevoTrabajo(4);
    const entregableId = await hastaRevision(t, 'doble', 'jefe');
    // Tiene el permiso de revisar (por su rol de jefe) y está en el equipo, pero el entregable es suyo.
    const r = await http().post(`/api/entregables/${entregableId}/revisar`).set(como('doble')).send({ resultado: 'aprobado' }).expect(403);
    expect(r.body.message).toContain('en cuya elaboración participaste');
    const intacto = (await http().get(`/api/trabajos/${t.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(intacto.entregables[0].estado).toBe('en_revision');
    // El jefe responsable, que no lo elaboró, sí lo revisa.
    await http().post(`/api/entregables/${entregableId}/revisar`).set(como('jefe')).send({ resultado: 'aprobado' }).expect(201);
    const aprobado = (await http().get(`/api/trabajos/${t.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(aprobado.entregables[0].estado).toBe('aprobado');
  });
});
