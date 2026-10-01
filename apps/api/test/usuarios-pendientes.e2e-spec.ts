/**
 * Pruebas e2e del aviso de pendientes antes de desactivar a un usuario (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type PendientesUsuario, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'aux' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Pendientes de un usuario (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const pendientes = async (q: Quien) => (await http().get(`/api/usuarios/${ids[q]}/pendientes`).set(como('admin')).expect(200)).body as PendientesUsuario;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.pe.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Pendientes', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const nuevoProspecto = async (n: number) =>
      (
        await http()
          .post('/api/prospectos')
          .set(como('ana'))
          .send({
            tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
            prioridadId: catalogos.prioridades[0].id,
            origenId: catalogos.origenes[0].id,
            contactos: [{ celular: celular(n), esPrincipal: true }],
          })
          .expect(201)
      ).body as ProspectoDetalle;
    // Un prospecto convertido en trabajo (con equipo y plan) y otro que sigue abierto.
    const p = await nuevoProspecto(1);
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Pendientes', email: `pe.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;
    await nuevoProspecto(2);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('el auxiliar tiene las tareas de su cola y el trabajo en su equipo', async () => {
    const p = await pendientes('aux');
    const tareasPlan = trabajo.entregables.flatMap((e) => e.tareas).length;
    expect(p.tareas).toEqual({ total: tareasPlan, enCola: tareasPlan, conHora: 0 });
    expect(p.trabajos).toEqual([{ id: trabajo.id, codigo: trabajo.codigo, titulo: trabajo.titulo, funcion: 'auxiliar_principal' }]);
    expect(p.prospectos).toBe(0);
    expect(p.total).toBe(tareasPlan + 1);
  });

  it('el jefe responsable tiene el trabajo aunque aún no tenga tareas', async () => {
    const p = await pendientes('jefe');
    expect(p.tareas.total).toBe(0);
    expect(p.trabajos).toMatchObject([{ codigo: trabajo.codigo, funcion: 'jefe_responsable' }]);
  });

  it('la asistente tiene a su cargo solo los prospectos abiertos (el convertido ya es un trabajo)', async () => {
    const p = await pendientes('ana');
    expect(p).toMatchObject({ prospectos: 1, tareas: { total: 0 }, trabajos: [] });
  });

  it('quien no tiene nada pendiente aparece vacío; ver los pendientes exige poder desactivar', async () => {
    expect(await pendientes('prod')).toEqual({ tareas: { total: 0, enCola: 0, conHora: 0 }, trabajos: [], prospectos: 0, total: 0 });
    await http().get(`/api/usuarios/${ids.aux}/pendientes`).set(como('prod')).expect(403);
  });

  it('un trabajo cancelado deja de contar', async () => {
    await prisma.trabajo.update({ where: { id: trabajo.id }, data: { estado: 'cancelado' } });
    expect((await pendientes('jefe')).trabajos).toEqual([]);
  });
});
